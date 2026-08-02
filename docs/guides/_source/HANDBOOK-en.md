# Resource Management — Official User Guide (English)

| | |
|---|---|
| **Product** | Backend Operation — Resource Management |
| **App version** | 1.0.35 |
| **Audience** | Internal operations team (marketing / monitoring of WhatsApp & Telegram groups) |
| **Platform** | Windows / macOS / Linux desktop installers |
| **UI languages** | English / 中文 (**Settings** → Language) |

This document is the **official guide to every feature** in the current application. For architecture and IT release notes, see [PROJECT.md](../../PROJECT.md).

> **v1.0.35:** Join Missing **CSV/XLSX hybrid** (group id / name / invite, WhatsApp + Telegram). Job Queue setup lists **100 rows/page** with scroll viewport ~10. Telegram scrape hardens **left/migrated shells**, DiscoveryIncomplete, and **`TG_SESSION_DEAD`**. Leave/Delete jobs expose per-group **outcomes**; Telegram **set photo** works on basic Chat. (From 1.0.34+: Set admin/Leave/Delete on basic groups; AuthKeyDuplicated → re-login QR; Super Group matrix filter; daily **is_owner**; Sync↔Job mutual block; partial batch → **Failed**.)

---

## Table of contents

1. [Overview](#1-overview)
2. [Getting started](#2-getting-started)
3. [Navigation and layout](#3-navigation-and-layout)
4. [Account tab — account monitoring](#4-account-tab--account-monitoring)
5. [Issues on Account — types and remediation](#5-issues-on-account--types-and-remediation)
6. [Group matrix — join/admin (Account header)](#6-group-matrix--joinadmin-account-header)
7. [Operations — Job Queue](#7-operations--job-queue)
8. [Settings](#8-settings)
9. [Data synchronization (realtime)](#9-data-synchronization-realtime)
10. [Recommended daily workflows](#10-recommended-daily-workflows)
11. [Glossary](#11-glossary)
12. [FAQ](#12-faq)
13. [Appendix — Quick feature map](#appendix--quick-feature-map)

---

## 1. Overview

### 1.1 What does this application do?

Resource Management helps your team:

| Capability | Description |
|------------|-------------|
| Multi-account registry | Register many **WhatsApp** and **Telegram** accounts per **brand** (e.g. SBMY) |
| Session health | Check whether accounts are still **logged in** on phone/PC (session) |
| Group alignment | Compare **groups on device** vs **brand standard** (master list) |
| Scraper | Run a full read of groups from the device and save to the database |
| Issues | See gaps on Account (junk / missing / not admin, duplicates) — computed in memory |
| Job Queue | Automate join, create group, set admin, exit/delete, set photo |
| Export | Export filtered data to **Excel** for field operations |

### 1.2 Two types of “login”

Do not confuse these — they serve different purposes.

| Type | Purpose | How |
|------|---------|-----|
| **Dashboard login** | Access the application | **Username** + **Password** (from IT, `users` table) |
| **Platform login** | Link WA/TG to a marketing account | **Sync (↻)** → QR or phone-number modal |

The dashboard password is **not** your Telegram or WhatsApp password.

### 1.3 What is **not** an issue?

Changes to **session login/logout** in the **Session** column do **not** create issues. Issues only cover **group and admin** problems relative to the brand standard.

### 1.4 Who should read which sections?

| Role | Primary sections |
|------|------------------|
| Field / marketing ops | §2–§5, §7, §10 |
| Team lead | §4–§5 KPIs, Job Queue, export |
| IT / support | §8, §9, §12 FAQ |

---

## 2. Getting started

### 2.1 Install (once per PC)

1. Run **`Resource Management Setup x.x.x.exe`** provided by IT.
2. Complete the installer wizard → **Install**.
3. Open the app from the **desktop shortcut**.
4. **No manual `.env` setup** is required — organization settings are bundled in the installer.

For detailed Windows steps, see [INSTALL-WINDOWS.md](../../INSTALL-WINDOWS.md).

### 2.2 Dashboard login

| Step | Action |
|------|--------|
| 1 | Enter **Username** and **Password** |
| 2 | Click **Login** |
| 3 | On failure | Contact IT — account may be missing from the database |

**Login screen labels (UI):** Username, Password, **Login**, tagline *Telegram & WhatsApp Operations*.

**Common errors:**

| Message | Meaning | Action |
|---------|---------|--------|
| Invalid username or password | Wrong credentials | Verify with IT |
| Database is not configured | Supabase missing on this PC | IT: reinstall or open configuration folder |
| App configuration is incomplete | Org env not baked into installer | IT: rebuild installer with org settings |

### 2.3 After login

You land on **Group Monitoring** (main workspace) with the **Account** tab selected by default.

---

## 3. Navigation and layout

### 3.1 Sidebar (left)

| Icon / menu | Function |
|-------------|----------|
| **Logo** | **Backend Operation** — **Resource Management** |
| **Group Monitoring** | Main page — Account + Operations |
| **Settings** | Preferences, auto scrape, worker policy (`/settings`) |
| **Logout (power)** | Exit dashboard only — does **not** auto-logout WA/TG on phone |

**Tip:** Collapse the sidebar to icon-only mode — use **Toggle sidebar** in the header.

> Older bookmarks to **Admin** (`/admin`) redirect to **Settings**.

### 3.2 Header (top)

| Element | Function |
|---------|--------|
| Page title | Active module (e.g. Group Monitoring, Settings) |
| **Welcome** + user name | Currently signed-in user |
| **Logout** | Exit dashboard |

### 3.3 Sub-header (Group Monitoring only)

| Tab | Function |
|-----|----------|
| **Account** | Brand cards, WA/TG rows, issue badges, **stock chips** + **Group matrix** (card header) |
| **Operations** | **Job Queue** only (join / create / set admin / exit-delete / set photo) |

> There is **no** Reporting tab and **no** Operations Overview. Open the join/admin matrix from the **group count badge** on the Account brand card header. Stock chips live on the same header.

Switching tabs updates KPI cards and the filter toolbar below.

### 3.4 KPI cards (Account tab)

Numbers refresh when you change tab or when data updates from the database.

| KPI | Meaning |
|-----|---------|
| **Brands** | Number of brand cards visible |
| **Accounts** | Filled account rows |
| **Online** | Accounts with **Active** status (session valid) |
| **Aligned** | Accounts matching brand standard for their platform |
| **Not Aligned / Issue** | Accounts **not aligned** |
| **Open issues** | Rollup of open group/admin gaps |

---

## 4. Account tab — account monitoring

### 4.1 Toolbar — filters and tools (slicer bar)

| Tool | Location | Function |
|------|----------|----------|
| **Search box** | Left | Search account name or phone number |
| **Search** button | Beside box | Run search (Enter key also works) |
| **Filter Brand** | Right | One brand or **All brands** |
| **Filter Platform** | Right | WhatsApp / Telegram / All |
| **Filter Status** | Right | Active / Logout / All |
| **Card view / Table view** | Right | Per-brand cards vs single combined table |
| **Export** (download icon) | Right | Excel export of accounts **matching current filters** |

Placeholder text: *Search account name / phone number…*

### 4.2 Brand card (Card view)

Each brand (e.g. **Brand : SBMY**) has one card.

#### Brand header

| Element | Function |
|---------|--------|
| **Arrow** | Collapse / expand account table |
| **Brand title** | Brand name |
| **Account count badge** | e.g. *12 accounts* |
| **WA x Group / TG x Group** | Clickable — opens **Group matrix** for that platform |
| **Stock chips** | Account/stock summary on the header (not an Operations bookmark) |
| **All aligned** / **N accounts not aligned** | Health summary for this brand |
| **+Add** | Add new account (choose WA or TG) |
| **X (Dismiss)** | Remove brand from database (confirmation modal) |

#### Add account (+Add)

| Step | Action |
|------|--------|
| 1 | Click **+Add** |
| 2 | Select **WhatsApp** or **Telegram** |
| 3 | Enter **Account name** (team label, e.g. marketing name) |
| 4 | Enter **Account phone number** (recommended; `@username` allowed for TG) |
| 5 | Click **Save** |

**Empty account slot:** Row labeled *Empty account slot* → **Add account** fills the slot without adding extra rows outside defined slots.

### 4.3 Account table columns

| Column | Meaning | How to read |
|--------|---------|-------------|
| **Account** | Platform + name + phone | WA/TG icon, name, number below |
| **Role** | Master / GCS | Create group needs **Master** |
| **Location** | Device location label | Not the brand card name |
| **Session** | **Active** / **Logout** | Logout → Sync + QR; **X on hover** when Active = **Clear Session** |
| **On device** | Number | Total groups on phone (click if > 0 → On Device list) |
| **Junk** | Gap count | Outside master (click → list + **Leave**) |
| **Missing** | Gap count | Not yet joined (click → list + **Join missing**) |
| **Not admin** | Gap count | Joined but not admin (click → list + **Set admin**) |
| **Last update** | Timestamp / progress | Full scrape status — **read-only** (no Run button) |
| **Remark** | Aligned / Not Aligned | Or Cancel scrape while scraping |

### 4.4 Row controls

| Control | Function |
|---------|--------|
| **↻ (Sync)** | Platform login or live session check + Scrape now / Later gate |
| **X (hover, right of name)** | **Remove from slot** — delete account row + rebuild brand master (confirmation) |
| **X (hover, Session column, Active only)** | **Clear Session** — log out on this PC + database; next Sync opens clean QR |
| Click gap number | Opens group list (On Device / Not in Master / Missing / Not admin) — **no Group link button** |

Tooltip: **Sync account**.

### 4.5 Sync (↻) flow — critical

Sync behavior depends on **Session** column value.

#### Session = **Logout**

| Step | What happens |
|------|----------------|
| 1 | Click **↻** |
| 2 | Platform login modal opens (QR default, or phone login) |
| 3 | Scan QR on marketing phone (WA: Linked devices; TG: Link Desktop Device) |
| 4 | On success: Session **Active**; app may prompt **Scrape now** / **Later** |

#### Session = **Active**

| Step | What happens |
|------|----------------|
| 1 | Click **↻** |
| 2 | App checks WA/TG still active on **this PC** |
| 3 | If OK: may offer **Scrape now** / **Later** |
| 4 | If failed: prompted to log in again |

**Notes:**

- Platform login runs only in the **desktop app** (not browser-only).
- If QR does not appear within ~10 seconds: close modal, wait a few seconds, **Sync** again.
- Long sync (>3 min) on Telegram with many groups: retry or restart app.

### 4.6 Last update column (full scrape via Sync)

| Condition | Display | Action |
|-----------|---------|--------|
| Session Logout | *Use Sync (↻) to log in first* | Sync first |
| Standby | **Last update** timestamp | Full scrape via **Sync → Scrape now** when needed |
| Running | *Reading groups…* / progress + **Cancel scrape** in Remark | Wait (can take minutes for large group lists) |

| Term | Meaning |
|------|---------|
| **Scrape now** | Full scrape — **only groups still on the account** written to database (modal after Sync) |
| **Sync** | Session check + scrape gate — not always a full scrape |

There is **no separate Run button** in the grid. **Last update** is read-only.

After login, you may see a prompt to save the full group list → choose **Scrape now** or **Later**.

**Later** = session stays Active in UI + DB only — **no** scrape. **Cancel scrape** stops the running scrape entirely.

### 4.7 Group lists from Account columns

Open by **clicking the column number** (not a Group link button):

| List | How to open |
|------|-------------|
| **On Device** | Click **On device** (when > 0) |
| **Not in Master** | Click **Junk** (when > 0) |
| **Missing** | Click **Missing** (when > 0) |
| **Not admin** | Click **Not admin** (when > 0) |

From gap lists: **Join missing** / **Set admin** / **Leave** open Job Queue SETUP. Empty? **Sync** → **Scrape now** first.

### 4.8 Remove account from slot

| Step | Action |
|------|--------|
| 1 | Hover account row → **X** icon |
| 2 | Confirm **Remove from slot?** → **Remove** |
| 3 | Effect | Account deactivated in DB; device session cleared on this PC (WA: local auth removed) |

Use before swapping test accounts for production marketing accounts — or let IT delete from database (see §8).

### 4.9 Add brand card

At end of card list: **Add Card View** → enter brand name → **Create card**.

### 4.10 Table view

All brands in **one table** with the same columns. Filters and export in the toolbar still apply.

### 4.11 Platform login modal (reference)

| Mode | WhatsApp | Telegram |
|------|----------|----------|
| QR | Linked devices → Link a device | Settings → Devices → Link Desktop Device |
| Phone | Pairing code on phone | SMS code / 2FA password |

Modal actions: close, switch QR ↔ phone, verify code/password, **OK** when connected.

| Problem | UI hint | Fix |
|---------|---------|-----|
| QR timeout (10s) | *QR code did not appear within 10 seconds…* | Close, wait, Sync again |
| Telegram QR timeout | *Telegram QR timed out…* | Restart app; IT checks API keys in `.env` |
| WhatsApp QR timeout | *WhatsApp QR timed out…* | Restart; ensure WhatsApp Web reachable on PC |

### 4.12 Parallelism (desktop)

| Pool | Limit | Notes |
|------|-------|-------|
| User execute (Sync / Scrape now / Job Queue) | Up to **10** slots per platform | WA and TG pools are separate |
| Automatic account scrape | Max **6** brands per platform | Separate auto lane — does not take user execute slots |

---

## 5. Issues on Account — types and remediation

### 5.1 Where do issues appear?

There is **no Ticket tab**, **no Process modal**, and **no** `ticket_issue_handles` / In Progress workflow.

After scrape/sync data exists, the app compares **device groups (daily)** vs **brand master** **in memory**. Gaps show on the **Account** tab as **Not Aligned** Remark and **Junk / Missing / Not admin** counts.

### 5.2 Issue types (exactly five)

| Type (internal) | UI meaning | Typical remediation |
|-----------------|------------|---------------------|
| **daily_junk_group** | **Junk** — on device, not in brand master | **Operations → Leave / exit** (Job Queue SETUP) |
| **missing_group** | **Missing** / Need to join — in master, not on account | **Operations → Join missing** (SETUP) |
| **not_admin** | **Not admin** — joined but not admin | **Operations → Set admin** (SETUP) |
| **duplicate_group_id** | Same group ID, conflicting names | Audit master data (IT) |
| **duplicate_group_name** | Same name, different IDs | Audit master data (IT) |

There is **no** `group_count_mismatch` (aggregate Y≠X) ticket type. Session login/logout does **not** create issues.

### 5.3 How to remediate

| Step | Action |
|------|--------|
| 1 | On Account, find **not aligned** rows and read Junk / Missing / Not admin counts |
| 2 | Open **Operations** → Job Queue → brand → SETUP for Join / Set admin / Exit as needed |
| 3 | After jobs finish: **Sync → Scrape now** on the account so daily data refreshes |
| 4 | Badges shrink when daily aligns with master (realtime after DB update) |

If gaps remain after phone/automation fix: run **Sync → Scrape now** again so the latest device data reaches the database.

---

## 6. Group matrix — join/admin (Account header)

The Reporting shell tab was **removed**. Join/admin matrix opens from the Account brand card **group count badge** — read-only.

| Control | Purpose |
|---------|---------|
| Entry | Account → brand card header → **WA/TG Group** badge |
| **Full Group / Full Admin** | Join or admin Yes/No vs master (all accounts on that brand+platform) |
| Search / Status | Filter by name / stock status |
| Column filter (account) | Yes / No / All on account headers |
| **Super Group** filter | Yes / No / All (Telegram: `-100…` id heuristic) |

Updates automatically after scrape or Supabase changes. UI shows the latest matrix without relying on a separate Reporting page.

---

## 7. Operations — Job Queue

**Operations** is **Job Queue only** — there is no Overview tab. Stock summary is on the Account brand header chips (§4.2).

| Area | Function |
|------|----------|
| Brand cards | Expand brand → queue tables per action type |
| **Join missing** | Enqueue joins using invite links from brand master |
| **Create group** | Create groups on device + export invite link |
| **Set admin** | Promote target account where owner is admin |
| **Exit / delete** | Leave junk (and delete when enabled in Settings → Worker) |
| **Set photo** | Brand group photo jobs (Telegram) |
| **SETUP** modals | Pick accounts/groups, then queue — uses live device data |

Session must be **Active** to open Job Queue setup for that account. Worker delays and leave/delete guards are configured under **Settings** (§8).

---

## 8. Settings

Open from sidebar: **Settings** (`/settings`).

Subtitle: *Application preferences*

### 8.1 System status

| Card | Meaning |
|------|---------|
| **Supabase** | **Connected** = database reachable |
| **Active sessions** | Count of active messaging sessions for your user |
| **Platform** | Desktop / Web |
| **Session tables** | Count of active RM session tables |

### 8.2 IT tools (desktop only)

| Button | Function | Typical user |
|--------|----------|--------------|
| **Open configuration folder (.env)** | AppData folder (`.env`, wa-sessions) | IT |
| **Check for app updates** | Manual GitHub update check | IT / power users |

Operational users normally **do not** need the config folder if IT installed the correct build.

**Auto-update:** Updates download from GitHub automatically. **Restart** when prompted — no reinstall.

### 8.3 Preferences — Automatic account scrape

Replaces the old “Automatic account sync” + interval (minutes) controls.

| Control | Function |
|---------|----------|
| **On Scheduled** | Default **On** — once per day at the scheduled local time (app must be open) |
| **Daily run at** | Default **12:00 PM** (local) |
| **Scrape Now** | Default **Off** — one-shot auto scrape; when **On**, brand checkboxes start **all unchecked**; Status shows **standby** until Execute |
| Brand checklist | Max **6** brands per platform (WA and TG separate) |
| Default brands (Scheduled) | **FWSG**, **JMMY**, **M24SG**, **SBMY**, **STMY**, **WBSG** |

| Mode | Primary buttons |
|------|-----------------|
| **On Scheduled** (Scrape Now Off) | **Save** / **Cancel** |
| **Scrape Now** On | **Execute** / **Discard** |

After **Execute** finishes, settings **reset to defaults**: On Scheduled **On**, Scrape Now **Off**, **12:00 PM**, the six default brands.

Auto scrape uses its own lane (max **6** brands/platform) and does **not** consume the user execute pool (up to **10**).

### 8.4 Language

| Choice | Effect |
|--------|--------|
| **English** | UI labels, modals, KPIs in English |
| **中文** | UI in Simplified Chinese |

Change applies immediately across dashboard captions.

### 8.5 Worker settings (WhatsApp / Telegram)

Expand cards for human delays, create-group defaults, invite-by-link throttle, set-admin delays, and leave/delete guards. Values are applied when you **enqueue** Job Queue tasks (frozen into the job payload).

---

## 9. Data synchronization (realtime)

### 9.1 Database changes → open apps

When IT or automation changes **Supabase** (accounts, master groups, daily scrape, session flags):

| Behavior | Detail |
|----------|--------|
| Live refresh | Open apps update within seconds to minutes |
| No reinstall | Data-only changes need no new installer |

Example: IT deletes a test account → row disappears on every user’s dashboard.

After a scrape commits daily + master, Account badges and the Group matrix reload from the latest database (not a stale Ticket cache).

### 9.2 Code / UI changes → app update

Requires a **new app version** (auto-update + **Restart**). See [PROJECT.md §4.4](../../PROJECT.md).

| Change type | Delivery |
|-------------|----------|
| Data in Supabase | Realtime |
| New buttons, layout, logic | New `.exe` version |

### 9.3 PC vs cloud storage

| Location | Contents |
|----------|----------|
| **Cloud (Supabase)** | Brands, accounts, groups, session flags |
| **PC (AppData)** | WhatsApp auth per account (**only on the PC that scanned QR**), auto-scrape preference, language, worker settings |

**WhatsApp multi-PC:** Session does not move between PCs. Hand off → **Clear Session** on the old PC (optional) → new operator **Sync** + scan QR on their PC.

**Telegram multi-PC:** Session string is in the cloud — another PC can **Sync** / scrape while Session is **Active**. Hand off → **Clear Session** (required) so the new operator scans QR on their PC.

---

## 10. Recommended daily workflows

### 10.1 Onboard a new marketing account (after test data cleanup)

| # | Step |
|---|------|
| 1 | Dashboard **Login** |
| 2 | Open target brand (or **Add Card View**) |
| 3 | **+Add** → WA or TG → name + phone → **Save** |
| 4 | **↻ Sync** → scan QR on marketing phone |
| 5 | If prompted → **Scrape now** |
| 6 | Review Account badges (Junk / Missing / Not admin) |
| 7 | **Operations** Job Queue SETUP to remediate → scrape again after jobs |
| 8 | Repeat per account |

### 10.2 Routine health check

| # | Step |
|---|------|
| 1 | **Account** tab — set brand/platform filters |
| 2 | Review **N accounts not aligned** on brand headers |
| 3 | **Sync** rows with **Logout** session |
| 4 | **Sync → Scrape now** where counts are stale or not aligned |
| 5 | Remediate via **Operations** Job Queue, then scrape again |

### 10.3 Replace test accounts with production accounts

**Option A (recommended):** **Remove from slot** for each test account in app → IT cleans database  

**Option B:** IT deletes rows in Supabase → dashboard clears in realtime → team **+Add** and platform login for new accounts

### 10.4 End of shift

| Task | Action |
|------|--------|
| Leave sessions linked | OK — dashboard logout does not unlink phone |
| Hand off open gaps | Note not-aligned accounts / Job Queue status for next shift |
| Export for next shift | Account **Export** with filters applied |

### 10.5 Overnight / batch scrape

| Task | Action |
|------|--------|
| Scheduled | **Settings** → Automatic account scrape → **On Scheduled** On + time (default 12:00 PM) → **Save** (app must stay open) |
| One-shot | Turn **Scrape Now** On → select up to 6 brands → **Execute** → wait → settings reset to defaults |

---

## 11. Glossary

| Term | Definition |
|------|------------|
| **Brand** | Operations unit (e.g. SBMY) with a master group list per WA/TG |
| **Account / slot** | One WA or TG row under a brand |
| **Master / std** | Brand standard group list (`groups_master`) |
| **Daily** | Today’s device group snapshot |
| **Aligned** | Device groups match brand standard for that platform |
| **Session Active** | Connected session on this PC (UI label; not “Valid”) |
| **Sync** | ↻ button — login or live device verification |
| **Scrape now** | Full read of groups from phone → database (via Sync prompt) |
| **Issue / gap** | In-memory mismatch (junk / missing / not admin / duplicates) on Account |
| **Job Queue** | Operations automation (join, create, set admin, exit, photo) |
| **Stock chips** | Account header summary — not Operations Overview |
| **Group matrix** | Read-only join/admin matrix from brand header badge |
| **Slicer** | Filter & tool bar above cards/table |
| **Group Monitoring** | Main module for Account and Operations |
| **Settings** | Preferences page at `/settings` |
| **Backend Operation** | Product family name shown in sidebar |

---

## 12. FAQ

**Do I need to reinstall when the app updates?**  
No. **Restart** after the update notification (if IT published to GitHub).

**Does deleting data in Supabase remove the installer?**  
No. Only dashboard data changes.

**Why is Session Active but scrape still asks for login?**  
This PC may have lost the device session — click **Sync** to verify.

**What does Groups `12/21` mean?**  
12 groups detected on device; 21 = brand standard for that platform (WA and TG counted separately).

**Can one PC host many WhatsApp accounts?**  
Yes — hundreds are supported, but each account needs its own QR scan. User execute concurrency is up to **10** per platform; auto scrape is max **6** brands per platform.

**Gaps remain after I fixed groups on the phone?**  
Use **Sync → Scrape now** so fresh device data reaches the database, then check Account badges again.

**Where did the Ticket tab go?**  
Removed. Issues show on **Account**; fix via **Operations → Job Queue**.

**Is there a group_count_mismatch issue type?**  
No. Only five types: junk, missing, not admin, duplicate ID, duplicate name.

**Dashboard login fails?**  
Contact IT — account required in `users` table.

**Telegram QR or login errors?**  
Contact IT — verify Telegram API credentials and database migration `023`.

**What is the difference between Card view and Table view?**  
Same data; Card view groups by brand, Table view is one flat list.

**Does Dismiss (X on brand card) delete the brand?**  
Yes — after confirmation it removes the brand and related data from the database.

**Why QR error "still starting from previous attempt"?**  
Stuck WA session on this PC — wait a few seconds, or use **Clear Session** (X on Session when Active) then Sync again.

**Can another operator Sync an account I logged in on my PC?**  
For WhatsApp, no — auth stays on your PC until they **Clear Session** (or you do) and they scan QR on their PC.  
For Telegram, another PC can use the account while Session is **Active** (session string is in the cloud). Hand off to a new operator with **Clear Session** so they scan QR on their PC.

**Where is UI language changed?**  
**Settings** → **Language** → English or 中文.

**Where is automatic scrape configured?**  
**Settings** → **Automatic account scrape** (On Scheduled / Scrape Now) — not an interval-in-minutes sync.

---

## Appendix — Quick feature map

```
Login (Username / Password)
  └─ Group Monitoring
        ├─ [Tab Account]
        │     ├─ KPI: Brands, Accounts, Online, Aligned, Issue, Open issues
        │     ├─ Slicer: Search, Brand, Platform, Status, Card|Table, Export
        │     └─ Per Brand Card
        │           ├─ Header: stock chips + WA/TG Group badge → Group matrix modal
        │           ├─ +Add account (WhatsApp / Telegram)
        │           ├─ Row: Sync ↻ | Remove X | Clear Session X | click gap columns
        │           ├─ Last update (read-only) — scrape via Sync → Scrape now
        │           └─ Issues: Junk / Missing / Not admin (5 types, in-memory)
        └─ [Tab Operations] — Job Queue only
              ├─ Join missing | Create group | Set admin | Exit/delete | Set photo
              └─ SETUP → enqueue (live device / master data)
  └─ Settings (/settings)
        ├─ System status (Supabase, Platform, …)
        ├─ Open configuration folder / Check for app updates (IT)
        ├─ Automatic account scrape (On Scheduled / Scrape Now)
        ├─ Language (EN / 中文)
        └─ Worker settings (WA / TG)
```

### Appendix B — Issue type → remediation

| Type | Account badge | Typical Job Queue action |
|------|---------------|--------------------------|
| daily_junk_group | Junk | Leave / exit |
| missing_group | Missing | Join missing |
| not_admin | Not admin | Set admin |
| duplicate_group_id | (audit) | Master data fix |
| duplicate_group_name | (audit) | Master data fix |

### Appendix C — Related documents

| Document | Purpose |
|----------|---------|
| [PROJECT.md](../../PROJECT.md) | Architecture, releases, IT |
| [INSTALL-WINDOWS.md](../../INSTALL-WINDOWS.md) | Windows install steps |
| [HANDBOOK.md](../HANDBOOK.md) | Bahasa Indonesia edition (same structure) |
| [HANDBOOK-zh.md](./HANDBOOK-zh.md) | 简体中文用户手册 |

---

*This guide matches application version **1.0.35**. Update PDF/Word after each release via `npm run build:handbook-docs`.*
