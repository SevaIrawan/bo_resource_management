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
    GetParticipantRequest,
    JoinChannelRequest,
)
from telethon.tl.functions.messages import ExportChatInviteRequest, ImportChatInviteRequest
from telethon.tl.functions.channels import TogglePreHistoryHiddenRequest
from telethon.tl.types import Channel, ChatAdminRights, User

from telegram_human_delay import (
    apply_join_invite_delay,
    flood_wait_seconds,
    max_floodwait_auto_sleep,
    merge_delay,
    sleep_key,
)
from telegram_login import SESSIONS, restore_telegram_session, tg_session_lock


def _ok(action: str, result: dict) -> dict:
    return {"status": "ok", "action": action, "result": result}


def _err(action: str, message: str, *, error_code: str = "AUTOMATION_FAILED") -> dict:
    return {"status": "error", "action": action, "message": message, "errorCode": error_code}


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
    if session_string and session_string.strip():
        restored = await restore_telegram_session(session_id, session_string.strip())
        if restored.get("status") == "error":
            return None, _err("prepare", restored.get("message", "Session restore failed"), error_code="SESSION_RESTORE_FAILED")

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


async def _export_invite_link(client, channel, delay_cfg: dict) -> str:
    retries = max(1, int(delay_cfg.get("invite_export_retries", 3)))
    gap = float(delay_cfg.get("invite_export_retry_sec", 3))
    last_err: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            invite = await client(ExportChatInviteRequest(peer=channel))
            link = (invite.link or "").strip()
            if link:
                return link
            last_err = RuntimeError("empty invite link")
        except FloodWaitError:
            raise
        except Exception as exc:  # noqa: BLE001
            last_err = exc
        if attempt < retries:
            await sleep_key(delay_cfg, "invite_export_retry_sec", default=gap)

    peer = str(utils.get_peer_id(channel))
    if last_err:
        return peer
    return peer


async def _resolve_group_entity(
    client,
    *,
    group_id: str | None,
    group_link: str | None,
    delay_cfg: dict | None = None,
):
    delay_cfg = merge_delay(delay_cfg)
    max_attempts = max(1, int(delay_cfg.get("resolve_entity_max_attempts", 3)))
    last_err: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            if group_link and group_link.strip():
                return await client.get_entity(group_link.strip())
            gid = (group_id or "").strip()
            if gid:
                try:
                    return await client.get_entity(int(gid))
                except ValueError:
                    return await client.get_entity(gid)
            raise ValueError("GROUP_TARGET_REQUIRED: group_id or group_link required")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < max_attempts:
                await sleep_key(delay_cfg, "invite_export_retry_sec", default=3.0)

    if last_err:
        raise last_err
    raise ValueError("GROUP_TARGET_REQUIRED: group_id or group_link required")


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
    batch_idx = max(1, int(batch_index or 1))

    async with tg_session_lock(session_id):
        client, prep_err = await _prepare_session(session_id, session_string, expected_phone)
        if prep_err:
            prep_err["action"] = action
            return prep_err

        try:
            if batch_idx > 1:
                await sleep_key(delay_cfg, "between_groups_sec", default=90.0)

            created = await client(
                CreateChannelRequest(title=name, about=about, megagroup=True)
            )
            channel = created.chats[0]
            group_id = str(int(channel.id))

            await sleep_key(delay_cfg, "after_create_sec", default=2.0)

            if hide_chat_history:
                await client(TogglePreHistoryHiddenRequest(channel=channel, enabled=True))

            me = await client.get_me()
            owner = f"@{me.username}" if me.username else (f"+{me.phone}" if me.phone else str(me.id))
            invite_link = await _export_invite_link(client, channel, delay_cfg)

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
            cap = max_floodwait_auto_sleep(delay_cfg)
            if int(exc.seconds) > cap:
                return _err(action, f"FloodWait {exc.seconds}s exceeds cap {cap}s", error_code="FLOOD_WAIT")
            await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
            return _err(action, f"FloodWait {exc.seconds}s — retry job", error_code="FLOOD_WAIT_RETRY")
        except Exception as exc:  # noqa: BLE001
            return _err(action, str(exc) or "create_group failed")


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
    normalized = [t.strip() for t in (targets or []) if t and t.strip()]
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
                user = await client.get_entity(target)
                if not isinstance(user, User):
                    skipped.append({"target": target, "reason": "not_user"})
                    continue

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
                    errors.append({"target": target, "error": f"FloodWait {exc.seconds}s — retry"})
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
        payload = {
            "status": status,
            "action": action,
            "result": {
                "promoted": promoted,
                "skipped": skipped,
                "errors": errors,
                "group_id": str(getattr(entity, "id", "") or group_id or ""),
            },
        }
        if status == "error" and not promoted:
            payload["message"] = "No targets promoted"
            payload["errorCode"] = "SET_ADMIN_FAILED"
        return payload


async def run_join_by_invite_link(
    session_id: str,
    *,
    invite_link: str,
    join_sequence_index: int = 1,
    session_string: str | None = None,
    expected_phone: str | None = None,
    delay: dict | None = None,
) -> dict:
    action = "join_by_invite_link"
    link = (invite_link or "").strip()
    if not link:
        return _err(action, "invite_link required", error_code="INVALID_PAYLOAD")

    delay_cfg = merge_delay(delay)

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
                    gid = str(int(chat.id)) if chat else ""
                    title = getattr(chat, "title", "") or gid
                    return _ok(
                        action,
                        {
                            "group_id": gid,
                            "group_name": title,
                            "invite_link": link,
                            "already_member": False,
                        },
                    )
                except UserAlreadyParticipantError:
                    entity = await client.get_entity(link)
                    return _ok(
                        action,
                        {
                            "group_id": str(int(entity.id)),
                            "group_name": getattr(entity, "title", "") or str(entity.id),
                            "invite_link": link,
                            "already_member": True,
                        },
                    )
                except (InviteHashExpiredError, InviteHashInvalidError) as exc:
                    return _err(action, str(exc), error_code="INVITE_INVALID")

            entity = await client.get_entity(link)
            if isinstance(entity, Channel):
                await client(JoinChannelRequest(entity))
                return _ok(
                    action,
                    {
                        "group_id": str(int(entity.id)),
                        "group_name": getattr(entity, "title", "") or str(entity.id),
                        "invite_link": link,
                        "already_member": False,
                    },
                )
            return _err(action, "Unsupported invite link format", error_code="INVITE_UNSUPPORTED")
        except FloodWaitError as exc:
            cap = max_floodwait_auto_sleep(delay_cfg)
            if int(exc.seconds) > cap:
                return _err(action, f"FloodWait {exc.seconds}s", error_code="FLOOD_WAIT")
            await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
            return _err(action, f"FloodWait {exc.seconds}s — retry job", error_code="FLOOD_WAIT_RETRY")
        except UserAlreadyParticipantError:
            return _ok(action, {"invite_link": link, "already_member": True})
        except Exception as exc:  # noqa: BLE001
            return _err(action, str(exc) or "join failed")
