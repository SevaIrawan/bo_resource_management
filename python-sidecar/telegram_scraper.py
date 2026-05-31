from __future__ import annotations

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

from telegram_login import SESSIONS, restore_telegram_session


def _admin_label(is_admin: bool) -> str:
    return "yes" if is_admin else "no"


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


async def _resolve_invite_link(client, entity, username: str | None) -> str | None:
    if username:
        return f"https://t.me/{username}"
    try:
        exported = await client(ExportChatInviteRequest(peer=entity))
        link = getattr(exported, "link", None)
        return str(link) if link else None
    except Exception:  # noqa: BLE001
        return None


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


async def _collect_groups(session_id: str) -> dict:
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
    if not await client.is_user_authorized():
        return {"status": "error", "message": "Session is not authorized", "valid": False}

    me = await client.get_me()
    groups: list[dict] = []

    async for dialog in client.iter_dialogs():
        entity = dialog.entity
        is_group = dialog.is_group
        is_megagroup = isinstance(entity, Channel) and bool(getattr(entity, "megagroup", False))
        if not is_group and not is_megagroup:
            continue

        group_id = str(dialog.id)
        group_name = dialog.title or dialog.name or group_id

        try:
            participants = await client.get_participants(entity, limit=0)
            member_count = int(participants.total or 0)
        except Exception:  # noqa: BLE001
            member_count = 0

        is_admin_flag = await _is_group_admin(client, entity, me)
        owner_count, admin_count = await _count_admin_roles(client, entity)
        username = getattr(entity, "username", None)
        invite_link = await _resolve_invite_link(client, entity, username)

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

    admin_count = sum(1 for group in groups if group["is_admin"] == "yes")
    me_label = me.username or me.phone or str(me.id)
    payload = {
        "status": "ok",
        "valid": True,
        "groups": groups,
        "count": len(groups),
        "adminCount": admin_count,
        "telegramUser": me_label,
    }
    if len(groups) == 0:
        payload["hint"] = "ZERO_GROUPS_ON_ACCOUNT"
        payload["message"] = (
            f"Telegram @{me_label} tidak punya grup terdeteksi. "
            "Login ulang jika ini bukan akun yang dimaksud."
        )
    return payload


async def scrape_telegram_groups(
    session_id: str,
    session_string: str | None = None,
) -> dict:
    if session_string and session_string.strip():
        restored = await restore_telegram_session(session_id, session_string.strip())
        if restored.get("status") == "error":
            return {
                "status": "error",
                "message": restored.get("message", "Session restore failed"),
            }

    result = await _collect_groups(session_id)
    if result.get("status") == "error":
        return result
    payload = dict(result)
    payload.pop("valid", None)
    payload.pop("adminCount", None)
    return payload


async def count_telegram_groups(session_id: str, session_string: str | None = None) -> dict:
    session = SESSIONS.get(session_id)
    if not session and session_string:
        restored = await restore_telegram_session(session_id, session_string)
        if restored.get("status") == "error":
            return {
                "status": "error",
                "valid": False,
                "message": restored.get("message", "Session restore failed"),
            }

    result = await _collect_groups(session_id)
    if result.get("status") == "error":
        return {
            "status": "error",
            "valid": False,
            "message": result.get("message", "Count failed"),
        }

    return {
        "status": "ok",
        "valid": True,
        "totalGroups": result["count"],
        "adminGroups": result["adminCount"],
    }


async def validate_telegram_session(session_id: str, session_string: str | None = None) -> dict:
    from telegram_login import SESSIONS, _verify_client_live, restore_telegram_session

    session = SESSIONS.get(session_id)
    if not session and session_string:
        restored = await restore_telegram_session(session_id, session_string)
        if restored.get("status") == "error":
            return {
                "status": "ok",
                "valid": False,
                "message": restored.get("message", "Session restore failed"),
            }

    session = SESSIONS.get(session_id)
    if not session:
        return {
            "status": "ok",
            "valid": False,
            "message": "Login session not found. Log in first.",
        }

    ok, err = await _verify_client_live(session.client)
    if ok:
        session.status = "ready"
        return {"status": "ok", "valid": True}
    return {
        "status": "ok",
        "valid": False,
        "message": err or f"Session not ready (status={session.status})",
    }
