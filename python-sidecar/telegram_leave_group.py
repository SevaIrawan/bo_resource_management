"""Leave Telegram group — Channel/megagroup + basic Chat."""

from __future__ import annotations

import asyncio

from telethon.errors import (
    FloodWaitError,
    UserCreatorError,
    UserNotParticipantError,
)
from telethon.tl.functions.channels import LeaveChannelRequest
from telethon.tl.functions.messages import DeleteChatUserRequest
from telethon.tl.types import Channel, Chat

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


async def run_leave_group(
    session_id: str,
    *,
    group_id: str | None = None,
    group_link: str | None = None,
    session_string: str | None = None,
    expected_phone: str | None = None,
    delay: dict | None = None,
) -> dict:
    action = "leave_group"
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
            return _err(action, f"Cannot resolve group: {exc}", error_code="GROUP_NOT_FOUND")

        gid = _peer_group_id(entity) or str(group_id or "").strip()

        try:
            if isinstance(entity, Chat):
                # Basic group: kick self (LeaveChannelRequest hanya untuk Channel).
                await client(
                    DeleteChatUserRequest(
                        chat_id=_basic_chat_id(entity),
                        user_id="me",
                    )
                )
            elif isinstance(entity, Channel):
                await client(LeaveChannelRequest(channel=entity))
            else:
                # Fallback: delete_dialog (leave + tutup dialog).
                await client.delete_dialog(entity)

            return _ok(
                action,
                {
                    "group_id": gid,
                    "outcome": "left",
                    "already_member": False,
                },
            )
        except UserNotParticipantError:
            return _ok(
                action,
                {
                    "group_id": gid,
                    "outcome": "left",
                    "already_member": False,
                    "already_left": True,
                },
            )
        except UserCreatorError:
            return _err(
                action,
                "Cannot leave: you are the channel/group creator. Transfer ownership or use delete_group.",
                error_code="TG_CREATOR_CANNOT_LEAVE",
            )
        except FloodWaitError as exc:
            cap = max_floodwait_auto_sleep(delay_cfg)
            if int(exc.seconds) > cap:
                return _err(action, f"FloodWait {exc.seconds}s exceeds cap {cap}s", error_code="FLOOD_WAIT")
            await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
            return _err(action, f"FloodWait {exc.seconds}s — retry job", error_code="FLOOD_WAIT_RETRY")
        except TypeError as cast_exc:
            # Peer Chat kena LeaveChannel — coba DeleteChatUser.
            msg = str(cast_exc).lower()
            if "inputpeerchat" in msg or "inputchannel" in msg:
                try:
                    chat_id = getattr(entity, "id", None)
                    if chat_id is None:
                        raise cast_exc
                    await client(
                        DeleteChatUserRequest(
                            chat_id=abs(int(chat_id)),
                            user_id="me",
                        )
                    )
                    return _ok(
                        action,
                        {
                            "group_id": gid,
                            "outcome": "left",
                            "already_member": False,
                        },
                    )
                except Exception as retry_exc:  # noqa: BLE001
                    return _err(action, str(retry_exc) or str(cast_exc) or "leave failed")
            return _err(action, str(cast_exc) or "leave failed")
        except Exception as exc:  # noqa: BLE001
            return _err(action, str(exc) or "leave failed")
