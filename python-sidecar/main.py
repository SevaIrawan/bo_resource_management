from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from telegram_login import (
    cancel_telegram,
    export_telegram_session,
    get_telegram_status,
    restore_telegram_session,
    start_telegram_phone,
    start_telegram_qr,
    submit_telegram_2fa,
    submit_telegram_code,
)
from telegram_scraper import (
    count_telegram_groups,
    get_scrape_progress,
    request_scrape_cancel,
    scrape_telegram_groups,
    validate_telegram_session,
)
from telegram_automation import run_create_group, run_join_by_invite_link, run_set_admin

def _load_env() -> None:
    env_file = os.environ.get("RM_ENV_FILE", "").strip()
    if env_file and Path(env_file).is_file():
        load_dotenv(env_file)
        return
    root = Path(__file__).resolve().parent.parent
    load_dotenv(root / ".env")


_load_env()

app = FastAPI(title="RM Telegram Sidecar")


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={"status": "error", "message": str(exc) or "Telegram sidecar internal error"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SessionBody(BaseModel):
    sessionId: str

class PhoneBody(BaseModel):
    sessionId: str
    phone: str = Field(min_length=8)

class CodeBody(BaseModel):
    sessionId: str
    code: str = Field(min_length=4)

class TwoFaBody(BaseModel):
    sessionId: str
    password: str = Field(min_length=1)

class CountBody(BaseModel):
    sessionId: str
    sessionString: str | None = None
    quick: bool = False

class RestoreBody(BaseModel):
    sessionId: str
    sessionString: str = Field(min_length=10)

class ScrapeBody(BaseModel):
    sessionString: str | None = None
    expectedPhone: str | None = None

class AutomationDelayBody(BaseModel):
    between_groups_sec: float | None = None
    between_targets_sec: float | None = None
    after_create_sec: float | None = None
    flood_wait_extra_sec: float | None = None
    max_floodwait_auto_sleep_sec: int | None = None
    invite_export_retries: int | None = None
    invite_export_retry_sec: float | None = None
    jitter_percent: float | None = None
    pause_between_runs_min_sec: float | None = None
    pause_between_runs_max_sec: float | None = None
    invite_delay_min_sec: float | None = None
    invite_delay_max_sec: float | None = None
    invite_batch_every: int | None = None
    invite_batch_delay_min_sec: float | None = None
    invite_batch_delay_max_sec: float | None = None
    resolve_entity_max_attempts: int | None = None
    max_admin_slots: int | None = None

class CreateGroupBody(BaseModel):
    groupName: str = Field(min_length=1)
    description: str = ""
    hideChatHistory: bool = False
    batchIndex: int = 1
    sessionString: str | None = None
    expectedPhone: str | None = None
    delay: AutomationDelayBody | None = None

class SetAdminBody(BaseModel):
    targets: list[str] = Field(min_length=1)
    groupId: str | None = None
    groupLink: str | None = None
    adminRights: dict | None = None
    sessionString: str | None = None
    expectedPhone: str | None = None
    delay: AutomationDelayBody | None = None

class JoinInviteBody(BaseModel):
    inviteLink: str = Field(min_length=8)
    joinSequenceIndex: int = 1
    sessionString: str | None = None
    expectedPhone: str | None = None
    delay: AutomationDelayBody | None = None

def _delay_dict(body: AutomationDelayBody | None) -> dict | None:
    if body is None:
        return None
    raw = body.model_dump(exclude_none=True)
    return raw or None

@app.get("/health")
async def health() -> dict:
    return {"ok": True, "version": 3, "features": ["login", "scrape", "count", "validate", "automation"]}

@app.post("/telegram/login/qr/start")
async def telegram_qr_start(body: SessionBody) -> dict:
    if not os.environ.get("TELEGRAM_API_ID") or not os.environ.get("TELEGRAM_API_HASH"):
        return {"status": "error", "message": "TELEGRAM_API_ID / TELEGRAM_API_HASH missing in .env"}
    return await start_telegram_qr(body.sessionId)

@app.post("/telegram/login/phone/start")
async def telegram_phone_start(body: PhoneBody) -> dict:
    if not os.environ.get("TELEGRAM_API_ID") or not os.environ.get("TELEGRAM_API_HASH"):
        return {"status": "error", "message": "TELEGRAM_API_ID / TELEGRAM_API_HASH missing in .env"}
    try:
        return await start_telegram_phone(body.sessionId, body.phone)
    except ValueError as exc:
        return {"status": "error", "message": str(exc)}

@app.post("/telegram/login/code")
async def telegram_submit_code(body: CodeBody) -> dict:
    return await submit_telegram_code(body.sessionId, body.code)

@app.post("/telegram/login/2fa")
async def telegram_submit_2fa(body: TwoFaBody) -> dict:
    return await submit_telegram_2fa(body.sessionId, body.password)

@app.get("/telegram/login/status/{session_id}")
async def telegram_login_status(session_id: str) -> dict:
    try:
        return await get_telegram_status(session_id)
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "message": str(exc) or "Telegram status failed"}

@app.post("/telegram/login/cancel/{session_id}")
async def telegram_login_cancel(session_id: str) -> dict:
    await cancel_telegram(session_id)
    return {"ok": True}

@app.post("/telegram/scrape/{session_id}")
async def telegram_scrape(session_id: str, body: ScrapeBody | None = None) -> dict:
    session_string = body.sessionString if body else None
    expected_phone = body.expectedPhone if body else None
    return await scrape_telegram_groups(session_id, session_string, expected_phone)

@app.get("/telegram/scrape/progress/{session_id}")
async def telegram_scrape_progress(session_id: str) -> dict:
    return get_scrape_progress(session_id)

@app.post("/telegram/scrape/cancel/{session_id}")
async def telegram_scrape_cancel(session_id: str) -> dict:
    request_scrape_cancel(session_id)
    return {"ok": True}

@app.post("/telegram/count/{session_id}")
async def telegram_count(session_id: str, body: CountBody | None = None) -> dict:
    session_string = body.sessionString if body else None
    quick = bool(body.quick) if body else False
    return await count_telegram_groups(session_id, session_string, quick=quick)

@app.post("/telegram/validate/{session_id}")
async def telegram_validate(session_id: str, body: CountBody | None = None) -> dict:
    session_string = body.sessionString if body else None
    return await validate_telegram_session(session_id, session_string)

@app.get("/telegram/session/export/{session_id}")
async def telegram_export_session(session_id: str) -> dict:
    return await export_telegram_session(session_id)

@app.post("/telegram/session/restore")
async def telegram_restore_session(body: RestoreBody) -> dict:
    return await restore_telegram_session(body.sessionId, body.sessionString)

@app.post("/telegram/automation/create-group/{session_id}")
async def telegram_automation_create_group(session_id: str, body: CreateGroupBody) -> dict:
    return await run_create_group(
        session_id,
        group_name=body.groupName,
        description=body.description,
        hide_chat_history=body.hideChatHistory,
        batch_index=body.batchIndex,
        session_string=body.sessionString,
        expected_phone=body.expectedPhone,
        delay=_delay_dict(body.delay),
    )

@app.post("/telegram/automation/set-admin/{session_id}")
async def telegram_automation_set_admin(session_id: str, body: SetAdminBody) -> dict:
    return await run_set_admin(
        session_id,
        targets=body.targets,
        group_id=body.groupId,
        group_link=body.groupLink,
        admin_rights=body.adminRights,
        session_string=body.sessionString,
        expected_phone=body.expectedPhone,
        delay=_delay_dict(body.delay),
    )

@app.post("/telegram/automation/join-invite/{session_id}")
async def telegram_automation_join_invite(session_id: str, body: JoinInviteBody) -> dict:
    return await run_join_by_invite_link(
        session_id,
        invite_link=body.inviteLink,
        join_sequence_index=body.joinSequenceIndex,
        session_string=body.sessionString,
        expected_phone=body.expectedPhone,
        delay=_delay_dict(body.delay),
    )

# Backward-compatible alias
@app.post("/telegram/login/start")
async def telegram_login_start(body: SessionBody) -> dict:
    return await telegram_qr_start(body)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
