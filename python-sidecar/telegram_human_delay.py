"""Human-like delay helpers for Telegram automation (configurable via payload delay dict)."""

from __future__ import annotations

import asyncio
import random


_DEFAULT_DELAY: dict = {
    "between_groups_sec": 90.0,
    "between_targets_sec": 3.0,
    "after_create_sec": 2.0,
    "flood_wait_extra_sec": 5.0,
    "max_floodwait_auto_sleep_sec": 7200,
    "invite_export_retries": 3,
    "invite_export_retry_sec": 3.0,
    "invite_delay_min_sec": 30.0,
    "invite_delay_max_sec": 60.0,
    "invite_batch_every": 10,
    "invite_batch_delay_min_sec": 180.0,
    "invite_batch_delay_max_sec": 360.0,
    "resolve_entity_max_attempts": 3,
    "max_admin_slots": 5,
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


def random_between_sec(min_sec: float, max_sec: float) -> float:
    lo = min(float(min_sec), float(max_sec))
    hi = max(float(min_sec), float(max_sec))
    if hi <= lo:
        return lo
    return random.uniform(lo, hi)


async def apply_join_invite_delay(delay_cfg: dict, join_sequence_index: int = 1) -> None:
    seq = max(1, int(join_sequence_index or 1))
    batch_every = max(1, int(delay_cfg.get("invite_batch_every", 10)))
    if seq > 1 and batch_every > 0 and seq % batch_every == 0:
        sec = random_between_sec(
            delay_cfg.get("invite_batch_delay_min_sec", 180.0),
            delay_cfg.get("invite_batch_delay_max_sec", 360.0),
        )
    else:
        sec = random_between_sec(
            delay_cfg.get("invite_delay_min_sec", 30.0),
            delay_cfg.get("invite_delay_max_sec", 60.0),
        )
    await asyncio.sleep(jitter_seconds(sec, delay_cfg))
