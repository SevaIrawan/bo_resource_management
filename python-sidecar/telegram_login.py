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
    client = _new_telegram_client(StringSession())
    await _connect_client(client)
    return client


def _tg_session_log(session_id: str, event: str, detail: str | None = None) -> None:
    """Log bukti lifecycle session — jangan log StringSession penuh."""
    sid = (session_id or "")[:8]
    extra = f" | {detail[:220]}" if detail else ""
    print(f"[tg-session] sessionId={sid}… event={event}{extra}", flush=True)


def _is_auth_key_dead_message(msg: str | None) -> bool:
    lower = (msg or "").lower()
    return (
        "auth_key_duplicated" in lower
        or ("authorization key" in lower and "no longer be used" in lower)
        or "two different ip" in lower
        or "authkeyduplicated" in lower
    )


def _is_session_revoked_message(msg: str | None, exc: Exception | None = None) -> bool:
    """Session logout/revoked ASLI di device (bukan konflik multi-device AUTH_KEY_DUPLICATED).

    Telethon melempar exception class spesifik (AuthKeyUnregisteredError /
    UserDeactivatedError / UserDeactivatedBanError / SessionRevokedError) tapi pesan teksnya
    generik ("The key is not registered in the system…") — jangan hanya cek string, cek nama
    class exception juga supaya tidak lolos sebagai SESSION_WARM_PENDING / device_busy.
    """
    if exc is not None:
        name = type(exc).__name__.lower()
        if (
            "authkeyunregistered" in name
            or "userdeactivated" in name
            or "sessionrevoked" in name
            or "authkeynotfound" in name
        ):
            return True
    lower = (msg or "").lower()
    return (
        "auth_key_unregistered" in lower
        or "authkeyunregistered" in lower
        or "user_deactivated" in lower
        or "userdeactivated" in lower
        or "session_revoked" in lower
        or "sessionrevoked" in lower
        or "key is not registered in the system" in lower
        or "telegram session is not valid" in lower
    )


def _is_transient_socket_error(msg: str | None) -> bool:
    """Windows/Telethon: Errno 22 / WinError 10022 / socket drop — soft, bukan session mati."""
    lower = (msg or "").lower()
    return (
        "errno 22" in lower
        or "winerror 10022" in lower
        or "invalid argument" in lower
        or "disconnected" in lower
        or "not connected" in lower
        or "connection" in lower
        or "timed out" in lower
        or "timeout" in lower
        or "network is unreachable" in lower
        or "temporarily unavailable" in lower
    )


def _new_telegram_client(session: StringSession | str) -> TelegramClient:
    api_id = int(os.environ["TELEGRAM_API_ID"])
    api_hash = os.environ["TELEGRAM_API_HASH"]
    sess = session if isinstance(session, StringSession) else StringSession(session)
    # use_ipv6=False — di Windows IPv6 sering picu OSError Errno 22.
    # receive_updates=False — kurangi koneksi update paralel.
    return TelegramClient(
        sess,
        api_id,
        api_hash,
        receive_updates=False,
        use_ipv6=False,
    )


async def _connect_client(client: TelegramClient, *, attempts: int = 3) -> None:
    """connect() dengan retry untuk Errno 22 / socket transient di Windows."""
    last_exc: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            await asyncio.wait_for(client.connect(), timeout=30)
            return
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            msg = str(exc) or ""
            if _is_auth_key_dead_message(msg):
                raise
            if attempt >= attempts or not _is_transient_socket_error(msg):
                raise
            try:
                await client.disconnect()
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(0.5 * attempt)
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("Telegram connect failed")


async def _ensure_client_connected(client: TelegramClient) -> None:
    """Reconnect jika drop setelah scrape panjang — hindari 'Cannot send request while disconnected'."""
    try:
        if client.is_connected():
            return
    except Exception:  # noqa: BLE001
        pass
    await _connect_client(client)


async def _force_reconnect(client: TelegramClient) -> None:
    """
    Socket 'hidup' palsu setelah scrape panjang — putus dulu lalu connect ulang
    pada CLIENT YANG SAMA (bukan TelegramClient baru). Tunggu sebentar agar
    server melepas koneksi lama sebelum connect ulang (cegah AUTH_KEY_DUPLICATED).
    """
    try:
        await client.disconnect()
    except Exception:  # noqa: BLE001
        pass
    await asyncio.sleep(0.75)
    await _connect_client(client)


async def _verify_client_live(client: TelegramClient) -> tuple[bool, str | None]:
    """Pastikan session masih valid di server Telegram (bukan cache lokal saja)."""
    try:
        await _ensure_client_connected(client)
        me = await asyncio.wait_for(client.get_me(), timeout=20)
        if me is None:
            return False, "TG_SESSION_DEAD: Telegram session is not valid. Link device again."
        return True, None
    except SessionPasswordNeededError:
        return False, "2FA"
    except Exception as exc:  # noqa: BLE001
        msg = str(exc) or "Telegram session expired. Link device again."
        if _is_auth_key_dead_message(msg):
            return False, msg
        if _is_session_revoked_message(msg, exc):
            return False, f"TG_SESSION_DEAD: {msg}"
        if _is_transient_socket_error(msg):
            try:
                await _force_reconnect(client)
                me = await asyncio.wait_for(client.get_me(), timeout=20)
                if me is None:
                    return (
                        False,
                        "TG_SESSION_DEAD: Telegram session is not valid. Link device again.",
                    )
                return True, None
            except SessionPasswordNeededError:
                return False, "2FA"
            except Exception as retry_exc:  # noqa: BLE001
                retry_msg = str(retry_exc) or msg
                if _is_session_revoked_message(retry_msg, retry_exc):
                    return False, f"TG_SESSION_DEAD: {retry_msg}"
                return False, retry_msg
        return False, msg


async def _client_locally_authorized(client: TelegramClient) -> bool:
    try:
        return bool(await client.is_user_authorized())
    except Exception:  # noqa: BLE001
        return False


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
    # Windows Errno 22 / soft socket: auth key lokal sudah ada — jangan status=error
    # (itu memutus export + Scrape Now setelah Clear Session / login ulang).
    if err and _is_transient_socket_error(err) and await _client_locally_authorized(session.client):
        session.status = "ready"
        session.error = None
        _tg_session_log("", "ready_despite_transient", err)
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
    async with tg_session_lock(session_id):
        return await _start_telegram_qr_locked(session_id)


async def _start_telegram_qr_locked(session_id: str) -> dict:
    try:
        await cancel_telegram(session_id)
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "message": str(exc) or "Could not reset previous Telegram login"}

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
    """Setelah scan di HP: deteksi authorized + live — jangan cancel wait_task (bisa putus login)."""
    if session.status not in ("pending", "confirming"):
        return

    try:
        if not await session.client.is_user_authorized():
            return
    except Exception:  # noqa: BLE001
        return

    ok, err = await _verify_client_live(session.client)
    if ok:
        session.qr_login = None
        await _apply_login_ready(session)
        return
    if err == "2FA":
        session.status = "need_2fa"
        session.error = None
        return
    # Authorized di HP tapi get_me gagal soft (Errno 22) — tetap finalize ready.
    if err and _is_transient_socket_error(err):
        session.qr_login = None
        await _apply_login_ready(session)


async def _maybe_rotate_telegram_qr(session: TgLoginSession) -> str | None:
    """QR di server TG terikat ke qr_login aktif — jangan tampilkan URL dari sesi yang sudah di-cancel."""
    if session.status != "pending" or not session.qr_login:
        return None

    try:
        qr_url = getattr(session.qr_login, "url", None)
        if not qr_url:
            return None
    except Exception:  # noqa: BLE001
        return None

    age = time.time() - session.qr_created_at
    if age < 25:
        try:
            return _qr_data_url(qr_url)
        except Exception:  # noqa: BLE001
            return None

    try:
        session.qr_login = await session.qr_login.recreate()
        session.qr_created_at = time.time()
        session.qr_generation += 1
        new_url = getattr(session.qr_login, "url", None)
        return _qr_data_url(new_url) if new_url else None
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
        try:
            if await session.client.is_user_authorized():
                ok, err = await _verify_client_live(session.client)
                if ok:
                    session.qr_login = None
                    await _apply_login_ready(session)
                    return
                if err == "2FA":
                    session.status = "need_2fa"
                    session.error = None
                    return
                if err and _is_transient_socket_error(err):
                    session.qr_login = None
                    await _apply_login_ready(session)
                    return
        except Exception:  # noqa: BLE001
            pass
        if _is_transient_socket_error(str(exc)) and await _client_locally_authorized(session.client):
            session.qr_login = None
            await _apply_login_ready(session)
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
    async with tg_session_lock(session_id):
        return await _submit_telegram_code_locked(session_id, code)


async def _submit_telegram_code_locked(session_id: str, code: str) -> dict:
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
    async with tg_session_lock(session_id):
        return await _submit_telegram_2fa_locked(session_id, password)


async def _submit_telegram_2fa_locked(session_id: str, password: str) -> dict:
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
    """Poll ringan — tanpa lock penuh agar wait_task QR tidak bentrok dengan scrape/login lain."""
    try:
        return await _get_telegram_status_locked(session_id)
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "message": str(exc) or "Telegram status check failed"}


async def _get_telegram_status_locked(session_id: str) -> dict:
    session = SESSIONS.get(session_id)
    if not session:
        return {"status": "pending", "mode": "qr", "message": None}

    try:
        if session.mode == "qr" and session.status in ("pending", "confirming"):
            await _refresh_qr_login_status(session)
            if session.status == "ready":
                return _session_payload(session)
            qr_url = await _maybe_rotate_telegram_qr(session)
            if qr_url:
                return _session_payload(session, qr_url)

        return _session_payload(session)
    except Exception as exc:  # noqa: BLE001
        if session.status == "ready":
            return _session_payload(session)
        try:
            if await session.client.is_user_authorized():
                ok, _err = await _verify_client_live(session.client)
                if ok:
                    session.qr_login = None
                    await _apply_login_ready(session)
                    return _session_payload(session)
        except Exception:  # noqa: BLE001
            pass
        return {"status": "error", "message": str(exc)}

async def export_telegram_session(session_id: str) -> dict:
    async with tg_session_lock(session_id):
        return await _export_telegram_session_locked(session_id)


async def _export_telegram_session_locked(session_id: str) -> dict:
    """
    Export StringSession dari memori.
    Urutan akurat: serialize LOKAL dulu (tidak butuh socket), baru cek live.
    Windows Errno 22 pada connect/get_me jangan gagalkan export / jangan surfacing mentah.
    AUTH_KEY_DUPLICATED → jangan export sebagai OK (string sudah mati di server).
    """
    session = SESSIONS.get(session_id)
    if not session:
        return {"status": "error", "message": "Login session not found. Scan QR again."}

    # 1) Serialize dulu — auth key sudah di StringSession; jangan tunggu reconnect.
    try:
        session_string = session.client.session.save()
    except Exception as exc:  # noqa: BLE001
        save_err = str(exc) or "Failed to serialize Telegram session"
        if _is_transient_socket_error(save_err):
            save_err = "Failed to export Telegram session. Retry."
        session.status = "error"
        session.error = save_err
        return {"status": "error", "message": session.error}

    if not session_string or not str(session_string).strip():
        session.status = "error"
        session.error = "Empty Telegram session string. Log in again."
        return {"status": "error", "message": session.error}

    # 2) Live check best-effort — hanya AUTH_KEY_DEAD yang membatalkan export.
    live_ok = False
    live_err: str | None = None
    try:
        await _ensure_client_connected(session.client)
        live_ok, live_err = await _verify_client_live(session.client)
        if not live_ok and live_err and _is_auth_key_dead_message(live_err):
            _tg_session_log(session_id, "export_auth_key_dead", live_err)
            session.status = "error"
            session.error = live_err
            return {"status": "error", "message": live_err}
    except Exception as exc:  # noqa: BLE001
        live_ok = False
        live_err = str(exc) or "Telegram reconnect failed"
        if _is_auth_key_dead_message(live_err):
            _tg_session_log(session_id, "export_auth_key_dead_exc", live_err)
            session.status = "error"
            session.error = live_err
            return {"status": "error", "message": live_err}
        if not _is_transient_socket_error(live_err):
            _tg_session_log(session_id, "export_live_warn", live_err)

    session.status = "ready"
    session.error = None
    warn = (
        live_err
        if (not live_ok and live_err and not _is_transient_socket_error(live_err))
        else None
    )
    _tg_session_log(session_id, "export_ok", None if live_ok else f"warn={live_err}")
    return {
        "status": "ok",
        "sessionString": str(session_string).strip(),
        "loginMethod": session.mode,
        **({"warn": warn} if warn else {}),
    }

async def restore_telegram_session(session_id: str, session_string: str) -> dict:
    async with tg_session_lock(session_id):
        return await _restore_telegram_session_locked(session_id, session_string)


async def _restore_telegram_session_locked(session_id: str, session_string: str) -> dict:
    """
    Restore StringSession ke memori.
    Reuse client ready + string sama → jangan cancel + TelegramClient baru
    (pemicu AUTH_KEY_DUPLICATED bila koneksi lama belum lepas di server).
    """
    wanted = session_string.strip()
    if not wanted:
        return {"status": "error", "message": "Session string is empty"}

    existing = SESSIONS.get(session_id)
    if existing and existing.status == "ready":
        try:
            current = existing.client.session.save()
            if current and str(current).strip() == wanted:
                ok, err = await _verify_client_live(existing.client)
                if ok:
                    _tg_session_log(session_id, "restore_reuse")
                    return {"status": "ready", "reused": True}
                if err and _is_auth_key_dead_message(err):
                    _tg_session_log(session_id, "restore_reuse_dead", err)
                    await cancel_telegram(session_id)
                    return {
                        "status": "error",
                        "message": err,
                    }
                if err and _is_transient_socket_error(err) and await _client_locally_authorized(
                    existing.client
                ):
                    _tg_session_log(session_id, "restore_reuse_transient", err)
                    return {"status": "ready", "reused": True, "warn": err}
                # Soft reconnect pada client yang sama
                try:
                    await _ensure_client_connected(existing.client)
                    ok2, err2 = await _verify_client_live(existing.client)
                    if ok2:
                        _tg_session_log(session_id, "restore_reuse_after_ensure")
                        return {"status": "ready", "reused": True}
                    if err2 and _is_auth_key_dead_message(err2):
                        _tg_session_log(session_id, "restore_reuse_dead_after_ensure", err2)
                        await cancel_telegram(session_id)
                        return {"status": "error", "message": err2}
                    if err2 and _is_transient_socket_error(err2) and await _client_locally_authorized(
                        existing.client
                    ):
                        _tg_session_log(session_id, "restore_reuse_transient_after_ensure", err2)
                        return {"status": "ready", "reused": True, "warn": err2}
                except Exception as soft_exc:  # noqa: BLE001
                    soft_msg = str(soft_exc)
                    if _is_auth_key_dead_message(soft_msg):
                        _tg_session_log(session_id, "restore_reuse_dead_exc", soft_msg)
                        await cancel_telegram(session_id)
                        return {"status": "error", "message": soft_msg}
                    if _is_transient_socket_error(soft_msg) and await _client_locally_authorized(
                        existing.client
                    ):
                        _tg_session_log(session_id, "restore_reuse_soft_exc", soft_msg)
                        return {"status": "ready", "reused": True, "warn": soft_msg}
        except Exception as reuse_exc:  # noqa: BLE001
            _tg_session_log(session_id, "restore_reuse_failed", str(reuse_exc))

    _tg_session_log(session_id, "restore_new_client")
    await cancel_telegram(session_id)
    # Beri waktu server melepas koneksi lama sebelum auth key dipakai lagi.
    await asyncio.sleep(0.75)

    try:
        client = _new_telegram_client(wanted)
        await _connect_client(client)

        ok, err = await _verify_client_live(client)
        if not ok:
            _tg_session_log(session_id, "restore_verify_failed", err)
            if err and _is_auth_key_dead_message(err):
                try:
                    await client.disconnect()
                except Exception:  # noqa: BLE001
                    pass
                return {
                    "status": "error",
                    "message": err or "Stored Telegram session expired. Log in again.",
                }
            # Soft socket (Errno 22): string valid + authorized lokal → treat ready
            if await _client_locally_authorized(client) and (
                not err or _is_transient_socket_error(err)
            ):
                SESSIONS[session_id] = TgLoginSession(client=client, mode="qr", status="ready")
                _tg_session_log(session_id, "restore_ready_transient", err)
                return {"status": "ready", "warn": err}
            try:
                await client.disconnect()
            except Exception:  # noqa: BLE001
                pass
            soft_msg = (
                "SESSION_WARM_PENDING: Telegram connection busy. Retry."
                if err and _is_transient_socket_error(err)
                else (err or "Stored Telegram session expired. Log in again.")
            )
            return {
                "status": "error",
                "message": soft_msg,
            }

        SESSIONS[session_id] = TgLoginSession(client=client, mode="qr", status="ready")
        _tg_session_log(session_id, "restore_ready")
        return {"status": "ready"}
    except asyncio.TimeoutError:
        _tg_session_log(session_id, "restore_timeout")
        return {"status": "error", "message": "Telegram connection timed out"}
    except Exception as exc:  # noqa: BLE001
        _tg_session_log(session_id, "restore_error", str(exc))
        msg = str(exc)
        if _is_transient_socket_error(msg):
            return {
                "status": "error",
                "message": "SESSION_WARM_PENDING: Telegram connection busy. Retry.",
            }
        return {"status": "error", "message": msg}

async def cancel_telegram(session_id: str) -> None:
    session = SESSIONS.pop(session_id, None)
    if not session:
        return

    _tg_session_log(session_id, "cancel_disconnect")
    if session.wait_task and not session.wait_task.done():
        session.wait_task.cancel()
        try:
            await session.wait_task
        except asyncio.CancelledError:
            pass
        except Exception:  # noqa: BLE001
            pass

    try:
        await session.client.disconnect()
    except Exception:  # noqa: BLE001
        pass
    # Sedikit jeda agar peer TCP / server drop auth connection lama.
    await asyncio.sleep(0.25)
