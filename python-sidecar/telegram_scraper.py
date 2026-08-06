from __future__ import annotations

import asyncio
import itertools
import time

from telethon import utils
from telethon.errors import FloodWaitError
from telethon.tl import custom as tl_custom
from telethon.tl import types as tl_types
from telethon.tl.functions.channels import GetFullChannelRequest, GetParticipantRequest
from telethon.tl.functions.messages import (
    ExportChatInviteRequest,
    GetDialogsRequest,
    GetExportedChatInvitesRequest,
    GetFullChatRequest,
)
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
from telegram_login import (
    SESSIONS,
    _connect_client,
    _is_auth_key_dead_message,
    _is_transient_socket_error,
    restore_telegram_session,
    tg_session_lock,
)

DEVICE_GROUP_TARGET_MAX = 6000
_DIALOG_CHUNK = 100
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


class DiscoveryIncomplete(Exception):
    """Listing dialog putus di tengah — JANGAN commit daily (Missing palsu massal)."""


def request_scrape_cancel(session_id: str) -> None:
    _scrape_cancel_requests.add(session_id)


def clear_scrape_cancel(session_id: str) -> None:
    _scrape_cancel_requests.discard(session_id)


def is_scrape_cancelled(session_id: str) -> bool:
    return session_id in _scrape_cancel_requests


def _cancelled_payload(session_id: str, groups: list | None = None) -> dict:
    clear_scrape_cancel(session_id)
    clear_scrape_progress(session_id)
    rows = _groups_for_payload(list(groups or []))
    payload = {
        "status": "cancelled",
        "message": "SCRAPER_CANCELLED",
        "groups": rows,
        "count": len(rows),
    }
    if rows:
        # Cancel mid-way — checkpoint parsial hanya untuk diagnosa/poll.
        # Electron MENOLAK partial (SCRAPER_PARTIAL_RESULT) — jangan commit ke daily
        # (rm_commit menghapus seluruh daily akun). Operator harus Scrape ulang.
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


def _groups_for_payload(groups: list[dict]) -> list[dict]:
    """Buang referensi entity non-JSON sebelum checkpoint / response HTTP."""
    return [{k: v for k, v in g.items() if k != "_entity_ref"} for g in groups]


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


def _is_live_group_dialog(dialog) -> bool:
    """Grup hidup untuk scrape. Shell migrate / Chat deactivated / sudah left = BUKAN target.

    Sama seperti ignore_migrated Telethon/app resmi — tapi filter di sini, bukan lewat
    stock iter_dialogs (stock stop prematur jika buffer chunk kosong).

    `left=True` (Chat & Channel): dialog kadang masih nyangkut sesaat di hasil GetDialogs
    setelah leave/delete (cache server belum sinkron) — kalau ini tidak difilter, grup yang
    sudah ditinggalkan bisa tertulis lagi ke daily sebagai Junk walau device sudah bersih.
    """
    entity = dialog.entity
    if getattr(entity, "left", False):
        return False
    if isinstance(entity, Chat) and getattr(entity, "migrated_to", None) is not None:
        return False
    if isinstance(entity, Chat) and getattr(entity, "deactivated", False):
        return False
    if dialog.is_group:
        return True
    return isinstance(entity, Channel) and bool(getattr(entity, "megagroup", False))


def _dialog_message_key(peer, message_id):
    channel_id = peer.channel_id if isinstance(peer, tl_types.PeerChannel) else None
    return channel_id, message_id


def _ingest_migrated_from_chat_ids(chats, migrated_from_chat_ids: set[int]) -> None:
    """Kumpulkan basic chat_id yang sudah migrate — dari Channel.migrated_from_chat_id + shell Chat.

    Dipakai untuk SKIP shell di discovery (bukan konversi ID / rank). Dialog cache kadang
    mengirim Chat tanpa `migrated_to` meski Super Group sudah ada di list yang sama.
    """
    for x in chats or []:
        if isinstance(x, Channel):
            mid = getattr(x, "migrated_from_chat_id", None)
            if mid is not None:
                try:
                    migrated_from_chat_ids.add(int(mid))
                except (TypeError, ValueError):
                    pass
        elif isinstance(x, Chat) and getattr(x, "migrated_to", None) is not None:
            try:
                migrated_from_chat_ids.add(int(x.id))
            except (TypeError, ValueError):
                pass


def _is_migrated_basic_shell(entity, migrated_from_chat_ids: set[int]) -> bool:
    if not isinstance(entity, Chat):
        return False
    if getattr(entity, "migrated_to", None) is not None:
        return True
    try:
        return int(entity.id) in migrated_from_chat_ids
    except (TypeError, ValueError):
        return False


def _prune_migrated_shells_from_dialogs(
    dialogs: list, migrated_from_chat_ids: set[int]
) -> tuple[list, int]:
    """Buang Chat basic yang chat_id-nya sudah ter-cover Super (urutan chunk bisa belakangan)."""
    if not migrated_from_chat_ids:
        return dialogs, 0
    kept: list = []
    removed = 0
    for dialog in dialogs:
        ent = dialog.entity
        if _is_migrated_basic_shell(ent, migrated_from_chat_ids):
            removed += 1
            continue
        kept.append(dialog)
    return kept, removed


def _roles_from_channel_entity(entity) -> tuple[bool, bool] | None:
    """Fast path dari flags GetDialogs (Channel.creator / admin_rights).

    None = flags tidak menyatakan admin (bisa member, atau entity tidak lengkap).
    (True, owner) = terverifikasi admin dari entity dialog — tanpa API tambahan.
    """
    if not isinstance(entity, Channel):
        return None
    if bool(getattr(entity, "creator", False)):
        return True, True
    if getattr(entity, "admin_rights", None) is not None:
        return True, False
    return None


async def _resolve_dialog_peer_with_retry(client, peer, session_id: str, attempts: int = 3):
    """get_entity dengan retry pendek — jangan biarkan satu error transient menghapus 1 grup
    permanen dari daily (peer yang gagal resolve tidak akan muncul lagi di chunk berikutnya).
    """
    last_exc: Exception | None = None
    for attempt in range(attempts):
        if is_scrape_cancelled(session_id):
            raise ScrapeCancelled()
        try:
            return await client.get_entity(peer)
        except FloodWaitError as exc:
            cap = max_floodwait_auto_sleep(_SCRAPE_DELAY)
            if int(exc.seconds) > cap:
                raise DiscoveryIncomplete(
                    f"SCRAPER_DISCOVERY_FLOODWAIT:{exc.seconds}"
                ) from exc
            await _sleep_flood_with_heartbeat(
                session_id,
                flood_wait_seconds(_SCRAPE_DELAY, exc.seconds),
                label_base="discover peer FloodWait",
            )
            last_exc = exc
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < attempts - 1:
                await asyncio.sleep(0.6 * (attempt + 1))
    if last_exc is not None:
        print(
            f"[tg-scrape] sessionId={session_id} resolve peer failed after {attempts} "
            f"attempts: {last_exc}",
            flush=True,
        )
    return None


async def _load_all_group_dialogs(client, session_id: str) -> tuple[list, int]:
    """Ambil semua dialog grup HIDUP akun ini.

    Returns: (dialogs, skipped_migrate_shells).

    Kenapa bukan stock Telethon iter_dialogs + ignore_migrated:
    Stock Telethon (`dialogs.py`): jika SEMUA dialog di satu chunk di-skip
    (mis. banyak shell migrate) → buffer kosong → `return True` → pagination PUTUS.
    Akibat: Super Group di halaman berikutnya tidak terbaca → daily bolong → Join Missing
    meski di device sudah admin.

    Kontrak di sini:
    1. Pagination GetDialogsRequest lengkap (lanjut meski 0 grup lolos filter di chunk).
    2. Shell Chat.migrated_to / deactivated / migrated_from Super → skip (1 ID Super saja).
    3. FloodWait/error discovery → DiscoveryIncomplete (jangan commit daily bolong).
    """
    offset_date = None
    offset_id = 0
    offset_peer: tl_types.TypeInputPeer = tl_types.InputPeerEmpty()
    exclude_pinned = False
    seen: set[int] = set()
    out: list = []
    skipped_migrate = 0
    migrated_from_chat_ids: set[int] = set()

    while True:
        if is_scrape_cancelled(session_id):
            raise ScrapeCancelled()

        async def _fetch_chunk():
            return await client(
                GetDialogsRequest(
                    offset_date=offset_date,
                    offset_id=offset_id,
                    offset_peer=offset_peer,
                    limit=_DIALOG_CHUNK,
                    hash=0,
                    exclude_pinned=exclude_pinned,
                    folder_id=None,
                )
            )

        try:
            result = await _count_with_flood_retry(
                _fetch_chunk,
                label="get_dialogs",
                session_id=session_id,
            )
        except ScrapeCancelled:
            raise
        except FloodWaitError as exc:
            # JANGAN break + return partial. Commit daftar bolong = Missing di semua akun.
            cap = max_floodwait_auto_sleep(_SCRAPE_DELAY)
            if int(exc.seconds) > cap:
                raise DiscoveryIncomplete(
                    f"SCRAPER_DISCOVERY_FLOODWAIT:{exc.seconds}"
                ) from exc
            await _sleep_flood_with_heartbeat(
                session_id,
                flood_wait_seconds(_SCRAPE_DELAY, exc.seconds),
                label_base="discover FloodWait",
            )
            if is_scrape_cancelled(session_id):
                raise ScrapeCancelled()
            continue
        except Exception as exc:  # noqa: BLE001
            raise DiscoveryIncomplete(f"SCRAPER_DISCOVERY_FAILED:{exc}") from exc

        _ingest_migrated_from_chat_ids(result.chats, migrated_from_chat_ids)

        entities = {
            utils.get_peer_id(x): x
            for x in itertools.chain(result.users, result.chats)
            if not isinstance(x, (tl_types.UserEmpty, tl_types.ChatEmpty))
        }
        client._mb_entity_cache.extend(result.users, result.chats)

        messages = {}
        for msg in result.messages:
            msg._finish_init(client, entities, None)
            messages[_dialog_message_key(msg.peer_id, msg.id)] = msg

        new_peers = 0
        last_input_peer = None
        for raw in result.dialogs:
            peer_id = utils.get_peer_id(raw.peer)

            entity = entities.get(peer_id)
            if entity is None:
                entity = await _resolve_dialog_peer_with_retry(client, raw.peer, session_id)
                if entity is None:
                    # Retry habis — JANGAN diam-diam skip. Grup live yang gagal resolve sekali
                    # akan hilang permanen dari daily (sumber Missing palsu untuk akun dengan
                    # ribuan grup, di mana probabilitas transient error per-panggilan tinggi).
                    raise DiscoveryIncomplete(
                        f"SCRAPER_DISCOVERY_FAILED: cannot resolve peer {peer_id}"
                    )
                entities[peer_id] = entity
                if isinstance(entity, (Channel, Chat)):
                    _ingest_migrated_from_chat_ids([entity], migrated_from_chat_ids)

            try:
                last_input_peer = utils.get_input_peer(entity)
            except Exception:  # noqa: BLE001
                pass

            if peer_id in seen:
                continue
            seen.add(peer_id)
            new_peers += 1

            message = messages.get(_dialog_message_key(raw.peer, raw.top_message))
            try:
                dialog = tl_custom.Dialog(client, raw, entities, message)
            except Exception:  # noqa: BLE001
                continue

            ent = dialog.entity
            if _is_migrated_basic_shell(ent, migrated_from_chat_ids):
                # Shell basic setelah migrate — Super Group sudah dialog Channel sendiri.
                skipped_migrate += 1
                continue
            if not _is_live_group_dialog(dialog):
                continue
            out.append(dialog)

        # Super di chunk ini / sebelumnya bisa baru mengungkapkan migrated_from — prune shell.
        out, pruned = _prune_migrated_shells_from_dialogs(out, migrated_from_chat_ids)
        skipped_migrate += pruned

        set_scrape_progress(
            session_id,
            phase="discover",
            current=len(out),
            total=0,
            label=f"Listing groups on device ({len(out)})…",
        )

        raw_count = len(result.dialogs)
        # BEDA dari stock Telethon: jangan stop hanya karena 0 grup lolos filter di chunk ini.
        if not isinstance(result, tl_types.messages.DialogsSlice):
            break
        if raw_count == 0 or raw_count < _DIALOG_CHUNK:
            break
        if new_peers == 0:
            # Chunk PENUH (raw_count == _DIALOG_CHUNK) tapi 100% peer sudah `seen` sebelumnya —
            # server tidak mungkin mengembalikan halaman identik kalau offset benar-benar maju.
            # Ini sinyal cursor macet (bug), BUKAN akhir list yang legit (itu sudah ditangani
            # oleh raw_count < _DIALOG_CHUNK di atas). Diam-diam `break` di sini = sumber Missing
            # untuk akun grup besar — jangan commit daily bolong, minta scrape ulang.
            raise DiscoveryIncomplete(
                "SCRAPER_DISCOVERY_STALLED: full page returned with 0 new peers"
            )

        last_message = next(
            filter(
                None,
                (
                    messages.get(_dialog_message_key(d.peer, d.top_message))
                    for d in reversed(result.dialogs)
                ),
            ),
            None,
        )
        if last_input_peer is None:
            last_raw = result.dialogs[-1]
            try:
                last_input_peer = await client.get_input_entity(last_raw.peer)
            except Exception as exc:  # noqa: BLE001
                raise DiscoveryIncomplete(
                    f"SCRAPER_DISCOVERY_FAILED: cannot advance offset ({exc})"
                ) from exc

        exclude_pinned = True
        offset_id = last_message.id if last_message else 0
        offset_date = last_message.date if last_message else None
        offset_peer = last_input_peer

    out, pruned_final = _prune_migrated_shells_from_dialogs(out, migrated_from_chat_ids)
    skipped_migrate += pruned_final
    return out, skipped_migrate


async def _upgrade_basic_chat_if_migrated(client, entity):
    """Safety net: Chat.migrated_to → Channel saja. Jangan pernah tulis ID basic usang."""
    if not isinstance(entity, Chat):
        return entity

    if getattr(entity, "deactivated", False) and getattr(entity, "migrated_to", None) is None:
        return None

    migrated = getattr(entity, "migrated_to", None)
    # Dialog cache kadang kosongkan migrated_to — refresh entity sebelum tulis ID basic.
    if migrated is None:
        try:
            refreshed = await client.get_entity(entity)
        except Exception:  # noqa: BLE001
            return entity
        if isinstance(refreshed, Channel) and bool(getattr(refreshed, "megagroup", False)):
            return refreshed
        if not isinstance(refreshed, Chat):
            return None
        entity = refreshed
        if getattr(entity, "deactivated", False) and getattr(entity, "migrated_to", None) is None:
            return None
        migrated = getattr(entity, "migrated_to", None)
        if migrated is None:
            return entity

    try:
        channel = await client.get_entity(migrated)
    except Exception:  # noqa: BLE001
        try:
            channel_id = getattr(migrated, "channel_id", None)
            if channel_id is None:
                return None
            channel = await client.get_entity(int(channel_id))
        except Exception:  # noqa: BLE001
            return None

    if isinstance(channel, Channel) and bool(getattr(channel, "megagroup", False)):
        return channel
    return None


async def _roles_via_get_participant(
    client, entity, me
) -> tuple[bool, bool] | None:
    """None = gagal baca. (is_admin, is_owner) jika sukses (termasuk verified member)."""
    if isinstance(entity, Channel):
        try:
            part = await client(GetParticipantRequest(entity, me))
            participant = getattr(part, "participant", None)
            if isinstance(participant, ChannelParticipantCreator):
                return True, True
            if isinstance(participant, ChannelParticipantAdmin):
                return True, False
            return False, False
        except FloodWaitError:
            raise
        except Exception:  # noqa: BLE001
            return None

    if isinstance(entity, Chat):
        try:
            full = await client(GetFullChatRequest(chat_id=entity.id))
            participants = getattr(full.full_chat, "participants", None)
            for p in getattr(participants, "participants", []) or []:
                if getattr(p, "user_id", None) != me.id:
                    continue
                if isinstance(p, ChatParticipantCreator):
                    return True, True
                if isinstance(p, ChatParticipantAdmin):
                    return True, False
                return False, False
            return False, False
        except FloodWaitError:
            raise
        except Exception:  # noqa: BLE001
            return None

    return None


async def _admin_list_role(client, entity, me) -> tuple[bool, bool] | None:
    """Scan ChannelParticipantsAdmins. None = list gagal (unverified)."""
    try:
        is_owner = False
        is_admin = False
        async for user in client.iter_participants(
            entity,
            filter=ChannelParticipantsAdmins,
        ):
            if user.id != me.id:
                continue
            participant = getattr(user, "participant", None)
            if isinstance(participant, ChannelParticipantCreator) or getattr(
                user, "is_creator", False
            ):
                return True, True
            if isinstance(participant, ChannelParticipantAdmin) or getattr(
                user, "admin_rights", None
            ):
                is_admin = True
        return is_admin, is_owner
    except FloodWaitError:
        raise
    except Exception:  # noqa: BLE001
        return None


async def _my_group_roles(client, entity, me) -> tuple[bool, bool, bool]:
    """(is_admin, is_owner, verified). Owner ⇒ is_admin True.

    verified=False → pemanggil JANGAN anggap 'no' final (sumber not_admin palsu).
    """
    flags = _roles_from_channel_entity(entity)
    if flags is not None:
        return flags[0], flags[1], True

    try:
        perms = await client.get_permissions(entity, me)
        is_owner = bool(getattr(perms, "is_creator", False))
        is_admin = bool(getattr(perms, "is_admin", False) or is_owner)
        return is_admin, is_owner, True
    except FloodWaitError:
        raise
    except Exception:  # noqa: BLE001
        pass

    via_part = await _roles_via_get_participant(client, entity, me)
    if via_part is not None:
        return via_part[0], via_part[1], True

    via_list = await _admin_list_role(client, entity, me)
    if via_list is not None:
        return via_list[0], via_list[1], True

    if isinstance(entity, Chat):
        via_chat = await _roles_via_get_participant(client, entity, me)
        if via_chat is not None:
            return via_chat[0], via_chat[1], True

    return False, False, False


async def _read_own_exported_invite(client, entity) -> str | None:
    """Baca link yang SUDAH pernah dibuat akun ini — tanpa membuat link baru.

    `messages.exportChatInvite` **membuat** link baru setiap dipanggil
    (core.telegram.org/api/invites: "To generate a new one, use messages.exportChatInvite"),
    dan tiap admin punya link sendiri. Memanggilnya di setiap scrape membuat satu grup
    menumpuk banyak link berbeda — semuanya valid dan semuanya mengarah ke grup yang sama.
    `getExportedChatInvites` hanya membaca, jadi scrape kedua dan seterusnya memakai ulang
    link yang sama.
    """
    try:
        result = await client(
            GetExportedChatInvitesRequest(peer=entity, admin_id="me", limit=50)
        )
    except FloodWaitError as exc:
        # Jangan naikkan — pemanggil hanya menangani ScrapeCancelled, dan jalur export
        # di bawahnya sudah punya penanganan FloodWait sendiri.
        print(f"[tg-scrape] read invites FloodWait {exc.seconds}s — skip reuse", flush=True)
        return None
    except Exception:  # noqa: BLE001
        return None

    invites = list(getattr(result, "invites", None) or [])
    usable = [inv for inv in invites if not getattr(inv, "revoked", False)]
    # Link permanen = link utama grup; link berbatas waktu/kuota bisa mati.
    for invite in usable:
        if getattr(invite, "permanent", False):
            link = _link_from_exported_invite(invite)
            if link:
                return link
    for invite in usable:
        link = _link_from_exported_invite(invite)
        if link:
            return link
    return None


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
    """Username → exported_invite GetFull → link lama akun ini → baru boleh buat link.

    Urutannya sengaja: tiga langkah pertama hanya MEMBACA. `ExportChatInvite` (yang membuat
    link baru) jadi jalan terakhir, supaya satu grup tidak punya link berbeda-beda per akun
    dan per scrape.
    """
    if username:
        return f"https://t.me/{username}"
    if existing_invite:
        return existing_invite
    # Export hanya jika admin (non-admin biasanya gagal / spam API).
    if not is_admin:
        return None

    reused = await _read_own_exported_invite(client, entity)
    if reused:
        return reused
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
        try:
            await _connect_client(client)
        except Exception as exc:  # noqa: BLE001
            msg = str(exc) or "Telegram connect failed"
            if _is_auth_key_dead_message(msg):
                return {"status": "error", "message": msg, "valid": False}
            if _is_transient_socket_error(msg):
                return {
                    "status": "error",
                    "message": "SCRAPER_TG_CONNECT_FAILED",
                    "valid": False,
                }
            return {"status": "error", "message": msg, "valid": False}
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

        # Pagination GetDialogs sendiri — jangan stock iter_dialogs (buffer kosong = putus).
        targets: list = []
        total_on_account = 0
        discover_stop = asyncio.Event()

        async def _discover_heartbeat() -> None:
            while not discover_stop.is_set():
                if is_scrape_cancelled(session_id):
                    return
                set_scrape_progress(
                    session_id,
                    phase="discover",
                    current=total_on_account,
                    total=0,
                    label=f"Listing groups on device ({total_on_account})…",
                )
                try:
                    await asyncio.wait_for(discover_stop.wait(), timeout=15.0)
                except asyncio.TimeoutError:
                    pass

        discover_hb = asyncio.create_task(_discover_heartbeat())
        try:
            all_group_dialogs, skipped_migrate = await _load_all_group_dialogs(client, session_id)
            total_on_account = len(all_group_dialogs)
            targets = all_group_dialogs[:DEVICE_GROUP_TARGET_MAX]
        except ScrapeCancelled:
            return _cancelled_payload(session_id)
        except DiscoveryIncomplete as exc:
            # Gagal listing = error keras. Jangan status ok + daily bolong.
            return {
                "status": "error",
                "message": str(exc) or "SCRAPER_DISCOVERY_FAILED",
                "valid": False,
            }
        finally:
            discover_stop.set()
            try:
                await discover_hb
            except Exception:  # noqa: BLE001
                pass

        if is_scrape_cancelled(session_id):
            return _cancelled_payload(session_id)

        truncated = total_on_account > DEVICE_GROUP_TARGET_MAX
        if truncated:
            print(
                f"[tg-scrape] sessionId={session_id} {total_on_account} groups; "
                f"scraping first {DEVICE_GROUP_TARGET_MAX}",
            )

        print(
            f"[tg-scrape] sessionId={session_id} me={me_label} "
            f"discovered={total_on_account} skipped_migrate_shells={skipped_migrate} "
            f"group dialogs from Telegram",
            flush=True,
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
        seen_peer_ids: set[str] = set()
        # Grup yang perannya GAGAL dibaca (FloodWait / API error). Nilainya jatuh ke
        # is_admin='no', dan tanpa dilaporkan itu tidak bisa dibedakan dari "memang bukan
        # admin" — sumber tiket not_admin palsu dan angka grid yang berubah tiap scrape.
        unverified_role_groups: list[str] = []
        for index, dialog in enumerate(targets):
            if is_scrape_cancelled(session_id):
                return _cancelled_payload(session_id, groups)

            dialog_label = dialog.title or dialog.name or f"dialog-{index}"
            # Progress SEBELUM resolve/GetFull — skip migrate panjang tanpa heartbeat
            # memicu idle watchdog → cancel palsu saat hampir selesai.
            set_scrape_progress(
                session_id,
                phase="group",
                current=index,
                total=total,
                label=f"{dialog_label} ({index}/{total})",
            )

            if index > 0:
                await asyncio.sleep(
                    jitter_seconds(float(_SCRAPE_DELAY.get("scrape_between_groups_sec", 1.5)), _SCRAPE_DELAY)
                )

            # Safety: shell migrate jangan tulis ID basic (1 grup 2 ID).
            raw_entity = dialog.entity
            try:
                entity = await _upgrade_basic_chat_if_migrated(client, raw_entity)
            except ScrapeCancelled:
                return _cancelled_payload(session_id, groups)

            if entity is None:
                continue

            # Masih Chat + migrated_to = usang — jangan tulis.
            if isinstance(entity, Chat) and getattr(entity, "migrated_to", None) is not None:
                try:
                    seen_peer_ids.add(str(utils.get_peer_id(entity)))
                except Exception:  # noqa: BLE001
                    pass
                continue

            if isinstance(entity, Chat) and getattr(entity, "deactivated", False):
                continue

            # Channel non-megagroup (broadcast) jangan masuk daily grup.
            if isinstance(entity, Channel) and not bool(getattr(entity, "megagroup", False)):
                if not dialog.is_group:
                    continue

            try:
                group_id = str(utils.get_peer_id(entity))
            except Exception:  # noqa: BLE001
                group_id = str(dialog.id)

            # Tandai peer basic usang supaya tidak dobel jika shell ikut terproses.
            if (
                isinstance(raw_entity, Chat)
                and (
                    getattr(raw_entity, "migrated_to", None) is not None
                    or isinstance(entity, Channel)
                )
                and isinstance(entity, Channel)
            ):
                try:
                    seen_peer_ids.add(str(utils.get_peer_id(raw_entity)))
                except Exception:  # noqa: BLE001
                    pass
            if isinstance(entity, Channel):
                mid = getattr(entity, "migrated_from_chat_id", None)
                if mid is not None:
                    try:
                        seen_peer_ids.add(str(-int(mid)))
                    except (TypeError, ValueError):
                        pass

            # Basic Chat yang Super-nya sudah diproses (migrated_from) — jangan tulis ID usang.
            if isinstance(entity, Chat):
                try:
                    basic_peer = str(utils.get_peer_id(entity))
                except Exception:  # noqa: BLE001
                    try:
                        basic_peer = str(-int(entity.id))
                    except (TypeError, ValueError):
                        basic_peer = None
                if basic_peer and basic_peer in seen_peer_ids:
                    continue

            if group_id in seen_peer_ids:
                set_scrape_progress(
                    session_id,
                    phase="group",
                    current=index + 1,
                    total=total,
                    label=f"Skip duplicate peer ({index + 1}/{total})",
                )
                continue
            seen_peer_ids.add(group_id)

            group_name = (
                getattr(entity, "title", None)
                or dialog.title
                or dialog.name
                or group_id
            )

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

            role_verified = False
            is_admin_flag = False
            is_owner_flag = False
            try:
                is_admin_flag, is_owner_flag, role_verified = await _count_with_flood_retry(
                    lambda e=entity: _my_group_roles(client, e, me),
                    label="group_roles",
                    session_id=session_id,
                    current=index,
                    total=total,
                )
            except ScrapeCancelled:
                return _cancelled_payload(session_id, groups)
            except FloodWaitError:
                flags = _roles_from_channel_entity(entity) or _roles_from_channel_entity(
                    raw_entity
                )
                if flags is not None:
                    is_admin_flag, is_owner_flag = flags
                    role_verified = True
                else:
                    unverified_role_groups.append(group_id)
            except Exception:  # noqa: BLE001
                flags = _roles_from_channel_entity(entity) or _roles_from_channel_entity(
                    raw_entity
                )
                if flags is not None:
                    is_admin_flag, is_owner_flag = flags
                    role_verified = True
                else:
                    unverified_role_groups.append(group_id)

            if not role_verified and group_id not in unverified_role_groups:
                unverified_role_groups.append(group_id)

            if is_owner_flag:
                is_admin_flag = True

            # Setelah upgrade migrate, entity sudah Channel/Chat live.
            # JANGAN buang grup karena member_count 0 — nilai itu juga 0 saat GetFullChat /
            # get_participants gagal (umum untuk member non-admin), dan membuang baris daily
            # grup yang benar-benar diikuti akun akan memunculkan tiket missing_group palsu.

            try:
                owner_count, admin_count = await _count_with_flood_retry(
                    lambda e=entity: _count_admin_roles(client, e),
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
                    "is_owner": _admin_label(is_owner_flag),
                    "member_count": member_count,
                    "admin_count": admin_count,
                    "owner_count": owner_count,
                    "_entity_ref": entity,
                }
            )

            # Checkpoint parsial — pulih jika proses/HTTP putus mid-scrape.
            if current % 25 == 0 or current == total:
                set_scrape_result(
                    session_id,
                    {
                        "status": "running",
                        "groups": _groups_for_payload(groups),
                        "count": len(groups),
                        "partial": True,
                        "hint": "PARTIAL_CHECKPOINT",
                        "telegramUser": me_label,
                    },
                )

        # Retry role untuk grup yang belum terverifikasi — jangan commit massal is_admin=no palsu.
        if unverified_role_groups:
            set_scrape_progress(
                session_id,
                phase="group",
                current=total,
                total=total,
                label=f"Retrying admin roles ({len(unverified_role_groups)})…",
            )
            await asyncio.sleep(
                jitter_seconds(float(_SCRAPE_DELAY.get("scrape_between_groups_sec", 1.5)), _SCRAPE_DELAY)
            )
            still_unverified: list[str] = []
            unverified_set = set(unverified_role_groups)
            for group in groups:
                gid = group["group_id"]
                if gid not in unverified_set:
                    continue
                if is_scrape_cancelled(session_id):
                    return _cancelled_payload(session_id, groups)
                ent = group.pop("_entity_ref", None)
                try:
                    if ent is None:
                        ent = await client.get_entity(int(gid))
                    is_admin_flag, is_owner_flag, role_verified = await _count_with_flood_retry(
                        lambda e=ent: _my_group_roles(client, e, me),
                        label="group_roles_retry",
                        session_id=session_id,
                        current=total,
                        total=total,
                    )
                    if not role_verified:
                        flags = _roles_from_channel_entity(ent)
                        if flags is not None:
                            is_admin_flag, is_owner_flag = flags
                            role_verified = True
                    if role_verified:
                        if is_owner_flag:
                            is_admin_flag = True
                        group["is_admin"] = _admin_label(is_admin_flag)
                        group["is_owner"] = _admin_label(is_owner_flag)
                        # Invite: jika baru ketahui admin dan belum ada link, coba resolve sekali.
                        if is_admin_flag and not group.get("invite_link"):
                            try:
                                link = await _resolve_invite_link(
                                    client,
                                    ent,
                                    getattr(ent, "username", None),
                                    is_admin=True,
                                    existing_invite=None,
                                    session_id=session_id,
                                    current=total,
                                    total=total,
                                )
                                if link:
                                    group["invite_link"] = link
                            except ScrapeCancelled:
                                return _cancelled_payload(session_id, groups)
                            except Exception:  # noqa: BLE001
                                pass
                    else:
                        still_unverified.append(gid)
                except ScrapeCancelled:
                    return _cancelled_payload(session_id, groups)
                except Exception:  # noqa: BLE001
                    still_unverified.append(gid)
            unverified_role_groups = still_unverified

        for group in groups:
            group.pop("_entity_ref", None)

        set_scrape_progress(
            session_id,
            phase="group",
            current=total,
            total=total,
            label=f"Finalizing scrape ({len(groups)} groups)…",
        )

        elapsed_sec = time.monotonic() - started_at

        # Ringkasan wajib tercetak: discovered (dari Telethon) vs targets (setelah cap) vs
        # written (baris final, setelah skip deactivated/duplicate). Kalau written < targets
        # tanpa print skip yang sepadan di atas, berarti ada jalur pembuang baris yang belum
        # ketemu di audit kode — bukti langsung, bukan tebakan.
        print(
            f"[tg-scrape] sessionId={session_id} me={me_label} summary: "
            f"discovered={total_on_account} targets={total} written={len(groups)} "
            f"unverified_roles={len(unverified_role_groups)}",
            flush=True,
        )

        # Mass unverified → jangan commit daily (semua/not_admin palsu menghapus data benar).
        unverified_n = len(unverified_role_groups)
        if groups and unverified_n > 0:
            all_unverified = unverified_n >= len(groups)
            too_many = unverified_n > max(25, len(groups) // 5)
            if all_unverified or too_many:
                print(
                    f"[tg-scrape] sessionId={session_id} abort: SCRAPER_UNVERIFIED_ROLES "
                    f"({unverified_n}/{len(groups)}) — refuse commit",
                    flush=True,
                )
                return {
                    "status": "error",
                    "message": f"SCRAPER_UNVERIFIED_ROLES:{unverified_n}/{len(groups)}",
                    "valid": False,
                    "unverifiedRoleCount": unverified_n,
                    "unverifiedRoleGroupIds": unverified_role_groups[:50],
                    "groups": _groups_for_payload(groups),
                    "count": len(groups),
                }

        admin_count = sum(1 for group in groups if group["is_admin"] == "yes")
        payload = {
            "status": "ok",
            "valid": True,
            "groups": _groups_for_payload(groups),
            "count": len(groups),
            "adminCount": admin_count,
            "telegramUser": me_label,
            "elapsedMs": int(elapsed_sec * 1000),
            "unverifiedRoleCount": unverified_n,
        }
        hint_parts: list[str] = []
        if unverified_role_groups:
            hint_parts.append(f"UNVERIFIED_ROLES_{len(unverified_role_groups)}")
            payload["unverifiedRoleGroupIds"] = unverified_role_groups[:50]
            print(
                f"[tg-scrape] sessionId={session_id} roles still unverified for "
                f"{len(unverified_role_groups)} group(s) after retry",
                flush=True,
            )
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
        except asyncio.CancelledError:
            # `CancelledError` TIDAK turunan `Exception` (Python 3.8+) — tanpa blok ini,
            # task yang dibatalkan oleh apapun di luar cancel-flag kita sendiri (event loop,
            # shutdown sidecar, dsb) mati diam TANPA menulis hasil. Electron polling melihat
            # status running/idle terus, baru timeout lewat watchdog-nya sendiri — persis
            # gejala "scrape cancel padahal sudah mau finish" untuk akun besar / grup di
            # ujung daftar dialog. Simpan checkpoint terakhir + pesan jelas, jangan diam.
            prev = get_scrape_result(session_id)
            groups = list((prev or {}).get("groups") or [])
            print(
                f"[tg-scrape] sessionId={session_id} task cancelled mid-scrape "
                f"(checkpoint groups={len(groups)})",
                flush=True,
            )
            set_scrape_result(
                session_id,
                {
                    "status": "ok" if groups else "error",
                    "groups": groups,
                    "count": len(groups),
                    "partial": bool(groups),
                    "hint": "TASK_CANCELLED",
                    "message": (
                        "Telegram scrape task dibatalkan tak terduga (bukan oleh user) "
                        "sebelum selesai. Data lama TIDAK diubah — coba Scrape Now lagi."
                    ),
                    "telegramUser": (prev or {}).get("telegramUser"),
                },
            )
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
    # Jangan restore ulang jika Electron sudah restore (client ready) —
    # cancel+TelegramClient baru = risiko AUTH_KEY_DUPLICATED.
    session = SESSIONS.get(session_id)
    need_restore = bool(
        session_string
        and session_string.strip()
        and (not session or session.status != "ready")
    )
    if need_restore:
        restored = await restore_telegram_session(session_id, session_string.strip())
        if restored.get("status") == "error":
            return {
                "status": "error",
                "message": restored.get("message", "Session restore failed"),
            }
    elif not session or session.status != "ready":
        return {
            "status": "error",
            "message": "Login session not found. Log in first.",
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


def _is_session_warm_pending_message(msg: str) -> bool:
    """Soft: client masih start/timeout/socket — BUKAN AuthKeyDuplicated.

    Jangan pakai substring 'connect'/'connection' luas (InitConnectionRequest di
    AuthKeyDuplicated). Errno 22 / WinError 10022 = soft Windows socket.
    """
    from telegram_login import _is_auth_key_dead_message

    if _is_auth_key_dead_message(msg):
        return False
    lower = str(msg).lower()
    if (
        "errno 22" in lower
        or "winerror 10022" in lower
        or "invalid argument" in lower
    ):
        return True
    return (
        "not ready" in lower
        or "still starting" in lower
        or "connection timed out" in lower
        or "timed out" in lower
        or "timeout" in lower
        or "disconnected" in lower
        or "not connected" in lower
    )


def _auth_key_dead_validate_message(msg: str) -> str:
    """Kode stabil untuk UI: invalidate DB + login ulang (jangan retry warm)."""
    detail = str(msg or "").strip() or "Telegram authorization key is no longer valid"
    return f"TG_AUTH_KEY_DUPLICATED: {detail}"


async def validate_telegram_session(session_id: str, session_string: str | None = None) -> dict:
    from telegram_login import (
        SESSIONS,
        _is_auth_key_dead_message,
        _is_session_revoked_message,
        _verify_client_live,
        restore_telegram_session,
    )

    session = SESSIONS.get(session_id)
    if not session and session_string:
        restored = await restore_telegram_session(session_id, session_string)
        if restored.get("status") == "error":
            msg = restored.get("message", "Session restore failed")
            # AUTH_KEY_DUPLICATED: jangan bungkus SESSION_WARM_PENDING
            # (pesan Telethon mengandung InitConnectionRequest → substring "connect").
            if _is_auth_key_dead_message(msg):
                return {
                    "status": "ok",
                    "valid": False,
                    "message": _auth_key_dead_validate_message(msg),
                }
            # Session logout/revoked asli di device — jangan bungkus WARM_PENDING (bug regresi
            # lama): pesan Telethon (AuthKeyUnregistered/UserDeactivated) bisa memuat kata
            # "timeout"/"connect" secara kebetulan.
            if msg.startswith("TG_SESSION_DEAD:") or _is_session_revoked_message(msg):
                return {
                    "status": "ok",
                    "valid": False,
                    "message": msg if msg.startswith("TG_SESSION_DEAD:") else f"TG_SESSION_DEAD: {msg}",
                }
            if _is_session_warm_pending_message(msg):
                return {
                    "status": "ok",
                    "valid": False,
                    "message": f"SESSION_WARM_PENDING: {msg}",
                }
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
    if _is_auth_key_dead_message(err_msg):
        return {
            "status": "ok",
            "valid": False,
            "message": _auth_key_dead_validate_message(err_msg),
        }
    if err_msg.startswith("TG_SESSION_DEAD:") or _is_session_revoked_message(err_msg):
        return {
            "status": "ok",
            "valid": False,
            "message": err_msg if err_msg.startswith("TG_SESSION_DEAD:") else f"TG_SESSION_DEAD: {err_msg}",
        }
    if session.status in ("pending", "confirming") or _is_session_warm_pending_message(err_msg):
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
