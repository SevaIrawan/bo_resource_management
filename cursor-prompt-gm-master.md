# Cursor Prompt — GM App Master Contract
## Sync, Run, Scrape, Multi-Account, Background Execution

---

## Project Context

- Stack: Electron + TypeScript, Supabase (PostgreSQL)
- App manages WhatsApp and Telegram accounts per brand
- Each account row: **Sync (↻)** in Action area; **scrape penuh** via modal **Scrape now** after Sync (kolom **Last update** read-only — tidak ada tombol Run terpisah)
- Existing Job Queue handles: **Create Group**, **Set Admin**, **Invite Member by Group Link**
- WA session is read from local storage. TG session is read from Supabase.

---

## Non-Negotiable Rules

Read these first before implementing anything:

1. All scraped data must be **100% real and live from the device** at the moment of scrape — no dummy, no mock, no cached old data, no fallback from previous scrape.
2. Scrape fails at any step → show error modal → close → **no updates of any kind**, no partial writes.
3. "Later" path → **only update Session and Status** → nothing else.
4. Delete + rewrite of daily and master must be a **single atomic transaction**.
5. Grid columns (On Device, In Brand, Admin, Last update) update **only after all scrape steps complete successfully**.
6. Do not add any new gate, middleware, or interceptor before Sync or scrape logic unless explicitly instructed.

---

## Sync Button Logic

### Case 1 — Session = Invalid AND Status = Logout

```
Sync
→ Show Login Modal (opens immediately, no delay, ready within 300ms)
    → [Login Failed] → close. No action.
    → [Login Success]
        → Update Session + Status
        → Show modal: Scrape Now / Later
            → [Later] → close
            → [Scrape Now] → run Scrape Logic
```

### Case 2 — Status = Active, Session = Valid → Check Session returns Invalid

```
Sync
→ Check Session → Invalid
→ Show Login Modal (opens immediately, no delay, ready within 300ms)
    → [Login Failed] → close. No action.
    → [Login Success]
        → Update Session + Status
        → Show modal: Scrape Now / Later
            → [Later] → close
            → [Scrape Now] → run Scrape Logic
```

### Case 3 — Status = Active, Session = Valid → Check Session returns Valid

```
Sync
→ Check Session → Valid
→ Show modal: Scrape Now / Later
    → [Later]
        → Update Session + Status
        → close
    → [Scrape Now] → run Scrape Logic
```

Login Modal rules (all cases):
- Modal must open immediately when triggered
- Session check must happen before modal is shown, not inside modal lifecycle
- Do not pre-load or pre-fetch anything that blocks modal rendering

---

## Scrape Trigger (no separate Run button)

Full scrape is started only by:
- **Scrape now** in the modal after Sync / login (Scrape Now / Later)
- **Auto-scrape** (Settings) on schedule
- Login success with scraper intent (auto-scrape without Later prompt)

There is **no** standalone Run button in the grid. Column **Last update** shows timestamp, progress, or *Use Sync to log in first*.

### After Sync when session becomes valid

```
Sync → session check / login
→ [Later] → close (no scrape)
→ [Scrape now] → run Scrape Logic immediately
```

Invalid session attempting scrape path: login first, then optional Scrape now (same as Sync flow).

---

## Scrape Logic

Called by **Scrape now** and auto-scrape. Execute steps in order. If any step fails — stop, show error modal, close, no updates.

```
Step 1 — Read total group count from device (live, real count)

Step 2 — Collect all group data from device (live, no cache):
          - Group Name
          - Group ID
          - Is Admin (boolean)
          - Invite Link (freshly fetched, not stored)
          - Count Owner
          - Count Member
          - Count Participant

          If any field fails for a group → mark that group as error, log it
          Do not silently skip or fill with old data

Step 3 — Delete existing daily data for this account on this brand

Step 4 — Write new scrape result to daily
          (Step 3 + Step 4 must be a single atomic transaction)

Step 5 — Update Master: delete first, then rewrite

Step 6 — Update Grid in UI:
          On Device · In Brand · Admin · Last update

Step 7 — Close
```

Performance — required for 3000+ groups:
- Use chunked/paginated fetching — do not load all groups into memory at once
- Write to Supabase in batches (500 rows per batch recommended)
- Progress indicator must update in real-time after each batch
- UI must remain responsive throughout — use background worker or async non-blocking execution

---

## Multi-Account Parallel Execution

### Slot Rules

- Maximum **4 accounts** run simultaneously (any action type: Sync, Scrape, Job Queue)
- Each account occupies exactly 1 slot regardless of action type
- If all 4 slots are full → new action goes into **FIFO waiting queue**
- Slot is released only when task fully completes (success) or error modal is dismissed (failure)
- Use `try/finally` to guarantee slot release even on unexpected errors

### UI Behavior

- While an account is processing → show visible in-progress indicator on that row
- User can freely read all data in UI at all times
- User cannot trigger a new action if:
  - That account already has an active task running
  - All 4 slots are occupied
- If slots are full when user triggers → auto-queue the action + show non-blocking notification: "Queue is full. Action will run when a slot is available"
- Do not disable the entire UI — only block execute actions per affected account

---

## Background Execution

- All Sync, Scrape, and Job Queue tasks must run in the background
- Main Electron renderer process must never be blocked
- Use worker threads or IPC (ipcMain / ipcRenderer) to offload heavy tasks
- Progress and status updates must be sent to renderer via IPC events — not polling
- If user switches tabs or views while a task runs → task continues uninterrupted
- Task state must persist in memory (or Supabase) so UI renders correctly if user navigates away and returns

---

## Job Queue Isolation

- Scrape and Job Queue must never run on the **same account** at the same time
- If Scrape is running on account A → block Job Queue for account A until Scrape finishes
- If Job Queue is running on account A → block Sync/Scrape for account A until Job Queue finishes
- Cross-account tasks are fully independent — account A's state does not affect account B
- Slot counter must be a **single source of truth** — do not maintain separate counters for Scrape and Job Queue

---

## What Gets Updated in Each Scenario

| Scenario | Session + Status | On Device / In Brand / Admin / Scraper |
|---|:---:|:---:|
| Later (all cases) | ✅ | ❌ |
| Scrape Now / Run — success — had login | ✅ | ✅ |
| Scrape Now / Run — success — session already valid | ❌ | ✅ |
| Scrape failed | ❌ | ❌ |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Login fails | Close modal. No update. Slot not occupied. |
| Scrape fails at any step | Show error modal. Close. No data written. Slot released on modal close. |
| Batch write to Supabase fails mid-scrape | Rollback entire scrape transaction. Show error modal. No partial data. |
| Job Queue task fails | Log error. Release slot. Do not affect other accounts. |
| Slot full when action triggered | Auto-queue. Show non-blocking notification. UI stays open. |
| Account already has active task | Block execute for that account only. Show inline indicator on row. |
