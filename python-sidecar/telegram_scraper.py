from __future__ import annotations

import asyncio
import time

from telethon import utils
from telethon.errors import FloodWaitError
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.messages import ExportChatInviteRequest, GetFullChatRequest
from telethon.tl.types import (
    Channel,
    ChannelParticipantAdmin,
    ChannelParticipantCreator,
    ChannelParticipantsAdmins,
    Chat,
    ChatParticipantAdmin,
    ChatParticipantCreator,
)

from telegram_human_delay import (
    flood_wait_seconds,
    jitter_seconds,
    max_floodwait_auto_sleep,
    merge_delay,
)
from telegram_login import SESSIONS, restore_telegram_session, tg_session_lock

DEVICE_GROUP_TARGET_MAX = 6000
# Jeda antar grup (~2s) + ban safety.
_SCRAPE_DELAY = merge_delay(
    {
        "scrape_between_groups_sec": 1.5,
        "scrape_invite_gap_sec": 2.0,
        "max_floodwait_auto_sleep_sec": 120,
    }
)

_scrape_progress: dict[str, dict] = {}
_scrape_cancel_requests: set[str] = set()
# Hasil scrape terakhir / checkpoint parsial — pulih jika HTTP Electron putus mid-scrape.
_scrape_results: dict[str, dict] = {}
_scrape_tasks: dict[str, asyncio.Task] = {}


class ScrapeCancelled(Exception):
    """Operator cancel — termasuk mid FloodWait / long await."""


def request_scrape_cancel(session_id: str) -> None:
    _scrape_cancel_requests.add(session_id)


def clear_scrape_cancel(session_id: str) -> None:
    _scrape_cancel_requests.discard(session_id)


def is_scrape_cancelled(session_id: str) -> bool:
    return session_id in _scrape_cancel_requests


def _cancelled_payload(session_id: str, groups: list | None = None) -> dict:
    clear_scrape_cancel(session_id)
    clear_scrape_progress(session_id)
    rows = list(groups or [])
    payload = {
        "status": "cancelled",
        "message": "SCRAPER_CANCELLED",
        "groups": rows,
        "count": len(rows),
    }
    if rows:
        # Cancel mid-way — simpan parsial agar Electron bisa commit, bukan buang 500+ grup.
        payload["hint"] = "PARTIAL_BEFORE_CANCEL"
        set_scrape_result(session_id, {**payload, "status": "ok", "partial": True})
    return payload


def clear_scrape_progress(session_id: str) -> None:
    _scrape_progress.pop(session_id, None)


def set_scrape_result(session_id: str, payload: dict) -> None:
    _scrape_results[session_id] = dict(payload)


def get_scrape_result(session_id: str) -> dict | None:
    row = _scrape_results.get(session_id)
    return dict(row) if row else None


def clear_scrape_result(session_id: str) -> None:
    _scrape_results.pop(session_id, None)


def set_scrape_progress(
    session_id: str,
    *,
    phase: str,
    current: int = 0,
    total: int = 0,
    label: str = "",
) -> None:
    prev = _scrape_progress.get(session_id) or {}
    seq = int(prev.get("seq") or 0) + 1
    _scrape_progress[session_id] = {
        "phase": phase,
        "current": current,
        "total": total,
        "label": label,
        "seq": seq,
    }


def get_scrape_progress(session_id: str) -> dict:
    return _scrape_progress.get(
        session_id,
        {"phase": "idle", "current": 0, "total": 0, "label": "", "seq": 0},
    )


async def _sleep_flood_with_heartbeat(
    session_id: str,
    seconds: float,
    *,
    current: int = 0,
    total: int = 0,
    label_base: str = "FloodWait",
) -> None:
    """Sleep FloodWait sambil update progress — idle watchdog Electron tetap hidup. """
    remaining = max(0.0, float(seconds))
    while remaining > 0:
        if is_scrape_cancelled(session_id):
            return
        set_scrape_progress(
            session_id,
            phase="group",
            current=current,
            total=total,
            label=f"{label_base} — waiting {int(remaining)}s (Telegram rate limit)",
        )
        chunk = min(15.0, remaining)
        await asyncio.sleep(chunk)
        remaining -= chunk
    if is_scrape_cancelled(session_id):
        raise ScrapeCancelled()


async def _await_with_progress_heartbeat(
    session_id: str,
    awaitable,
    *,
    phase: str = "discover",
    label: str = "Working…",
):
    """Jalankan awaitable sambil emit progress tiap 15s — cegah idle watchdog putus diam."""
    stop = asyncio.Event()

    async def _heartbeat() -> None:
        elapsed = 0
        while not stop.is_set():
            if is_scrape_cancelled(session_id):
                return
            set_scrape_progress(
                session_id,
                phase=phase,
                label=f"{label} ({elapsed}s)",
            )
            try:
                await asyncio.wait_for(stop.wait(), timeout=15.0)
            except asyncio.TimeoutError:
                elapsed += 15

    task = asyncio.create_task(_heartbeat())
    try:
        return await awaitable
    finally:
        stop.set()
        try:
            await task
        except Exception:  # noqa: BLE001
            pass


def _admin_label(is_admin: bool) -> str:
    return "yes" if is_admin else "no"


def _normalize_phone_digits(raw: str) -> str:
    return "".join(ch for ch in raw if ch.isdigit())


def _phones_match(a: str, b: str) -> bool:
    da = _normalize_phone_digits(a)
    db = _normalize_phone_digits(b)
    if not da or not db:
        return False
    return da == db or da.endswith(db) or db.endswith(da)


def _assert_telegram_account_match(me, expected_phone: str | None) -> str:
    me_label = me.username or me.phone or str(me.id)
    exp = (expected_phone or "").strip()
    if not exp:
        return me_label
    me_phone = me.phone or ""
    if me_phone and not _phones_match(me_phone, exp):
        raise ValueError(
            f"TG_ACCOUNT_MISMATCH: Telegram logged in as {me_label} (phone {me_phone}), "
            f"expected {exp}. Clear session and log in again."
        )
    return me_label


def _link_from_exported_invite(exported) -> str | None:
    if exported is None:
        return None
    link = getattr(exported, "link", None)
    value = str(link).strip() if link else ""
    if value.startswith("http://") or value.startswith("https://") or value.startswith("t.me/"):
        return value
    return None


async def _fetch_full_meta(client, entity) -> tuple[int, str | None]:
    """Satu GetFull* → (participants_count, exported_invite URL).

    GetFullChannel/GetFullChat dulu (Lonami),
    bukan get_participants (sering ChatAdminRequired / 0 untuk member biasa).
    """
    try:
        if isinstance(entity, Channel):

            async def _full_channel():
                return await client(GetFullChannelRequest(channel=entity))

            full = await _count_with_flood_retry(_full_channel, label="full_channel")
            count = int(getattr(full.full_chat, "participants_count", 0) or 0)
            invite = _link_from_exported_invite(getattr(full.full_chat, "exported_invite", None))
            return count, invite

        if isinstance(entity, Chat):

            async def _full_chat():
                return await client(GetFullChatRequest(chat_id=entity.id))

            full = await _count_with_flood_retry(_full_chat, label="full_chat")
            count = getattr(full.full_chat, "participants_count", None)
            if isinstance(count, int) and count > 0:
                member_count = count
            else:
                participants = getattr(full.full_chat, "participants", None)
                rows = getattr(participants, "participants", None) or []
                member_count = len(rows) if rows else 0
            invite = _link_from_exported_invite(getattr(full.full_chat, "exported_invite", None))
            return member_count, invite
    except FloodWaitError:
        raise
    except Exception:  # noqa: BLE001
        pass
    return 0, None


async def _resolve_member_count(client, entity) -> tuple[int, str | None]:
    """Return (member_count, exported_invite_or_none). GetFull dulu; get_participants last resort."""
    cached = getattr(entity, "participants_count", None)
    cached_count = cached if isinstance(cached, int) and cached > 0 else 0

    try:
        full_count, full_invite = await _fetch_full_meta(client, entity)
    except FloodWaitError:
        full_count, full_invite = 0, None

    if full_count > 0:
        return full_count, full_invite
    if cached_count > 0:
        return cached_count, full_invite

    # Last resort — sering gagal untuk non-admin; jangan andalkan sebagai primary.
    try:

        async def _participants_total():
            participants = await client.get_participants(entity, limit=0)
            return int(participants.total or 0)

        total = await _count_with_flood_retry(_participants_total, label="members")
        if total > 0:
            return total, full_invite
    except FloodWaitError:
        pass
    except Exception:  # noqa: BLE001
        pass

    return 0, full_invite


def _is_group_dialog(dialog) -> bool:
    entity = dialog.entity
    is_group = dialog.is_group
    is_megagroup = isinstance(entity, Channel) and bool(getattr(entity, "megagroup", False))
    return bool(is_group or is_megagroup)


async def _is_me_listed_as_admin(client, entity, me) -> bool:
    """Fallback bila get_permissions gagal (grup biasa / megagroup)."""
    try:
        async for user in client.iter_participants(
            entity,
            filter=ChannelParticipantsAdmins,
        ):
            if user.id != me.id:
                continue
            participant = getattr(user, "participant", None)
            if isinstance(participant, (ChannelParticipantCreator, ChannelParticipantAdmin)):
                return True
            if getattr(user, "is_creator", False) or getattr(user, "admin_rights", None):
                return True
    except Exception:  # noqa: BLE001
        pass

    if isinstance(entity, Chat):
        try:
            full = await client(GetFullChatRequest(chat_id=entity.id))
            participants = getattr(full.full_chat, "participants", None)
            for p in getattr(participants, "participants", []) or []:
                if getattr(p, "user_id", None) != me.id:
                    continue
                if isinstance(p, (ChatParticipantCreator, ChatParticipantAdmin)):
                    return True
        except Exception:  # noqa: BLE001
            pass

    return False


async def _is_group_admin(client, entity, me) -> bool:
    try:
        perms = await client.get_permissions(entity, me)
        if perms.is_admin or perms.is_creator:
            return True
    except Exception:  # noqa: BLE001
        pass

    return await _is_me_listed_as_admin(client, entity, me)


async def _resolve_invite_link(
    client,
    entity,
    username: str | None,
    *,
    is_admin: bool,
    existing_invite: str | None = None,
    session_id: str | None = None,
    current: int = 0,
    total: int = 0,
) -> str | None:
    """Username → t.me; admin: pakai exported_invite dari GetFull dulu, baru ExportChatInvite."""
    if username:
        return f"https://t.me/{username}"
    if existing_invite:
        return existing_invite
    # Export hanya jika admin (non-admin biasanya gagal / spam API).
    if not is_admin:
        return None
    delay_cfg = _SCRAPE_DELAY
    retries = 2
    for attempt in range(1, retries + 1):
        try:
            exported = await client(ExportChatInviteRequest(peer=entity))
            value = _link_from_exported_invite(exported)
            if value:
                await asyncio.sleep(
                    jitter_seconds(float(delay_cfg.get("scrape_invite_gap_sec", 2.0)), delay_cfg)
                )
                return value
            return None
        except FloodWaitError as exc:
            cap = max_floodwait_auto_sleep(delay_cfg)
            if int(exc.seconds) > cap:
                print(f"[tg-scrape] invite FloodWait {exc.seconds}s exceeds cap — skip")
                return None
            wait_s = flood_wait_seconds(delay_cfg, exc.seconds)
            if session_id:
                await _sleep_flood_with_heartbeat(
                    session_id,
                    wait_s,
                    current=current,
                    total=total,
                    label_base="invite FloodWait",
                )
            else:
                await asyncio.sleep(wait_s)
            if session_id and is_scrape_cancelled(session_id):
                raise ScrapeCancelled()
            if attempt >= retries:
                return None
        except ScrapeCancelled:
            raise
        except Exception:  # noqa: BLE001
            return None
    return None


async def _count_with_flood_retry(
    coro_factory,
    *,
    label: str,
    session_id: str | None = None,
    current: int = 0,
    total: int = 0,
):
    delay_cfg = _SCRAPE_DELAY
    try:
        return await coro_factory()
    except FloodWaitError as exc:
        cap = max_floodwait_auto_sleep(delay_cfg)
        if int(exc.seconds) > cap:
            print(f"[tg-scrape] {label} FloodWait {exc.seconds}s exceeds cap")
            raise
        wait_s = flood_wait_seconds(delay_cfg, exc.seconds)
        if session_id:
            await _sleep_flood_with_heartbeat(
                session_id,
                wait_s,
                current=current,
                total=total,
                label_base=f"{label} FloodWait",
            )
        else:
            await asyncio.sleep(wait_s)
        if session_id and is_scrape_cancelled(session_id):
            raise ScrapeCancelled()
        return await coro_factory()


async def _count_admin_roles(client, entity) -> tuple[int, int]:
    owner_count = 0
    admin_count = 0
    try:
        async for user in client.iter_participants(
            entity,
            filter=ChannelParticipantsAdmins,
        ):
            participant = getattr(user, "participant", None)
            if isinstance(participant, ChannelParticipantCreator):
                owner_count += 1
            elif isinstance(participant, ChannelParticipantAdmin):
                admin_count += 1
            elif getattr(user, "is_creator", False):
                owner_count += 1
            elif getattr(user, "admin_rights", None):
                admin_count += 1
        return owner_count, admin_count
    except Exception:  # noqa: BLE001
        return 0, 0


async def _collect_groups(session_id: str, expected_phone: str | None = None) -> dict:
    async with tg_session_lock(session_id):
        return await _collect_groups_locked(session_id, expected_phone)


async def _collect_groups_locked(session_id: str, expected_phone: str | None = None) -> dict:
    session = SESSIONS.get(session_id)
    if not session:
        return {"status": "error", "message": "Login session not found. Log in first."}
    if session.status != "ready":
        return {
            "status": "error",
            "message": f"Session not ready (status={session.status}). Complete login first.",
            "valid": False,
        }

    client = session.client
    if not client.is_connected():
        await client.connect()
    if not await client.is_user_authorized():
        return {"status": "error", "message": "Session is not authorized", "valid": False}

    me = await client.get_me()
    try:
        me_label = _assert_telegram_account_match(me, expected_phone)
    except ValueError as exc:
        return {"status": "error", "message": str(exc), "valid": False}

    clear_scrape_progress(session_id)
    clear_scrape_cancel(session_id)
    started_at = time.monotonic()
    try:
        set_scrape_progress(session_id, phase="discover", label="Discovering groups on Telegram")

        # Refresh dialog list — akun besar bisa lama; heartbeat agar idle watchdog Electron tidak putus diam.
        await _await_with_progress_heartbeat(
            session_id,
            client.get_dialogs(),
            phase="discover",
            label="Refreshing dialog list from Telegram",
        )
        if is_scrape_cancelled(session_id):
            return _cancelled_payload(session_id)

        targets: list = []
        total_on_account = 0
        async for dialog in client.iter_dialogs():
            if is_scrape_cancelled(session_id):
                return _cancelled_payload(session_id)
            if not _is_group_dialog(dialog):
                continue
            total_on_account += 1
            if total_on_account == 1 or total_on_account % 50 == 0:
                set_scrape_progress(
                    session_id,
                    phase="discover",
                    current=total_on_account,
                    total=0,
                    label=f"Listing groups on device ({total_on_account})…",
                )
            if len(targets) < DEVICE_GROUP_TARGET_MAX:
                targets.append(dialog)

        truncated = total_on_account > DEVICE_GROUP_TARGET_MAX
        if truncated:
            print(
                f"[tg-scrape] sessionId={session_id} {total_on_account} groups; "
                f"scraping first {DEVICE_GROUP_TARGET_MAX}",
            )

        total = len(targets)
        set_scrape_progress(
            session_id,
            phase="discover",
            current=total,
            total=total,
            label=f"{total} groups on device ({me_label})",
        )
        set_scrape_progress(
            session_id,
            phase="group",
            current=0,
            total=total,
            label=f"Reading groups (0/{total})",
        )

        groups: list[dict] = []
        for index, dialog in enumerate(targets):
            if is_scrape_cancelled(session_id):
                return _cancelled_payload(session_id, groups)

            if index > 0:
                await asyncio.sleep(
                    jitter_seconds(float(_SCRAPE_DELAY.get("scrape_between_groups_sec", 1.5)), _SCRAPE_DELAY)
                )

            entity = dialog.entity
            try:
                group_id = str(utils.get_peer_id(entity))
            except Exception:  # noqa: BLE001
                group_id = str(dialog.id)
            group_name = dialog.title or dialog.name or group_id

            set_scrape_progress(
                session_id,
                phase="group",
                current=index,
                total=total,
                label=f"{group_name} ({index}/{total})",
            )

            try:
                member_count, existing_invite = await _resolve_member_count(client, entity)
            except Exception:  # noqa: BLE001
                member_count, existing_invite = 0, None

            try:
                is_admin_flag = await _count_with_flood_retry(
                    lambda: _is_group_admin(client, entity, me),
                    label="is_admin",
                    session_id=session_id,
                    current=index,
                    total=total,
                )
            except ScrapeCancelled:
                return _cancelled_payload(session_id, groups)
            except FloodWaitError:
                is_admin_flag = False
            except Exception:  # noqa: BLE001
                is_admin_flag = False

            try:
                owner_count, admin_count = await _count_with_flood_retry(
                    lambda: _count_admin_roles(client, entity),
                    label="admin_roles",
                    session_id=session_id,
                    current=index,
                    total=total,
                )
            except ScrapeCancelled:
                return _cancelled_payload(session_id, groups)
            except FloodWaitError:
                owner_count, admin_count = 0, 0
            except Exception:  # noqa: BLE001
                owner_count, admin_count = 0, 0

            username = getattr(entity, "username", None)
            try:
                invite_link = await _resolve_invite_link(
                    client,
                    entity,
                    username,
                    is_admin=bool(is_admin_flag),
                    existing_invite=existing_invite,
                    session_id=session_id,
                    current=index,
                    total=total,
                )
            except ScrapeCancelled:
                return _cancelled_payload(session_id, groups)

            current = index + 1
            set_scrape_progress(
                session_id,
                phase="group",
                current=current,
                total=total,
                label=f"{group_name} ({current}/{total})",
            )

            groups.append(
                {
                    "group_id": group_id,
                    "group_name": group_name,
                    "invite_link": invite_link,
                    "is_admin": _admin_label(is_admin_flag),
                    "member_count": member_count,
                    "admin_count": admin_count,
                    "owner_count": owner_count,
                }
            )

            # Checkpoint parsial — pulih jika proses/HTTP putus mid-scrape.
            if current % 25 == 0 or current == total:
                set_scrape_result(
                    session_id,
                    {
                        "status": "running",
                        "groups": list(groups),
                        "count": len(groups),
                        "partial": True,
                        "hint": "PARTIAL_CHECKPOINT",
                        "telegramUser": me_label,
                    },
                )

        elapsed_sec = time.monotonic() - started_at

        admin_count = sum(1 for group in groups if group["is_admin"] == "yes")
        payload = {
            "status": "ok",
            "valid": True,
            "groups": groups,
            "count": len(groups),
            "adminCount": admin_count,
            "telegramUser": me_label,
            "elapsedMs": int(elapsed_sec * 1000),
        }
        hint_parts: list[str] = []
        if truncated:
            hint_parts.append(f"TRUNCATED_{DEVICE_GROUP_TARGET_MAX}")
            payload["message"] = (
                f"Telegram @{me_label}: account has {total_on_account} groups; "
                f"scraped first {DEVICE_GROUP_TARGET_MAX} only (cap)."
            )
            payload["deviceGroupCount"] = total_on_account
        if len(groups) == 0:
            hint_parts.append("ZERO_GROUPS_ON_ACCOUNT")
            payload["message"] = (
                f"Telegram @{me_label} tidak punya grup terdeteksi. "
                "Login ulang jika ini bukan akun yang dimaksud."
            )
        if hint_parts:
            payload["hint"] = "|".join(hint_parts)
        # Sertakan session string di hasil scrape — Electron persist tanpa IPC export terpisah
        # (path finishing yang sering disconnect setelah scrape panjang).
        try:
            tg_sess = SESSIONS.get(session_id)
            if tg_sess is not None:
                saved = tg_sess.client.session.save()
                if saved and str(saved).strip():
                    payload["sessionString"] = str(saved).strip()
                    payload["loginMethod"] = getattr(tg_sess, "mode", "qr")
        except Exception:  # noqa: BLE001
            pass
        set_scrape_result(session_id, {k: v for k, v in payload.items() if k != "valid"})
        return payload
    finally:
        clear_scrape_progress(session_id)


def is_telegram_scrape_running(session_id: str) -> bool:
    task = _scrape_tasks.get(session_id)
    return bool(task is not None and not task.done())


def count_active_telegram_scrapes() -> int:
    return sum(1 for task in _scrape_tasks.values() if task is not None and not task.done())


def any_telegram_scrape_running() -> bool:
    return count_active_telegram_scrapes() > 0


async def start_telegram_scrape_job(
    session_id: str,
    session_string: str | None = None,
    expected_phone: str | None = None,
) -> dict:
    """
    Mulai scrape di background task — HTTP request pendek.
    Jangan await scrape di request HTTP panjang (putus di ~500+ grup → fetch failed).
    """
    existing = _scrape_tasks.get(session_id)
    if existing is not None and not existing.done():
        return {"status": "started", "alreadyRunning": True}

    clear_scrape_cancel(session_id)
    clear_scrape_result(session_id)
    set_scrape_progress(session_id, phase="start", label="Starting Telegram scrape")

    async def _run() -> None:
        try:
            result = await scrape_telegram_groups(session_id, session_string, expected_phone)
            set_scrape_result(session_id, result)
        except Exception as exc:  # noqa: BLE001
            prev = get_scrape_result(session_id)
            groups = list((prev or {}).get("groups") or [])
            if groups:
                set_scrape_result(
                    session_id,
                    {
                        "status": "ok",
                        "groups": groups,
                        "count": len(groups),
                        "partial": True,
                        "hint": "PARTIAL_AFTER_ERROR",
                        "message": str(exc) or "Telegram scrape interrupted",
                        "telegramUser": (prev or {}).get("telegramUser"),
                    },
                )
            else:
                set_scrape_result(
                    session_id,
                    {
                        "status": "error",
                        "message": str(exc) or "Telegram scrape failed",
                        "groups": [],
                        "count": 0,
                    },
                )
        finally:
            _scrape_tasks.pop(session_id, None)

    _scrape_tasks[session_id] = asyncio.create_task(_run())
    return {"status": "started"}


async def scrape_telegram_groups(
    session_id: str,
    session_string: str | None = None,
    expected_phone: str | None = None,
) -> dict:
    if session_string and session_string.strip():
        restored = await restore_telegram_session(session_id, session_string.strip())
        if restored.get("status") == "error":
            return {
                "status": "error",
                "message": restored.get("message", "Session restore failed"),
            }

    result = await _collect_groups(session_id, expected_phone)
    if result.get("status") == "error":
        return result
    if result.get("status") == "cancelled":
        return result
    payload = dict(result)
    payload.pop("valid", None)
    payload.pop("adminCount", None)
    return payload


async def validate_telegram_session(session_id: str, session_string: str | None = None) -> dict:
    from telegram_login import SESSIONS, _verify_client_live, restore_telegram_session

    session = SESSIONS.get(session_id)
    if not session and session_string:
        restored = await restore_telegram_session(session_id, session_string)
        if restored.get("status") == "error":
            msg = restored.get("message", "Session restore failed")
            lower = str(msg).lower()
            if "not ready" in lower or "connect" in lower or "timeout" in lower:
                return {"status": "ok", "valid": False, "message": f"SESSION_WARM_PENDING: {msg}"}
            return {
                "status": "ok",
                "valid": False,
                "message": msg,
            }

    session = SESSIONS.get(session_id)
    if not session:
        if session_string:
            return {
                "status": "ok",
                "valid": False,
                "message": "SESSION_WARM_PENDING: Telegram client still starting on this PC.",
            }
        return {
            "status": "ok",
            "valid": False,
            "message": "Login session not found. Log in first.",
        }

    ok, err = await _verify_client_live(session.client)
    if ok:
        session.status = "ready"
        return {"status": "ok", "valid": True}

    err_msg = err or f"Session not ready (status={session.status})"
    if session.status in ("pending", "confirming") or "not ready" in err_msg.lower():
        return {
            "status": "ok",
            "valid": False,
            "message": f"SESSION_WARM_PENDING: {err_msg}",
        }
    return {
        "status": "ok",
        "valid": False,
        "message": err_msg,
    }
