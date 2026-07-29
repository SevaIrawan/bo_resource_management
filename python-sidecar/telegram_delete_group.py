"""Delete / clear Telegram group — Channel + basic Chat (owner vs dialog lokal)."""

from __future__ import annotations

import asyncio

from telethon.errors import (
    ChannelPrivateError,
    ChannelTooLargeError,
    ChatAdminRequiredError,
    FloodWaitError,
    UserCreatorError,
    UserNotParticipantError,
)
from telethon.tl.functions.channels import DeleteChannelRequest, GetParticipantRequest
from telethon.tl.functions.messages import DeleteChatRequest, DeleteHistoryRequest, GetFullChatRequest
from telethon.tl.types import Chat, ChatParticipantCreator

from telegram_automation import _basic_chat_id, _peer_group_id, _prepare_session, _resolve_group_entity
from telegram_human_delay import (
    flood_wait_seconds,
    max_floodwait_auto_sleep,
    merge_delay,
)
from telegram_login import tg_session_lock


def _ok(action: str, result: dict) -> dict:
    return {"status": "ok", "action": action, "result": result}


def _err(action: str, message: str, *, error_code: str = "AUTOMATION_FAILED") -> dict:
    return {"status": "error", "action": action, "message": message, "errorCode": error_code}


async def _is_creator(client, entity, me) -> bool:
    if isinstance(entity, Chat):
        try:
            full = await client(GetFullChatRequest(chat_id=_basic_chat_id(entity)))
            participants = getattr(full.full_chat, "participants", None)
            for p in getattr(participants, "participants", []) or []:
                if getattr(p, "user_id", None) != me.id:
                    continue
                if isinstance(p, ChatParticipantCreator):
                    return True
        except Exception:  # noqa: BLE001
            return False
        return False

    try:
        part = await client(GetParticipantRequest(entity, me))
        return part.participant.__class__.__name__ in ("ChannelParticipantCreator",)
    except Exception:  # noqa: BLE001
        return False


async def _delete_local_dialog(
    client,
    entity,
    *,
    clear_chat_history: bool,
    creator: bool,
    gid: str,
    action: str,
) -> dict:
    """
    Hapus chat/dialog di akun ini saja (bukan bubarkan grup).

    Setelah leave_group, Telethon delete_dialog untuk channel = LeaveChannel lagi —
    UserNotParticipantError / ChannelPrivateError = sudah left → treat sukses.
    """
    if clear_chat_history:
        try:
            await client(
                DeleteHistoryRequest(peer=entity, max_id=0, just_clear=True, revoke=False)
            )
        except Exception:  # noqa: BLE001
            pass

    try:
        await client.delete_dialog(entity)
        return _ok(
            action,
            {
                "group_id": gid,
                "outcome": "dialog_deleted",
                "creator": creator,
            },
        )
    except UserNotParticipantError:
        return _ok(
            action,
            {
                "group_id": gid,
                "outcome": "already_left",
                "creator": creator,
            },
        )
    except ChannelPrivateError:
        return _ok(
            action,
            {
                "group_id": gid,
                "outcome": "already_gone",
                "creator": creator,
            },
        )


async def run_delete_group(
    session_id: str,
    *,
    group_id: str | None = None,
    group_link: str | None = None,
    require_owner: bool = True,
    clear_chat_history: bool = True,
    session_string: str | None = None,
    expected_phone: str | None = None,
    delay: dict | None = None,
) -> dict:
    action = "delete_group"
    delay_cfg = merge_delay(delay)

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
            # Setelah leave, peer kadang tidak resolve — chat lokal sudah tidak relevan.
            if not require_owner:
                return _ok(
                    action,
                    {
                        "group_id": str(group_id or "").strip(),
                        "outcome": "already_gone",
                        "resolve_error": str(exc) or "not found",
                    },
                )
            return _err(action, f"Cannot resolve group: {exc}", error_code="GROUP_NOT_FOUND")

        gid = _peer_group_id(entity) or str(group_id or "").strip()
        me = await client.get_me()
        creator = await _is_creator(client, entity, me)

        try:
            if require_owner:
                if not creator:
                    return _err(
                        action,
                        "delete_group requires owner/creator (require_owner=true)",
                        error_code="TG_NOT_OWNER",
                    )
                if isinstance(entity, Chat):
                    await client(DeleteChatRequest(chat_id=_basic_chat_id(entity)))
                    return _ok(
                        action,
                        {
                            "group_id": gid,
                            "outcome": "deleted_chat",
                            "creator": True,
                        },
                    )
                await client(DeleteChannelRequest(channel=entity))
                return _ok(
                    action,
                    {
                        "group_id": gid,
                        "outcome": "deleted_channel",
                        "creator": True,
                    },
                )

            return await _delete_local_dialog(
                client,
                entity,
                clear_chat_history=clear_chat_history,
                creator=creator,
                gid=gid,
                action=action,
            )
        except ChannelTooLargeError:
            return _err(
                action,
                "Channel too large to delete via API (>1000 members)",
                error_code="TG_CHANNEL_TOO_LARGE",
            )
        except UserCreatorError:
            return _err(
                action,
                "Creator cannot leave without delete_channel — use delete_group with require_owner",
                error_code="TG_CREATOR_CANNOT_LEAVE",
            )
        except ChatAdminRequiredError:
            return _err(action, "Admin required for this delete operation", error_code="CHAT_ADMIN_REQUIRED")
        except FloodWaitError as exc:
            cap = max_floodwait_auto_sleep(delay_cfg)
            if int(exc.seconds) > cap:
                return _err(action, f"FloodWait {exc.seconds}s exceeds cap {cap}s", error_code="FLOOD_WAIT")
            await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
            return _err(action, f"FloodWait {exc.seconds}s — retry job", error_code="FLOOD_WAIT_RETRY")
        except TypeError as cast_exc:
            msg = str(cast_exc).lower()
            if require_owner and ("inputpeerchat" in msg or "inputchannel" in msg):
                try:
                    chat_id = getattr(entity, "id", None)
                    if chat_id is None:
                        raise cast_exc
                    await client(DeleteChatRequest(chat_id=abs(int(chat_id))))
                    return _ok(
                        action,
                        {
                            "group_id": gid,
                            "outcome": "deleted_chat",
                            "creator": True,
                        },
                    )
                except Exception as retry_exc:  # noqa: BLE001
                    return _err(action, str(retry_exc) or str(cast_exc) or "delete failed")
            return _err(action, str(cast_exc) or "delete failed")
        except Exception as exc:  # noqa: BLE001
            return _err(action, str(exc) or "delete failed")
