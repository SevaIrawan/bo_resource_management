from __future__ import annotations

import asyncio
import base64
import io
import os
import re
import time
from dataclasses import dataclass, field
from typing import Literal

import qrcode
from telethon import TelegramClient
from telethon.errors import (
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    SessionPasswordNeededError,
)
from telethon.sessions import StringSession

LoginStatus = Literal["pending", "confirming", "need_code", "need_2fa", "ready", "error"]
LoginMode = Literal["qr", "phone"]

@dataclass
class TgLoginSession:
    client: TelegramClient
    mode: LoginMode = "qr"
    status: LoginStatus = "pending"
    error: str | None = None
    phone: str | None = None
    phone_code_hash: str | None = None
    qr_login: object | None = None
    qr_created_at: float = 0.0
    qr_generation: int = 0
    wait_task: asyncio.Task | None = field(default=None, repr=False)

SESSIONS: dict[str, TgLoginSession] = {}

_tg_session_locks: dict[str, asyncio.Lock] = {}


def tg_session_lock(session_id: str) -> asyncio.Lock:
    """Satu operasi Telethon aktif per session_id (multi-akun paralel, tidak tabrakan per akun)."""
    lock = _tg_session_locks.get(session_id)
    if lock is None:
        lock = asyncio.Lock()
        _tg_session_locks[session_id] = lock
    return lock

def _qr_data_url(url: str) -> str:
    qr = qrcode.QRCode(box_size=4, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"

def _normalize_phone(phone: str) -> str:
    value = phone.strip()
    if value.startswith("@"):
        raise ValueError("Phone login requires a phone number, not @username")
    digits = re.sub(r"\D", "", value)
    if len(digits) < 8:
        raise ValueError("Invalid phone number")
    return f"+{digits}"

def _session_payload(session: TgLoginSession, qr_data_url: str | None = None) -> dict:
    payload: dict = {
        "status": session.status,
        "mode": session.mode,
        "message": session.error,
    }
    if qr_data_url:
        payload["qrDataUrl"] = qr_data_url
        payload["qrGeneration"] = session.qr_generation
    if session.status == "need_2fa" and not session.error:
        payload["hint"] = "Two-step verification password required"
    if session.status == "need_code" and not session.error:
        payload["hint"] = "Enter the login code sent to your Telegram app"
    return payload

async def _create_client() -> TelegramClient:
    api_id = int(os.environ["TELEGRAM_API_ID"])
    api_hash = os.environ["TELEGRAM_API_HASH"]
    client = TelegramClient(StringSession(), api_id, api_hash)
    await asyncio.wait_for(client.connect(), timeout=30)
    return client


async def _verify_client_live(client: TelegramClient) -> tuple[bool, str | None]:
    """Pastikan session masih valid di server Telegram (bukan cache lokal saja)."""
    try:
        me = await asyncio.wait_for(client.get_me(), timeout=20)
        if me is None:
            return False, "Telegram session is not valid. Link device again."
        return True, None
    except SessionPasswordNeededError:
        return False, "2FA"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc) or "Telegram session expired. Link device again."


async def _apply_login_ready(session: TgLoginSession) -> None:
    ok, err = await _verify_client_live(session.client)
    if ok:
        session.status = "ready"
        session.error = None
        return
    if err == "2FA":
        session.status = "need_2fa"
        session.error = None
        return
    session.status = "error"
    session.error = err


async def _clear_stale_local_auth(client: TelegramClient) -> None:
    try:
        if await client.is_user_authorized():
            await client.log_out()
    except Exception:  # noqa: BLE001
        pass


async def start_telegram_qr(session_id: str) -> dict:
    await cancel_telegram(session_id)

    try:
        client = await _create_client()
        if await client.is_user_authorized():
            ok, _err = await _verify_client_live(client)
            if ok:
                session = TgLoginSession(client=client, mode="qr", status="ready")
                SESSIONS[session_id] = session
                return _session_payload(session)
            await _clear_stale_local_auth(client)

        qr_login = await asyncio.wait_for(client.qr_login(), timeout=30)
        qr_data_url = _qr_data_url(qr_login.url)

        session = TgLoginSession(
            client=client,
            mode="qr",
            status="pending",
            qr_login=qr_login,
            qr_created_at=time.time(),
            qr_generation=1,
        )
        SESSIONS[session_id] = session
        session.wait_task = asyncio.create_task(_wait_for_qr_scan(session_id))

        return _session_payload(session, qr_data_url)
    except asyncio.TimeoutError:
        await cancel_telegram(session_id)
        return {
            "status": "error",
            "message": "Telegram connection timed out. Check network or firewall.",
        }
    except Exception as exc:  # noqa: BLE001
        await cancel_telegram(session_id)
        return {"status": "error", "message": str(exc)}

async def _finalize_qr_login_if_live(session: TgLoginSession) -> None:
    """Setelah scan: jika session sudah live di server TG, langsung ready (jangan hang di wait())."""
    if session.status not in ("pending", "confirming"):
        return

    ok, err = await _verify_client_live(session.client)
    if ok:
        if session.wait_task and not session.wait_task.done():
            session.wait_task.cancel()
            try:
                await session.wait_task
            except asyncio.CancelledError:
                pass
        session.qr_login = None
        await _apply_login_ready(session)
        return
    if err == "2FA":
        session.status = "need_2fa"
        session.error = None


async def _maybe_rotate_telegram_qr(session: TgLoginSession) -> str | None:
    """QR di server TG terikat ke qr_login aktif — jangan tampilkan URL dari sesi yang sudah di-cancel."""
    if session.status != "pending" or not session.qr_login:
        return None

    age = time.time() - session.qr_created_at
    if age < 25:
        return _qr_data_url(session.qr_login.url)

    try:
        session.qr_login = await session.qr_login.recreate()
        session.qr_created_at = time.time()
        session.qr_generation += 1
        return _qr_data_url(session.qr_login.url)
    except Exception:  # noqa: BLE001
        return None


async def _refresh_qr_login_status(session: TgLoginSession) -> None:
    await _finalize_qr_login_if_live(session)


async def _wait_for_qr_scan(session_id: str) -> None:
    session = SESSIONS.get(session_id)
    if not session or not session.qr_login:
        return

    try:
        await asyncio.wait_for(session.qr_login.wait(), timeout=180)
        if session.status in ("ready", "need_2fa"):
            return
        await _apply_login_ready(session)
    except SessionPasswordNeededError:
        session.status = "need_2fa"
        session.error = None
    except asyncio.TimeoutError:
        if session.status == "ready":
            return
        session.status = "error"
        session.error = "QR login timed out. Scan again or use phone login."
    except asyncio.CancelledError:
        return
    except Exception as exc:  # noqa: BLE001
        if session.status == "ready":
            return
        session.status = "error"
        session.error = str(exc)

async def start_telegram_phone(session_id: str, phone: str) -> dict:
    await cancel_telegram(session_id)

    normalized = _normalize_phone(phone)
    client = await _create_client()

    if await client.is_user_authorized():
        ok, _err = await _verify_client_live(client)
        if ok:
            session = TgLoginSession(
                client=client,
                mode="phone",
                status="ready",
                phone=normalized,
            )
            SESSIONS[session_id] = session
            return _session_payload(session)
        await _clear_stale_local_auth(client)

    sent = await client.send_code_request(normalized)
    session = TgLoginSession(
        client=client,
        mode="phone",
        status="need_code",
        phone=normalized,
        phone_code_hash=sent.phone_code_hash,
    )
    SESSIONS[session_id] = session
    return _session_payload(session)

async def submit_telegram_code(session_id: str, code: str) -> dict:
    session = SESSIONS.get(session_id)
    if not session:
        return {"status": "error", "message": "Session not found"}

    if not session.phone or not session.phone_code_hash:
        return {"status": "error", "message": "Phone login was not started"}

    cleaned = re.sub(r"\s+", "", code.strip())
    if not cleaned:
        return {"status": "error", "message": "Login code is required"}

    try:
        await session.client.sign_in(
            phone=session.phone,
            code=cleaned,
            phone_code_hash=session.phone_code_hash,
        )
        await _apply_login_ready(session)
    except SessionPasswordNeededError:
        session.status = "need_2fa"
        session.error = None
    except PhoneCodeInvalidError:
        session.status = "need_code"
        session.error = "Invalid login code. Please try again."
    except PhoneCodeExpiredError:
        session.status = "error"
        session.error = "Login code expired. Start phone login again."
    except Exception as exc:  # noqa: BLE001
        session.status = "error"
        session.error = str(exc)

    return _session_payload(session)

async def submit_telegram_2fa(session_id: str, password: str) -> dict:
    session = SESSIONS.get(session_id)
    if not session:
        return {"status": "error", "message": "Session not found"}

    if not password.strip():
        return {"status": "error", "message": "Two-step verification password is required"}

    try:
        await session.client.sign_in(password=password.strip())
        await _apply_login_ready(session)
    except PasswordHashInvalidError:
        session.status = "need_2fa"
        session.error = "Invalid two-step verification password."
    except Exception as exc:  # noqa: BLE001
        session.status = "error"
        session.error = str(exc)

    return _session_payload(session)

async def get_telegram_status(session_id: str) -> dict:
    session = SESSIONS.get(session_id)
    if not session:
        return {"status": "error", "message": "Session not found"}

    if session.mode == "qr" and session.status in ("pending", "confirming"):
        await _refresh_qr_login_status(session)
        qr_url = await _maybe_rotate_telegram_qr(session)
        if qr_url:
            return _session_payload(session, qr_url)

    return _session_payload(session)

async def export_telegram_session(session_id: str) -> dict:
    session = SESSIONS.get(session_id)
    if not session:
        return {"status": "error", "message": "Login session not found. Scan QR again."}

    ok, err = await _verify_client_live(session.client)
    if not ok:
        session.status = "error"
        session.error = err
        return {
            "status": "error",
            "message": err or "Login session not ready",
        }

    session.status = "ready"
    session_string = session.client.session.save()
    return {
        "status": "ok",
        "sessionString": session_string,
        "loginMethod": session.mode,
    }

async def restore_telegram_session(session_id: str, session_string: str) -> dict:
    async with tg_session_lock(session_id):
        return await _restore_telegram_session_locked(session_id, session_string)


async def _restore_telegram_session_locked(session_id: str, session_string: str) -> dict:
    await cancel_telegram(session_id)

    if not session_string.strip():
        return {"status": "error", "message": "Session string is empty"}

    try:
        api_id = int(os.environ["TELEGRAM_API_ID"])
        api_hash = os.environ["TELEGRAM_API_HASH"]
        client = TelegramClient(StringSession(session_string.strip()), api_id, api_hash)
        await asyncio.wait_for(client.connect(), timeout=30)

        ok, err = await _verify_client_live(client)
        if not ok:
            await client.disconnect()
            return {
                "status": "error",
                "message": err or "Stored Telegram session expired. Log in again.",
            }

        SESSIONS[session_id] = TgLoginSession(client=client, mode="qr", status="ready")
        return {"status": "ready"}
    except asyncio.TimeoutError:
        return {"status": "error", "message": "Telegram connection timed out"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "message": str(exc)}

async def cancel_telegram(session_id: str) -> None:
    session = SESSIONS.pop(session_id, None)
    if not session:
        return

    if session.wait_task and not session.wait_task.done():
        session.wait_task.cancel()
        try:
            await session.wait_task
        except asyncio.CancelledError:
            pass

    await session.client.disconnect()
