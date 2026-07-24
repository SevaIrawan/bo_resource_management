# GM App — Job Queue & Execute Worker Troubleshooting Reference

**Product:** Resource Management (Electron)  
**Version:** v1.0.30  
**Audience:** Developers and ops maintaining WhatsApp / Telegram automation  
**Scope:** Job Queue, execute slot pool, Sync / Scrape interaction — not Reporting or Supabase schema

---

## 1. Quick triage

| Symptom | Check first | Likely cause |
|---------|-------------|--------------|
| Nothing runs; all actions queue | `executeSlotsActive` vs max (**10** per platform WA/TG) | Ghost slot after crash **or** 10 real jobs running on that platform |
| One account stuck; others OK | Row busy indicator / job table | Scrape + job conflict, settling, or active job on that account |
| Job `failed` immediately | Job error / `errorCode` | Invalid session, payload, or platform error |
| Job `running` forever | Duration vs action timeout | Chrome hang; wait 90m stale sweep or restart app |
| TG jobs fail in batch | `FLOOD_WAIT` in error | Telegram rate limit exceeded |
| Sync blocked right after job | Within ~15s of job end | `SESSION_SETTLING` — **expected** |
| Many rows for one account | Queue count vs groups selected | **Expected (v1.0.30):** auto-split ≤30 groups per job |

**First actions:** Open global Job Queue panel → read error message → restart app if global queue stuck → relogin **affected account only**.

---

## 2. Architecture (do not misdiagnose)

- **Max 10 parallel accounts per platform** — WA dan TG **terpisah** (masing-masing hingga 10). Pool bersama untuk Sync, Scrape, dan Job Queue user (`executeSlotPool` + `deviceConcurrencyPolicy.ts`). Auto-scrape brand: lane terpisah max **6** per platform.
- **Per-account isolation** — account A failure or block does not stop account B; **one account uses at most 1 slot**.
- **Batch auto-split (v1.0.30)** — large group lists split at enqueue into jobs of ≤ `maxPerRun` (default 30); chunks for the **same account run sequentially** (FIFO), not in parallel.
- **Single slot source of truth** — main process `executeSlotPool` only; `jobQueueGuard` does **not** check global slot fill.
- **Post-job settle** — 15s block on the same account after any job (`SESSION_SETTLING`, `POST_JOB_SETTLE_MS = 15_000`).
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
| **Fix** | Wait auto-fail (90m `STALE_RUNNING_MS`) or restart app |
| **Timeouts** | join 20m base (+ 5m/step) · set_admin 25m · create_group 90m (+ 5m/step) |
| **Verify** | Job → `failed` with `JOB_STALE_TIMEOUT` or `JOB_*_TIMEOUT`; queue resumes |

---

### E. Expected behavior (not bugs)

| Behavior | Why | What to do |
|----------|-----|------------|
| 11th action queues when **10** already active on that platform | Max **10** user slots per platform (WA/TG terpisah) | Wait; notification is correct |
| Multiple queued rows, same account | Auto-split batch (v1.0.30) | Normal — chunks run one after another |
| `SESSION_SETTLING` | 15s Chrome cleanup after job | Retry after ~15s |
| Scrape blocks job on same account | Per-account isolation | Finish scrape first |

---

## 4. Error code cheat sheet

| Code | Meaning | Action |
|------|---------|--------|
| `EXECUTE_SLOTS_FULL` | Pool full (or ghost slot) | Wait, or restart if ghost |
| `JOB_QUEUE_EXECUTE_FULL` | Scrape or job busy on this account | Wait for current task |
| `SESSION_SETTLING` | Post-job cooldown (~15s) | Retry shortly |
| `JOB_STALE_TIMEOUT` | Running longer than 90m | Re-enqueue; investigate hang |
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
| T1 | 10 jobs, different accounts (same platform) | Up to 10 `running` |
| T2 | 11th job while 10 active | `queued`; runs when a slot frees |
| T3 | Scrape + job, same account | Job waits until scrape ends |
| T4 | Job done → Sync within 15s | `SESSION_SETTLING` then OK |
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

## 8. Create group, set photo & join (Job Queue)

| Topic | Expected behavior | If wrong |
|-------|-------------------|----------|
| Batch split (join/set admin/leave/delete/set photo) | ≤30 groups per job row; same account sequential | If only first chunk queued, check `allowMultipleQueued` regression |
| Create group batch | **One job** with internal `perRun` slices + 45–65 min pause between slices | Do not split at enqueue — ban safety |
| Create permission | Modal SETUP = per job; Admin Worker settings = defaults only | Check `payload.createGroupSettings` on job row, not live Settings |
| Queue blocked "already queued" | Duplicate guard when single job; split batches bypass via `allowMultipleQueued` | Read error; only one non-split job per account+action |
| Join VIEW (failed/partial) | Table No / Group / Status / Remark; **Run** retries failed only | Check `groupOutcomes.joinStatus` / `joinError` on job record |
| Set photo groups | Only from create job `groupOutcomes` (VIEW Result) | Re-run create on app version with outcome persistence |
| Remark vs tab lock | Same rules in `createSetPhotoFlow.ts` | If mismatch, code regression — run `validate:operations-job-queue` |

---

## Related docs

- GM contract: `cursor-prompt-gm-master.md`
- Validators: `package.json` scripts `validate:operations-job-queue`, `validate:gm-master-contract`
- CI gate: `scripts/validate-installer-runtime.mjs`
