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

from telegram_login import SESSIONS, restore_telegram_session, tg_session_lock

DEVICE_GROUP_TARGET_MAX = 3000

_scrape_progress: dict[str, dict] = {}


def clear_scrape_progress(session_id: str) -> None:
    _scrape_progress.pop(session_id, None)


def set_scrape_progress(
    session_id: str,
    *,
    phase: str,
    current: int = 0,
    total: int = 0,
    label: str = "",
) -> None:
    _scrape_progress[session_id] = {
        "phase": phase,
        "current": current,
        "total": total,
        "label": label,
    }


def get_scrape_progress(session_id: str) -> dict:
    return _scrape_progress.get(
        session_id,
        {"phase": "idle", "current": 0, "total": 0, "label": ""},
    )


def _admin_label(is_admin: bool) -> str:
    return "yes" if is_admin else "no"


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
    async with tg_session_lock(session_id):
        return await _collect_groups_locked(session_id)


async def _collect_groups_locked(session_id: str) -> dict:
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
    me_label = me.username or me.phone or str(me.id)

    clear_scrape_progress(session_id)
    try:
        set_scrape_progress(session_id, phase="discover", label="Discovering groups on Telegram")

        targets: list = []
        total_on_account = 0
        async for dialog in client.iter_dialogs():
            if not _is_group_dialog(dialog):
                continue
            total_on_account += 1
            if len(targets) < DEVICE_GROUP_TARGET_MAX:
                targets.append(dialog)

        if total_on_account > DEVICE_GROUP_TARGET_MAX:
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
            entity = dialog.entity
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
                participants = await client.get_participants(entity, limit=0)
                member_count = int(participants.total or 0)
            except Exception:  # noqa: BLE001
                member_count = 0

            is_admin_flag = await _is_group_admin(client, entity, me)
            owner_count, admin_count = await _count_admin_roles(client, entity)
            username = getattr(entity, "username", None)
            invite_link = await _resolve_invite_link(client, entity, username)

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

        admin_count = sum(1 for group in groups if group["is_admin"] == "yes")
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
    finally:
        clear_scrape_progress(session_id)


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


async def _count_groups_quick_locked(session_id: str) -> dict:
    session = SESSIONS.get(session_id)
    if not session:
        return {"status": "error", "message": "Login session not found. Log in first.", "valid": False}
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
    total_groups = 0
    admin_groups = 0

    async for dialog in client.iter_dialogs():
        if not _is_group_dialog(dialog):
            continue
        total_groups += 1
        try:
            if await _is_group_admin(client, dialog.entity, me):
                admin_groups += 1
        except Exception:  # noqa: BLE001
            pass

    return {
        "status": "ok",
        "valid": True,
        "totalGroups": total_groups,
        "adminGroups": admin_groups,
    }


async def _count_groups_quick(session_id: str) -> dict:
    async with tg_session_lock(session_id):
        return await _count_groups_quick_locked(session_id)


async def count_telegram_groups(
    session_id: str,
    session_string: str | None = None,
    *,
    quick: bool = False,
) -> dict:
    session = SESSIONS.get(session_id)
    if not session and session_string:
        restored = await restore_telegram_session(session_id, session_string)
        if restored.get("status") == "error":
            return {
                "status": "error",
                "valid": False,
                "message": restored.get("message", "Session restore failed"),
            }

    if quick:
        quick_result = await _count_groups_quick(session_id)
        if quick_result.get("status") == "error":
            return quick_result
        return {
            "status": "ok",
            "valid": True,
            "totalGroups": quick_result.get("totalGroups", 0),
            "adminGroups": quick_result.get("adminGroups", 0),
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
