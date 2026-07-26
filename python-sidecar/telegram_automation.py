from __future__ import annotations

import asyncio
import re
from typing import Any

from telethon import utils
from telethon.errors import (
    ChatAdminRequiredError,
    FloodWaitError,
    InviteHashExpiredError,
    InviteHashInvalidError,
    UserAlreadyParticipantError,
    UserNotParticipantError,
    UserPrivacyRestrictedError,
)
from telethon.tl.functions.channels import (
    CreateChannelRequest,
    EditAdminRequest,
    GetFullChannelRequest,
    GetParticipantRequest,
    JoinChannelRequest,
    TogglePreHistoryHiddenRequest,
)
from telethon.tl.functions.contacts import ImportContactsRequest
from telethon.tl.functions.messages import (
    CheckChatInviteRequest,
    ExportChatInviteRequest,
    ImportChatInviteRequest,
)
from telethon.tl.types import (
    Channel,
    ChatAdminRights,
    InputPhoneContact,
    User,
)

from telegram_human_delay import (
    apply_join_invite_delay,
    flood_wait_seconds,
    max_floodwait_auto_sleep,
    merge_delay,
    sleep_key,
)
from telegram_login import SESSIONS, _restore_telegram_session_locked, tg_session_lock


def _ok(action: str, result: dict) -> dict:
    return {"status": "ok", "action": action, "result": result}


def _err(action: str, message: str, *, error_code: str = "AUTOMATION_FAILED") -> dict:
    return {"status": "error", "action": action, "message": message, "errorCode": error_code}


def _peer_group_id(entity) -> str:
    """Selaras scrape dialog.id — peer id channel biasanya -100…"""
    try:
        return str(utils.get_peer_id(entity))
    except Exception:  # noqa: BLE001
        return str(getattr(entity, "id", "") or "")


def _is_http_invite_link(link: str) -> bool:
    value = (link or "").strip().lower()
    return (
        value.startswith("http://")
        or value.startswith("https://")
        or value.startswith("t.me/")
    )


def _normalize_phone_digits(raw: str) -> str:
    return "".join(ch for ch in raw if ch.isdigit())


def _phones_match(a: str, b: str) -> bool:
    da = _normalize_phone_digits(a)
    db = _normalize_phone_digits(b)
    if not da or not db:
        return False
    return da == db or da.endswith(db) or db.endswith(da)


async def _prepare_session(
    session_id: str,
    session_string: str | None,
    expected_phone: str | None,
) -> tuple[Any | None, dict | None]:
    """Caller MUST hold tg_session_lock(session_id) — jangan panggil restore_telegram_session (deadlock)."""
    session = SESSIONS.get(session_id)
    if session_string and session_string.strip() and (not session or session.status != "ready"):
        restored = await _restore_telegram_session_locked(session_id, session_string.strip())
        if restored.get("status") == "error":
            return None, _err(
                "prepare",
                restored.get("message", "Session restore failed"),
                error_code="SESSION_RESTORE_FAILED",
            )

    session = SESSIONS.get(session_id)
    if not session:
        return None, _err("prepare", "Login session not found. Log in first.", error_code="SESSION_NOT_FOUND")
    if session.status != "ready":
        return None, _err(
            "prepare",
            f"Session not ready (status={session.status}). Complete login first.",
            error_code="SESSION_NOT_READY",
        )

    client = session.client
    if not client.is_connected():
        await client.connect()
    if not await client.is_user_authorized():
        return None, _err("prepare", "Session is not authorized", error_code="SESSION_UNAUTHORIZED")

    me = await client.get_me()
    exp = (expected_phone or "").strip()
    if exp and me.phone and not _phones_match(me.phone, exp):
        return None, _err(
            "prepare",
            f"TG_ACCOUNT_MISMATCH: logged in as {me.phone}, expected {exp}",
            error_code="TG_ACCOUNT_MISMATCH",
        )

    return client, None


def _default_admin_rights() -> ChatAdminRights:
    return ChatAdminRights(
        change_info=True,
        post_messages=True,
        edit_messages=True,
        delete_messages=True,
        ban_users=True,
        invite_users=True,
        pin_messages=True,
        add_admins=True,
        anonymous=False,
        manage_call=True,
    )


def _admin_rights_from_payload(raw: dict | None) -> ChatAdminRights:
    if not isinstance(raw, dict):
        return _default_admin_rights()
    fields = {
        "change_info": True,
        "post_messages": True,
        "edit_messages": True,
        "delete_messages": True,
        "ban_users": True,
        "invite_users": True,
        "pin_messages": True,
        "add_admins": True,
        "anonymous": False,
        "manage_call": True,
        "delete_stories": False,
    }
    for key in fields:
        if key in raw:
            fields[key] = bool(raw[key])
    return ChatAdminRights(**fields)


def extract_invite_hash(link: str) -> str | None:
    value = (link or "").strip()
    if not value:
        return None
    if "+" in value:
        part = value.split("+", 1)[1]
        return part.split("?")[0].strip() or None
    m = re.search(r"joinchat/([^/?#]+)", value, re.I)
    if m:
        return m.group(1).strip() or None
    return None


async def _resolve_joined_peer(
    client,
    *,
    link: str,
    invite_hash: str | None,
    expected_group_id: str | None,
) -> tuple[str, str]:
    """Resolve peer id setelah join / already_member. Jangan return sukses tanpa id."""
    expected = (expected_group_id or "").strip()

    try:
        entity = await client.get_entity(link)
        gid = _peer_group_id(entity)
        if gid:
            return gid, str(getattr(entity, "title", "") or gid)
    except Exception:  # noqa: BLE001
        pass

    if invite_hash:
        try:
            invite = await client(CheckChatInviteRequest(invite_hash))
            chat = getattr(invite, "chat", None)
            if chat is not None:
                gid = _peer_group_id(chat)
                if gid:
                    return gid, str(getattr(chat, "title", "") or gid)
        except Exception:  # noqa: BLE001
            pass

    if expected:
        try:
            entity = await client.get_entity(
                int(expected) if re.fullmatch(r"-?\d+", expected) else expected
            )
            me = await client.get_me()
            try:
                await client(GetParticipantRequest(entity, me))
                return _peer_group_id(entity), str(getattr(entity, "title", "") or expected)
            except UserNotParticipantError:
                pass
            except Exception:  # noqa: BLE001
                try:
                    await client.get_permissions(entity, me)
                    return _peer_group_id(entity), str(getattr(entity, "title", "") or expected)
                except Exception:  # noqa: BLE001
                    pass
        except Exception:  # noqa: BLE001
            pass

    return "", ""


def _join_ok(
    action: str,
    *,
    group_id: str,
    group_name: str,
    invite_link: str,
    already_member: bool,
) -> dict:
    gid = (group_id or "").strip()
    if not gid:
        return _err(
            action,
            "Joined but peer id unresolved — scrape/Sync required to verify",
            error_code="JOIN_PEER_UNRESOLVED",
        )
    return _ok(
        action,
        {
            "group_id": gid,
            "group_name": (group_name or "").strip() or gid,
            "invite_link": invite_link,
            "already_member": already_member,
        },
    )


async def _export_invite_link(client, channel, delay_cfg: dict) -> str:
    """Return real invite URL only — never peer id as fake link.

    Baca exported_invite dari GetFull dulu,
    baru ExportChatInviteRequest (hemat API + kurang FloodWait).
    """
    try:
        full = await client(GetFullChannelRequest(channel))
        exported = getattr(full.full_chat, "exported_invite", None)
        link = (getattr(exported, "link", None) or "").strip() if exported is not None else ""
        if link and _is_http_invite_link(link):
            return link
    except FloodWaitError:
        raise
    except Exception:  # noqa: BLE001
        pass

    retries = max(1, int(delay_cfg.get("invite_export_retries", 3)))
    gap = float(delay_cfg.get("invite_export_retry_sec", 3))
    last_err: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            invite = await client(ExportChatInviteRequest(peer=channel))
            link = (invite.link or "").strip()
            if link and _is_http_invite_link(link):
                return link
            last_err = RuntimeError("empty or invalid invite link")
        except FloodWaitError as exc:
            cap = max_floodwait_auto_sleep(delay_cfg)
            if int(exc.seconds) > cap:
                raise
            await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
            last_err = exc
            continue
        except Exception as exc:  # noqa: BLE001
            last_err = exc
        if attempt < retries:
            await sleep_key(delay_cfg, "invite_export_retry_sec", default=gap)

    if last_err:
        print(f"[tg-automation] invite export failed: {last_err}")
    return ""


async def _resolve_group_entity(
    client,
    *,
    group_id: str | None,
    group_link: str | None,
    delay_cfg: dict | None = None,
):
    """Prefer numeric group_id (member already in chat). Invite link is fallback only."""
    delay_cfg = merge_delay(delay_cfg)
    max_attempts = max(1, int(delay_cfg.get("resolve_entity_max_attempts", 3)))
    last_err: Exception | None = None
    gid = (group_id or "").strip()
    link = (group_link or "").strip()

    async def _by_id() -> Any:
        if not gid:
            raise ValueError("GROUP_ID_REQUIRED")
        try:
            return await client.get_entity(int(gid))
        except ValueError:
            return await client.get_entity(gid)

    async def _by_link() -> Any:
        if not link:
            raise ValueError("GROUP_LINK_REQUIRED")
        invite_hash = extract_invite_hash(link)
        if invite_hash:
            try:
                invite = await client(CheckChatInviteRequest(invite_hash))
                chat = getattr(invite, "chat", None)
                if chat is not None:
                    return chat
            except Exception:  # noqa: BLE001
                pass
        return await client.get_entity(link)

    for attempt in range(1, max_attempts + 1):
        try:
            if gid:
                try:
                    return await _by_id()
                except Exception as id_exc:  # noqa: BLE001
                    last_err = id_exc
                    if link:
                        return await _by_link()
                    raise
            if link:
                return await _by_link()
            raise ValueError("GROUP_TARGET_REQUIRED: group_id or group_link required")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < max_attempts:
                await sleep_key(delay_cfg, "invite_export_retry_sec", default=3.0)

    if last_err:
        raise last_err
    raise ValueError("GROUP_TARGET_REQUIRED: group_id or group_link required")


async def _find_recent_group_by_title(client, title: str):
    """Recover orphan create: channel exists on device but HTTP/response lost group_id."""
    want = (title or "").strip()
    if not want:
        return None
    try:
        async for dialog in client.iter_dialogs(limit=40):
            name = str(getattr(dialog, "name", "") or "").strip()
            if name != want:
                continue
            entity = getattr(dialog, "entity", None)
            if entity is not None:
                return entity
    except Exception:  # noqa: BLE001
        return None
    return None


async def _resolve_set_admin_user(client, target: str):
    """Resolve promote target by phone/username; ImportContacts + participant scan fallback."""
    value = (target or "").strip()
    if not value:
        raise ValueError("empty target")

    try:
        user = await client.get_entity(value)
        if isinstance(user, User):
            return user
    except Exception:  # noqa: BLE001
        pass

    digits = _normalize_phone_digits(value)
    if digits:
        try:
            imported = await client(
                ImportContactsRequest(
                    [
                        InputPhoneContact(
                            client_id=0,
                            phone=f"+{digits}",
                            first_name="RM",
                            last_name="Target",
                        )
                    ]
                )
            )
            users = list(getattr(imported, "users", None) or [])
            if users and isinstance(users[0], User):
                return users[0]
            if getattr(imported, "retry_contacts", None):
                await asyncio.sleep(1.0)
                user = await client.get_entity(f"+{digits}")
                if isinstance(user, User):
                    return user
        except Exception:  # noqa: BLE001
            pass

        try:
            user = await client.get_entity(f"+{digits}")
            if isinstance(user, User):
                return user
        except Exception:  # noqa: BLE001
            pass

    raise ValueError(f"Cannot resolve target: {value}")


async def _find_participant_by_phone(client, entity, phone_digits: str):
    if not phone_digits:
        return None
    try:
        async for user in client.iter_participants(entity):
            if not isinstance(user, User):
                continue
            if _phones_match(getattr(user, "phone", "") or "", phone_digits):
                return user
    except Exception:  # noqa: BLE001
        return None
    return None


async def _participant_is_admin(client, entity, user) -> tuple[bool, bool]:
    try:
        part = await client(GetParticipantRequest(entity, user))
        participant = part.participant
        cls = participant.__class__.__name__
        in_group = True
        already_admin = "Admin" in cls or "Creator" in cls
        return in_group, already_admin
    except UserNotParticipantError:
        return False, False


async def run_create_group(
    session_id: str,
    *,
    group_name: str,
    description: str = "",
    hide_chat_history: bool = False,
    batch_index: int = 1,
    session_string: str | None = None,
    expected_phone: str | None = None,
    delay: dict | None = None,
) -> dict:
    action = "create_group"
    name = (group_name or "").strip()
    if not name:
        return _err(action, "group_name required", error_code="INVALID_PAYLOAD")

    delay_cfg = merge_delay(delay)
    about = (description or "").strip()[:255]
    # between_groups sleep belongs in Electron batch loop (HTTP timeout).
    # Keep a short post-create pause only (cap) so invite export stays inside request.
    after_create = min(15.0, float(delay_cfg.get("after_create_sec", 2.0) or 2.0))

    async with tg_session_lock(session_id):
        client, prep_err = await _prepare_session(session_id, session_string, expected_phone)
        if prep_err:
            prep_err["action"] = action
            return prep_err

        channel = None
        group_id = ""
        try:
            created = await client(
                CreateChannelRequest(title=name, about=about, megagroup=True)
            )
            channel = created.chats[0]
            group_id = _peer_group_id(channel)

            if after_create > 0:
                await asyncio.sleep(after_create)

            if hide_chat_history:
                try:
                    await client(TogglePreHistoryHiddenRequest(channel=channel, enabled=True))
                except FloodWaitError as exc:
                    cap = max_floodwait_auto_sleep(delay_cfg)
                    if int(exc.seconds) <= cap:
                        await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
                        await client(TogglePreHistoryHiddenRequest(channel=channel, enabled=True))
                    else:
                        print(f"[tg-automation] hide history FloodWait {exc.seconds}s skipped")
                except Exception as hide_exc:  # noqa: BLE001
                    print(f"[tg-automation] hide history skipped: {hide_exc}")

            me = await client.get_me()
            owner = f"@{me.username}" if me.username else (f"+{me.phone}" if me.phone else str(me.id))
            invite_link = ""
            try:
                invite_link = await _export_invite_link(client, channel, delay_cfg)
            except Exception as invite_exc:  # noqa: BLE001
                print(f"[tg-automation] invite export after create skipped: {invite_exc}")

            # Group already on device — always success if we have peer id.
            return _ok(
                action,
                {
                    "group_id": group_id,
                    "group_name": name,
                    "invite_link": invite_link,
                    "owner": owner,
                },
            )
        except FloodWaitError as exc:
            if channel is not None and group_id:
                invite_link = ""
                try:
                    cap = max_floodwait_auto_sleep(delay_cfg)
                    if int(exc.seconds) <= cap:
                        await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
                        invite_link = await _export_invite_link(client, channel, delay_cfg)
                except Exception:  # noqa: BLE001
                    invite_link = ""
                me = await client.get_me()
                owner = (
                    f"@{me.username}"
                    if me.username
                    else (f"+{me.phone}" if me.phone else str(me.id))
                )
                return _ok(
                    action,
                    {
                        "group_id": group_id,
                        "group_name": name,
                        "invite_link": invite_link,
                        "owner": owner,
                        "flood_wait_partial": True,
                    },
                )
            # Rate limit before create — try recover if Telegram still created title.
            recovered = await _find_recent_group_by_title(client, name)
            if recovered is not None:
                gid = _peer_group_id(recovered)
                if gid:
                    return _ok(
                        action,
                        {
                            "group_id": gid,
                            "group_name": name,
                            "invite_link": "",
                            "owner": "",
                            "recovered_orphan": True,
                        },
                    )
            cap = max_floodwait_auto_sleep(delay_cfg)
            if int(exc.seconds) > cap:
                return _err(action, f"FloodWait {exc.seconds}s exceeds cap {cap}s", error_code="FLOOD_WAIT")
            await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
            return _err(action, f"FloodWait {exc.seconds}s — retry job", error_code="FLOOD_WAIT_RETRY")
        except Exception as exc:  # noqa: BLE001
            if channel is not None and group_id:
                return _ok(
                    action,
                    {
                        "group_id": group_id,
                        "group_name": name,
                        "invite_link": "",
                        "owner": "",
                        "post_create_error": str(exc) or "post_create_failed",
                    },
                )
            recovered = await _find_recent_group_by_title(client, name)
            if recovered is not None:
                gid = _peer_group_id(recovered)
                if gid:
                    return _ok(
                        action,
                        {
                            "group_id": gid,
                            "group_name": name,
                            "invite_link": "",
                            "owner": "",
                            "recovered_orphan": True,
                            "post_create_error": str(exc) or "post_create_failed",
                        },
                    )
            return _err(action, str(exc) or "create_group failed")


def _normalize_set_admin_target(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        return value
    if value.startswith("@") or value.startswith("+"):
        return value
    digits = _normalize_phone_digits(value)
    if digits and value.replace(" ", "").replace("-", "").isdigit():
        return f"+{digits}"
    return value


async def run_set_admin(
    session_id: str,
    *,
    targets: list[str],
    group_id: str | None = None,
    group_link: str | None = None,
    admin_rights: dict | None = None,
    session_string: str | None = None,
    expected_phone: str | None = None,
    delay: dict | None = None,
) -> dict:
    action = "set_admin"
    normalized = [_normalize_set_admin_target(t) for t in (targets or []) if t and t.strip()]
    normalized = [t for t in normalized if t]
    if not normalized:
        return _err(action, "targets required", error_code="INVALID_PAYLOAD")

    delay_cfg = merge_delay(delay)
    rights = _admin_rights_from_payload(admin_rights)
    max_slots = max(1, int(delay_cfg.get("max_admin_slots", 5)))
    normalized = normalized[:max_slots]

    async with tg_session_lock(session_id):
        client, prep_err = await _prepare_session(session_id, session_string, expected_phone)
        if prep_err:
            prep_err["action"] = action
            return prep_err

        try:
            entity = await _resolve_group_entity(
                client,
                group_id=group_id,
                group_link=group_link,
                delay_cfg=delay_cfg,
            )
        except Exception as exc:  # noqa: BLE001
            return _err(action, f"Cannot resolve group: {exc}", error_code="GROUP_NOT_FOUND")

        promoted: list[str] = []
        skipped: list[dict] = []
        errors: list[dict] = []

        for index, target in enumerate(normalized):
            try:
                try:
                    user = await _resolve_set_admin_user(client, target)
                except Exception as resolve_exc:  # noqa: BLE001
                    digits = _normalize_phone_digits(target)
                    user = await _find_participant_by_phone(client, entity, digits) if digits else None
                    if user is None:
                        errors.append(
                            {
                                "target": target,
                                "error": f"resolve_failed: {resolve_exc}",
                            }
                        )
                        continue

                if not isinstance(user, User):
                    skipped.append({"target": target, "reason": "not_user"})
                    continue

                in_group, already_admin = await _participant_is_admin(client, entity, user)
                if not in_group:
                    # Re-check via phone scan — GetParticipant can miss after ImportContacts.
                    digits = _normalize_phone_digits(target)
                    scanned = await _find_participant_by_phone(client, entity, digits) if digits else None
                    if scanned is not None:
                        user = scanned
                        in_group, already_admin = await _participant_is_admin(client, entity, user)
                if not in_group:
                    skipped.append({"target": target, "reason": "not_member"})
                    continue
                if already_admin:
                    promoted.append(target)
                    continue

                await client(
                    EditAdminRequest(
                        channel=entity,
                        user_id=user,
                        admin_rights=rights,
                        rank="Admin",
                    )
                )
                promoted.append(target)
            except FloodWaitError as exc:
                cap = max_floodwait_auto_sleep(delay_cfg)
                if int(exc.seconds) > cap:
                    errors.append({"target": target, "error": f"FloodWait {exc.seconds}s"})
                else:
                    await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
                    try:
                        user = await _resolve_set_admin_user(client, target)
                        await client(
                            EditAdminRequest(
                                channel=entity,
                                user_id=user,
                                admin_rights=rights,
                                rank="Admin",
                            )
                        )
                        promoted.append(target)
                    except Exception as retry_exc:  # noqa: BLE001
                        errors.append(
                            {
                                "target": target,
                                "error": f"FloodWait retry failed: {retry_exc}",
                            }
                        )
            except UserNotParticipantError:
                skipped.append({"target": target, "reason": "not_member"})
            except UserPrivacyRestrictedError:
                skipped.append({"target": target, "reason": "privacy_restricted"})
            except ChatAdminRequiredError:
                return _err(action, "Caller is not admin in this group", error_code="CHAT_ADMIN_REQUIRED")
            except Exception as exc:  # noqa: BLE001
                errors.append({"target": target, "error": str(exc)[:300]})

            if index < len(normalized) - 1:
                await sleep_key(delay_cfg, "between_targets_sec", default=3.0)

        status = "ok" if promoted and not errors else ("error" if not promoted else "ok")
        detail_bits: list[str] = []
        for row in skipped:
            detail_bits.append(f"{row.get('target')}:{row.get('reason')}")
        for row in errors:
            detail_bits.append(f"{row.get('target')}:{row.get('error')}")
        payload = {
            "status": status,
            "action": action,
            "result": {
                "promoted": promoted,
                "skipped": skipped,
                "errors": errors,
                "group_id": _peer_group_id(entity) if entity else str(group_id or ""),
            },
        }
        if status == "error" and not promoted:
            detail = "; ".join(detail_bits)[:400] if detail_bits else "No targets promoted"
            payload["message"] = detail if detail_bits else "No targets promoted"
            payload["errorCode"] = "SET_ADMIN_FAILED"
        return payload


async def run_join_by_invite_link(
    session_id: str,
    *,
    invite_link: str,
    join_sequence_index: int = 1,
    session_string: str | None = None,
    expected_phone: str | None = None,
    expected_group_id: str | None = None,
    delay: dict | None = None,
) -> dict:
    action = "join_by_invite_link"
    link = (invite_link or "").strip()
    if not link:
        return _err(action, "invite_link required", error_code="INVALID_PAYLOAD")

    delay_cfg = merge_delay(delay)
    expected = (expected_group_id or "").strip() or None

    async with tg_session_lock(session_id):
        client, prep_err = await _prepare_session(session_id, session_string, expected_phone)
        if prep_err:
            prep_err["action"] = action
            return prep_err

        await apply_join_invite_delay(delay_cfg, join_sequence_index)

        try:
            invite_hash = extract_invite_hash(link)
            if invite_hash:
                try:
                    updates = await client(ImportChatInviteRequest(invite_hash))
                    chats = getattr(updates, "chats", None) or []
                    chat = chats[0] if chats else None
                    gid = _peer_group_id(chat) if chat else ""
                    title = str(getattr(chat, "title", "") or gid) if chat else ""
                    if not gid:
                        gid, title = await _resolve_joined_peer(
                            client,
                            link=link,
                            invite_hash=invite_hash,
                            expected_group_id=expected,
                        )
                    return _join_ok(
                        action,
                        group_id=gid,
                        group_name=title,
                        invite_link=link,
                        already_member=False,
                    )
                except UserAlreadyParticipantError:
                    gid, title = await _resolve_joined_peer(
                        client,
                        link=link,
                        invite_hash=invite_hash,
                        expected_group_id=expected,
                    )
                    return _join_ok(
                        action,
                        group_id=gid,
                        group_name=title,
                        invite_link=link,
                        already_member=True,
                    )
                except (InviteHashExpiredError, InviteHashInvalidError) as exc:
                    return _err(action, str(exc), error_code="INVITE_INVALID")

            entity = await client.get_entity(link)
            if isinstance(entity, Channel):
                try:
                    await client(JoinChannelRequest(entity))
                    return _join_ok(
                        action,
                        group_id=_peer_group_id(entity),
                        group_name=str(getattr(entity, "title", "") or _peer_group_id(entity)),
                        invite_link=link,
                        already_member=False,
                    )
                except UserAlreadyParticipantError:
                    gid, title = await _resolve_joined_peer(
                        client,
                        link=link,
                        invite_hash=None,
                        expected_group_id=expected,
                    )
                    if not gid:
                        gid = _peer_group_id(entity)
                        title = str(getattr(entity, "title", "") or gid)
                    return _join_ok(
                        action,
                        group_id=gid,
                        group_name=title,
                        invite_link=link,
                        already_member=True,
                    )
            return _err(action, "Unsupported invite link format", error_code="INVITE_UNSUPPORTED")
        except FloodWaitError as exc:
            cap = max_floodwait_auto_sleep(delay_cfg)
            if int(exc.seconds) > cap:
                return _err(action, f"FloodWait {exc.seconds}s", error_code="FLOOD_WAIT")
            await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
            return _err(action, f"FloodWait {exc.seconds}s — retry job", error_code="FLOOD_WAIT_RETRY")
        except UserAlreadyParticipantError:
            gid, title = await _resolve_joined_peer(
                client,
                link=link,
                invite_hash=extract_invite_hash(link),
                expected_group_id=expected,
            )
            return _join_ok(
                action,
                group_id=gid,
                group_name=title,
                invite_link=link,
                already_member=True,
            )
        except Exception as exc:  # noqa: BLE001
            return _err(action, str(exc) or "join failed")
