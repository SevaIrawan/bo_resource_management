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
from telegram_scraper import count_telegram_groups, scrape_telegram_groups, validate_telegram_session

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

class RestoreBody(BaseModel):
    sessionId: str
    sessionString: str = Field(min_length=10)

class ScrapeBody(BaseModel):
    sessionString: str | None = None

@app.get("/health")
async def health() -> dict:
    return {"ok": True, "version": 3, "features": ["login", "scrape", "count", "validate"]}

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
    return await scrape_telegram_groups(session_id, session_string)

@app.post("/telegram/count/{session_id}")
async def telegram_count(session_id: str, body: CountBody | None = None) -> dict:
    session_string = body.sessionString if body else None
    return await count_telegram_groups(session_id, session_string)

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

# Backward-compatible alias
@app.post("/telegram/login/start")
async def telegram_login_start(body: SessionBody) -> dict:
    return await telegram_qr_start(body)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
