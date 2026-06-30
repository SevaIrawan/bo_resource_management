# GM App — Job Queue & Execute Worker Troubleshooting Reference

**Product:** Resource Management (Electron)  
**Version:** v1.0.29  
**Audience:** Developers and ops maintaining WhatsApp / Telegram automation  
**Scope:** Job Queue, execute slot pool, Sync / Scrape interaction — not Reporting or Supabase schema

---

## 1. Quick triage

| Symptom | Check first | Likely cause |
|---------|-------------|--------------|
| Nothing runs; all actions queue | `executeSlotsActive` vs max (4) | Ghost slot after crash **or** 4 real jobs running |
| One account stuck; others OK | Row busy indicator / job table | Scrape + job conflict, settling, or active job on that account |
| Job `failed` immediately | Job error / `errorCode` | Invalid session, payload, or platform error |
| Job `running` forever | Duration vs action timeout | Chrome hang; wait 30m stale sweep or restart app |
| TG jobs fail in batch | `FLOOD_WAIT` in error | Telegram rate limit exceeded |
| Sync blocked right after job | Within ~5s of job end | `SESSION_SETTLING` — **expected** |

**First actions:** Open global Job Queue panel → read error message → restart app if global queue stuck → relogin **affected account only**.

---

## 2. Architecture (do not misdiagnose)

- **Max 4 parallel accounts** — shared pool for Sync, Scrape, and Job Queue (`executeSlotPool`).
- **Per-account isolation** — account A failure or block does not stop account B.
- **Single slot source of truth** — main process `executeSlotPool` only; `jobQueueGuard` does **not** check global slot fill.
- **Post-job settle** — 5s block on the same account after any job (`SESSION_SETTLING`, `POST_JOB_SETTLE_MS`).
- **Scrape ⊕ Job Queue** — same account cannot run both at once (`JOB_QUEUE_EXECUTE_FULL`).

**Key files**

| Area | File |
|------|------|
| Slot pool | `electron/main/automation/executeSlotPool.ts` |
| Runner | `electron/main/automation/jobQueueRunner.ts` |
| Guards | `electron/main/automation/jobQueueGuard.ts` |
| Settle | `electron/main/automation/jobQueueSettle.ts` |
| Job store | `electron/main/automation/jobQueueStore.ts` |
| WA worker | `electron/main/automation/waAutomation.ts` |
| TG worker | `python-sidecar/telegram_automation.py` |
| Renderer slots | `src/lib/executeSlotClient.ts`, `src/hooks/useAccountSyncFlow.ts` |

---

## 3. Failure playbook

### A. Slot not released (ghost slot)

| | |
|--|--|
| **Symptom** | `EXECUTE_SLOTS_FULL`; no jobs actually running; queue never drains |
| **Root cause** | App crash or kill before `releaseExecuteSlot()` in `finally` |
| **Fix** | Restart Electron app |
| **Prevention** | Always release slot in `finally`; scrape errors use `deferSlotRelease` until modal closes |
| **Verify** | After restart, `executeSlotsActive = 0`; new enqueue works |
| **Known gap** | No startup sweep for ghost slots |

---

### B. WA session expired mid-job

| | |
|--|--|
| **Symptom** | Job `failed`; ProtocolError or session not ready |
| **Root cause** | Logout on phone, invalid profile, Puppeteer detached mid-run |
| **Fix** | Relogin account → re-enqueue job |
| **Prevention** | One Puppeteer per `sessionId`; lock until `initialize()` completes |
| **Verify** | Logout mid-job → job fails; other accounts keep running |

---

### C. TG FloodWait

| | |
|--|--|
| **Symptom** | `FLOOD_WAIT` or `FLOOD_WAIT_RETRY` in job error |
| **Root cause** | Telethon rate limit; auto-sleep only if wait ≤ `max_floodwait_auto_sleep_sec` |
| **Fix** | Wait FloodWait duration → reduce batch / increase delays → re-enqueue |
| **Config** | `flood_wait_extra_sec`, `max_floodwait_auto_sleep_sec` in worker delay settings |
| **Verify** | Correct error code; slot released after fail |

---

### D. Job stuck in `running`

| | |
|--|--|
| **Symptom** | Status `running` long past expected duration |
| **Root cause** | Chrome/Puppeteer hang; crash after `markJobRunning` |
| **Fix** | Wait auto-fail (30m `JOB_STALE_TIMEOUT`) or restart app |
| **Timeouts** | join 20m · set_admin 25m · create_group 90m (+ 5m per step) |
| **Verify** | Job → `failed` with `JOB_STALE_TIMEOUT` or `JOB_*_TIMEOUT`; queue resumes |

---

### E. Expected behavior (not bugs)

| Behavior | Why | What to do |
|----------|-----|------------|
| 5th action queues | Max 4 slots | Wait; notification is correct |
| `SESSION_SETTLING` | 5s Chrome cleanup after job | Retry after ~5s |
| Scrape blocks job on same account | Per-account isolation | Finish scrape first |

---

## 4. Error code cheat sheet

| Code | Meaning | Action |
|------|---------|--------|
| `EXECUTE_SLOTS_FULL` | Pool full (or ghost slot) | Wait, or restart if ghost |
| `JOB_QUEUE_EXECUTE_FULL` | Scrape or job busy on this account | Wait for current task |
| `SESSION_SETTLING` | Post-job cooldown (~5s) | Retry shortly |
| `JOB_STALE_TIMEOUT` | Running longer than 30m | Re-enqueue; investigate hang |
| `JOB_*_TIMEOUT` | Action exceeded time limit | Smaller batch; check WA/TG |
| `FLOOD_WAIT` | TG rate limit exceeds cap | Wait + reduce frequency |
| `FLOOD_WAIT_RETRY` | Short flood; job ended failed | Re-enqueue job |
| `SESSION_NOT_READY` / `SESSION_UNAUTHORIZED` | Session dead | Relogin |
| `JOIN_FAILED` / `SET_ADMIN_FAILED` / `CREATE_GROUP_FAILED` | WA action failed | Check payload + device state |

---

## 5. Validation & regression

Run before release or after job-queue / guard / slot changes:

```bash
npm run validate:gm-master-contract
npm run validate:operations-job-queue
npm run validate:multi-account-wa
npm run validate:desktop
```

**Manual smoke (T1–T7)**

| # | Test | Expected |
|---|------|----------|
| T1 | 4 jobs, different accounts | 4 `running` |
| T2 | 5th job | `queued`; runs when slot frees |
| T3 | Scrape + job, same account | Job waits until scrape ends |
| T4 | Job done → Sync within 5s | `SESSION_SETTLING` then OK |
| T5 | Logout WA mid-job | `failed`; slot released |
| T6 | TG with tight flood cap | `FLOOD_WAIT` or retry message |
| T7 | Restart app | `executeSlotsActive = 0` |

**Regression watchlist**

- Dual slot lock reintroduced in `jobQueueGuard` (`isExecuteSlotActiveForAccount`)
- Two Puppeteer instances per `sessionId`
- `markJobRunning` double pickup

---

## 6. Escalation path

1. **Validators fail** → code regression; fix before ops workaround.
2. **Validators OK; one account** → session / guard / platform issue on that account.
3. **Validators OK; all accounts stuck** → slot pool ghost; restart app.
4. **Intermittent TG failures** → FloodWait + delay tuning.
5. **Wrong grid data after scrape** → separate path: `rm_commit_account_scrape` RPC (not job queue).

---

## 7. Do / don't

**Do**

- Release execute slot in `finally`.
- Fix session issues per account.
- Use global Job Queue panel for background job state.
- Run validators after changes to runner, guard, or slot pool.

**Don't**

- Remove settling or per-account guards to silence busy messages.
- Add a second slot counter in renderer or IPC guard.
- Treat job failure as DB or session invalidation.
- Run Scrape and Job Queue on the same account at the same time.

---

## 8. Create group & set photo (Job Queue)

| Topic | Expected behavior | If wrong |
|-------|-------------------|----------|
| Create permission | Modal SETUP = per job; Admin Worker settings = defaults only | Check `payload.createGroupSettings` on job row, not live Settings |
| Queue blocked "already queued" | `createJobHasSetPhotoFollowUp` or duplicate join | Read Remark column; partial set photo fail locks VIEW tab |
| Set photo groups | Only from create job `groupOutcomes` (VIEW Result) | Re-run create on app version with outcome persistence |
| Remark vs tab lock | Same rules in `createSetPhotoFlow.ts` | If mismatch, code regression — run `validate:operations-job-queue` |

---

## Related docs

- GM contract: `cursor-prompt-gm-master.md`
- Validators: `package.json` scripts `validate:operations-job-queue`, `validate:gm-master-contract`
- CI gate: `scripts/validate-installer-runtime.mjs`
