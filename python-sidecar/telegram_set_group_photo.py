"""Set Telegram group profile photo — Channel/megagroup + basic Chat."""

from __future__ import annotations

import asyncio
import os

from telethon.errors import FloodWaitError
from telethon.tl.functions.channels import EditPhotoRequest
from telethon.tl.functions.messages import EditChatPhotoRequest
from telethon.tl.types import Channel, Chat, InputChatUploadedPhoto

from telegram_automation import (
    _basic_chat_id,
    _peer_group_id,
    _prepare_session,
    _resolve_group_entity,
)
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


async def run_set_group_photo(
    session_id: str,
    *,
    photo_path: str,
    group_id: str | None = None,
    group_link: str | None = None,
    session_string: str | None = None,
    expected_phone: str | None = None,
    delay: dict | None = None,
) -> dict:
    action = "set_group_photo"
    path = (photo_path or "").strip()
    if not path:
        return _err(action, "photo_path required", error_code="INVALID_PAYLOAD")
    if not os.path.isfile(path):
        return _err(action, f"Photo file not found: {path}", error_code="PHOTO_NOT_FOUND")

    delay_cfg = merge_delay(delay)
    max_retry = max(0, int(delay_cfg.get("set_photo_max_retry", 1)))

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

        last_err: Exception | None = None
        for attempt in range(0, max_retry + 1):
            try:
                uploaded = await client.upload_file(path)
                photo = InputChatUploadedPhoto(uploaded)
                if isinstance(entity, Channel):
                    await client(EditPhotoRequest(channel=entity, photo=photo))
                elif isinstance(entity, Chat):
                    await client(
                        EditChatPhotoRequest(
                            chat_id=_basic_chat_id(entity),
                            photo=photo,
                        )
                    )
                else:
                    return _err(
                        action,
                        f"Unsupported entity type for set photo: {type(entity).__name__}",
                        error_code="UNSUPPORTED_ENTITY",
                    )
                return _ok(
                    action,
                    {
                        "group_id": gid,
                        "photo_status": "set",
                    },
                )
            except FloodWaitError as exc:
                cap = max_floodwait_auto_sleep(delay_cfg)
                if int(exc.seconds) > cap:
                    return _err(
                        action,
                        f"FloodWait {exc.seconds}s exceeds cap {cap}s",
                        error_code="FLOOD_WAIT",
                    )
                if attempt >= max_retry:
                    return _err(
                        action,
                        f"FloodWait {exc.seconds}s — retry exhausted",
                        error_code="FLOOD_WAIT_RETRY",
                    )
                await asyncio.sleep(flood_wait_seconds(delay_cfg, exc.seconds))
                last_err = exc
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                break

        message = str(last_err) if last_err else "set_group_photo failed"
        return _err(action, message, error_code="SET_GROUP_PHOTO_FAILED")
