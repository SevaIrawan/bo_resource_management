"""Human-like delay helpers for Telegram automation (configurable via payload delay dict)."""

from __future__ import annotations

import asyncio
import random


_DEFAULT_DELAY: dict = {
    "between_targets_sec": 3.0,
    "after_create_sec": 2.0,
    "flood_wait_extra_sec": 5.0,
    "max_floodwait_auto_sleep_sec": 7200,
    "invite_export_retries": 3,
    "invite_export_retry_sec": 3.0,
    "jitter_percent": 35,
}


def merge_delay(raw: dict | None) -> dict:
    merged = dict(_DEFAULT_DELAY)
    if isinstance(raw, dict):
        merged.update(raw)
    return merged


def jitter_seconds(base: float, delay_cfg: dict) -> float:
    jitter = float(delay_cfg.get("jitter_percent", 35)) / 100.0
    low = base * (1.0 - jitter)
    high = base * (1.0 + jitter)
    return max(0.1, random.uniform(low, high))


async def sleep_key(delay_cfg: dict, key: str, *, default: float = 1.0) -> None:
    sec = jitter_seconds(float(delay_cfg.get(key, default)), delay_cfg)
    await asyncio.sleep(sec)


def flood_wait_seconds(delay_cfg: dict, telethon_seconds: int | float) -> float:
    extra = float(delay_cfg.get("flood_wait_extra_sec", 5))
    return float(telethon_seconds) + extra


def max_floodwait_auto_sleep(delay_cfg: dict) -> int:
    return int(delay_cfg.get("max_floodwait_auto_sleep_sec", 7200))
