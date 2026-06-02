# Resource Management — Official User Guide (English)

| | |
|---|---|
| **Product** | Backend Operation — Resource Management |
| **App version** | 0.1.1 |
| **Audience** | Internal operations team (marketing / monitoring of WhatsApp & Telegram groups) |
| **Platform** | Windows desktop (`.exe`) |
| **UI languages** | English / 中文 (Admin → Language) |

This document is the **official guide to every feature** in the current application. For architecture and IT release notes, see [PROJECT.md](../../PROJECT.md).

---

## Table of contents

1. [Overview](#1-overview)
2. [Getting started](#2-getting-started)
3. [Navigation and layout](#3-navigation-and-layout)
4. [Account tab — account monitoring](#4-account-tab--account-monitoring)
5. [Ticket tab — issues and remediation](#5-ticket-tab--issues-and-remediation)
6. [Admin page](#6-admin-page)
7. [Data synchronization (realtime)](#7-data-synchronization-realtime)
8. [Recommended daily workflows](#8-recommended-daily-workflows)
9. [Glossary](#9-glossary)
10. [FAQ](#10-faq)
11. [Appendix — Quick feature map](#appendix--quick-feature-map)

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
| Tickets / issues | See remediation tasks (missing groups, not admin, duplicates, junk groups, etc.) |
| Export | Export filtered data to **Excel** for field operations |

### 1.2 Two types of “login”

Do not confuse these — they serve different purposes.

| Type | Purpose | How |
|------|---------|-----|
| **Dashboard login** | Access the application | **Username** + **Password** (from IT, `users` table) |
| **Platform login** | Link WA/TG to a marketing account | **Sync (↻)** → QR or phone-number modal |

The dashboard password is **not** your Telegram or WhatsApp password.

### 1.3 What is **not** a ticket?

Changes to **session login/logout** in the **Session** column do **not** create tickets. Tickets only cover **group and admin** problems relative to the brand standard.

### 1.4 Who should read which sections?

| Role | Primary sections |
|------|------------------|
| Field / marketing ops | §2–§5, §8 |
| Team lead | §4–§5 KPIs, bookmarks, export |
| IT / support | §6, §7, §10 FAQ |

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
| **Group Monitoring** | Main page — accounts & tickets |
| **Admin** | System status & preferences |
| **Logout (power)** | Exit dashboard only — does **not** auto-logout WA/TG on phone |

**Tip:** Collapse the sidebar to icon-only mode — use **Toggle sidebar** in the header.

### 3.2 Header (top)

| Element | Function |
|---------|--------|
| Page title | Active module (e.g. Group Monitoring, Admin) |
| **Welcome** + user name | Currently signed-in user |
| **Logout** | Exit dashboard |

### 3.3 Sub-header (Group Monitoring only)

| Tab | Function |
|-----|----------|
| **Account** | Brand cards & WA/TG account rows |
| **Ticket** | Open issues to remediate (badge = open issue count) |

Switching tabs updates KPI cards and the filter toolbar below.

### 3.4 KPI cards (summary numbers)

Numbers refresh when you change tab or when data updates from the database.

#### Account tab KPIs

| KPI | Meaning |
|-----|---------|
| **Brands** | Number of brand cards visible |
| **Accounts** | Filled account rows |
| **Online** | Accounts with **Active** status (session valid) |
| **Aligned** | Accounts matching brand standard for their platform |
| **Issue** | Accounts **not aligned** |
| **Open issues** | Count of open ticket issues (rollup) |

#### Ticket tab KPIs

| KPI | Meaning |
|-----|---------|
| **Open issues** | Issue cards shown |
| **Missing groups** | Issues of type *Missing group* |
| **Not admin** | Issues of type *Not admin* |
| **Groups to handle** | Total group rows across all issues |
| **Accounts involved** | Distinct accounts in filtered issues |
| **Brands involved** | Distinct brands in filtered issues |

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
| **WA x std / TG x std** | Standard (master) group count per platform |
| **All aligned** / **N accounts not aligned** | Health summary for this brand |
| **+Add** | Add new account (choose WA or TG) |
| **X (Dismiss)** | Hide card for **this session only** — does not delete database data |

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
| **Brand** | Brand name | Same for all rows in the card |
| **Status** | **Active** = valid session; **Logout** = invalid | Green / red indicator |
| **Session** | **Valid** / **Invalid** | Invalid → platform login required first |
| **Groups** | `Y/X` | Y = groups on device today; X = brand standard for same platform |
| **Admin** | Bar + `a/X` | How many groups you are admin of vs standard |
| **Scraper** | **Run** + time / progress | Full group read into database |
| **Action** | **Group link** | Open group list + invite links |

**Important:** WhatsApp and Telegram totals are **separate** — do not compare `Y/X` across platforms on one row.

### 4.4 Row controls

| Control | Function |
|---------|--------|
| **↻ (Sync)** | Primary flow: platform login or live session check + count update |
| **X (hover, right of name)** | **Remove from slot** — detach account from slot (confirmation modal) |
| **Group link** | Modal: group name, ID, invite link, admin flag — needs scrape data |

Tooltip: **Sync account**.

### 4.5 Sync (↻) flow — critical

Sync behavior depends on **Session** column value.

#### Session = **Invalid**

| Step | What happens |
|------|----------------|
| 1 | Click **↻** |
| 2 | Platform login modal opens (QR default, or phone login) |
| 3 | Scan QR on marketing phone (WA: Linked devices; TG: Link Desktop Device) |
| 4 | On success: session saved, group counts refresh |
| 5 | App may prompt **Run scraper** to save full group list to DB |

#### Session = **Valid**

| Step | What happens |
|------|----------------|
| 1 | Click **↻** |
| 2 | App checks WA/TG still active on **this PC** |
| 3 | If OK: **Groups** / **Admin** numbers update |
| 4 | If failed: prompted to log in again |

**Notes:**

- Platform login runs only in the **desktop app** (not browser-only).
- If QR does not appear within ~10 seconds: close modal, wait a few seconds, **Sync** again.
- Long sync (>3 min) on Telegram with many groups: retry or restart app.

### 4.6 Scraper column — **Run** button

| Condition | Display | Action |
|-----------|---------|--------|
| Session invalid | *Use Sync (↻) to log in first* | Sync first |
| Already aligned | **Last update** time only | Run usually not needed |
| **Not aligned** | **Run** + timestamp | Click **Run** → read all groups from phone → save DB → tickets refresh |
| Running | *Reading groups…* / progress | Wait (can take minutes for large group lists) |

| Term | Meaning |
|------|---------|
| **Run** | Full scrape — all groups written to database |
| **Sync** | Session check + summary counts — not always a full scrape |

After login, you may see: *Login OK. Device group & admin counts are updated. Save the full group list to the database now?* → choose **Run scraper** or **Later**.

### 4.7 Group link modal

Open via **Action → Group link**.

| Feature | Function |
|---------|----------|
| Table | Group name, Group ID, Invite link, Admin (Yes/No) |
| Admin filter | All / admin only / non-admin |
| Pagination | Previous / Next when many groups |
| Scroll | Scroll inside table (viewport hint for large pages) |

Empty list? Run **Run** scraper first. Message: *No links. Run scraper first.*

### 4.8 Remove account from slot

| Step | Action |
|------|--------|
| 1 | Hover account row → **X** icon |
| 2 | Confirm **Remove from slot?** → **Remove** |
| 3 | Effect | Account deactivated in DB; device session cleared on this PC (WA: local auth removed) |

Use before swapping test accounts for production marketing accounts — or let IT delete from database (see §7).

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

---

## 5. Ticket tab — issues and remediation

### 5.1 When do tickets appear?

After an account has scrape/sync data, the system compares **device groups (daily snapshot)** vs **brand master**. Mismatches create tickets automatically.

### 5.2 Issue types (filter: All ticket types)

| Type (UI) | Short meaning | Typical field action |
|-----------|---------------|----------------------|
| **Missing group** | In brand master but not on this account | Join group (use export invite links) |
| **Not admin** | In group but not admin | Request admin rights |
| **Group count mismatch** | Device count ≠ brand standard | Audit and align |
| **Duplicate group ID** | Same ID, conflicting names | Audit master data |
| **Duplicate group name** | Same name, different IDs in master | Audit master data |
| **Device junk group** | On phone but not in master | Leave/clean junk groups on phone |

Session login/logout does **not** create tickets.

### 5.3 Ticket toolbar

| Tool | Function |
|------|--------|
| Search | *Search account / group…* |
| Filter Brand / Platform / Type | Narrow issue list |
| **Bookmark: In Progress** | Issues marked *In Progress* |
| **Bookmark: Completed** | Issues marked *Complete* |
| **Export** | Excel for all issues **matching filters** |

**Issue workflow views:** In Progress · Completed

### 5.4 Issue card

Each card = **one issue** per: account + brand + issue type.

| Section | Content |
|---------|---------|
| Title | Account name |
| Badge | Issue type (color-coded) |
| Platform | WA / TG |
| Meta | Phone · brand |
| Description | Summary (group counts, headlines) |
| **Process** / **New** / status caption | Workflow — **click** to open handle form |
| **Double-click card** | Full **detail** table (all group rows) |

Hint on card: *Double-click for full detail table*

### 5.5 Process modal (workflow)

| Field | Function |
|-------|----------|
| **Task status** | To Do → In Progress → Complete / Interrupted |
| Due dates / remarks | Stored in database (`ticket_issue_handles`) |
| **Save** | Persist and close |
| **Export** | Excel for this issue only |

Bookmarks **In Progress** / **Completed** follow the saved task status.

### 5.6 Detail modal (double-click)

| Feature | Function |
|---------|----------|
| Full table | All groups involved in the issue |
| **Export** | Field remediation reference for this issue |
| Close | **Esc** or click outside — **Close** button |

### 5.7 Ticket ↔ Account relationship

| Step | Action |
|------|--------|
| 1 | Fix groups on phone (join, admin, remove junk) |
| 2 | On affected account: **Sync** or **Run** again |
| 3 | Tickets close or shrink when data aligns (realtime after DB update) |

If tickets remain after phone fix: **Run** scraper to push latest device data.

---

## 6. Admin page

Open from sidebar: **Admin**.

Subtitle: *System status and application preferences*

### 6.1 System status

| Card | Meaning |
|------|---------|
| **Supabase** | **Connected** = database reachable |
| **Active sessions** | Placeholder (not a live session count) |
| **Platform** | Desktop / Web |
| **Session tables** | Count of active RM session tables |

### 6.2 IT tools (desktop only)

| Button | Function | Typical user |
|--------|----------|--------------|
| **Open configuration folder (.env)** | AppData folder (`.env`, wa-sessions) | IT |
| **Check for app updates** | Manual GitHub update check | IT / power users |

Operational users normally **do not** need the config folder if IT installed the correct build.

**Auto-update:** Updates download from GitHub automatically. **Restart** when prompted — no reinstall.

### 6.3 Preferences

#### Automatic account sync

| Option | Function |
|--------|----------|
| **Enabled** | Background checks while app is open (same logic as per-account **Sync**) |
| **Interval (minutes)** | How often to run (default often 60 minutes) |

Logs activity to the database with timestamps. Does **not** replace a full **Run** scrape when no scrape data exists yet.

Summary on Admin card: *On · N min* or *Off*.

#### Language

| Choice | Effect |
|--------|--------|
| **English** | UI labels, modals, KPIs in English |
| **中文** | UI in Simplified Chinese |

Change applies immediately across dashboard captions.

---

## 7. Data synchronization (realtime)

### 7.1 Database changes → open apps

When IT or automation changes **Supabase** (accounts, tickets, master groups, session flags):

| Behavior | Detail |
|----------|--------|
| Live refresh | Open apps update within seconds to minutes |
| No reinstall | Data-only changes need no new installer |

Example: IT deletes a test account → row disappears on every user’s dashboard.

### 7.2 Code / UI changes → app update

Requires a **new app version** (auto-update + **Restart**). See [PROJECT.md §4.4](../../PROJECT.md).

| Change type | Delivery |
|-------------|----------|
| Data in Supabase | Realtime |
| New buttons, layout, logic | New `.exe` version |

### 7.3 PC vs cloud storage

| Location | Contents |
|----------|----------|
| **Cloud (Supabase)** | Brands, accounts, groups, tickets, session flags |
| **PC (AppData)** | WhatsApp auth per account, auto-sync preference, language |

---

## 8. Recommended daily workflows

### 8.1 Onboard a new marketing account (after test data cleanup)

| # | Step |
|---|------|
| 1 | Dashboard **Login** |
| 2 | Open target brand (or **Add Card View**) |
| 3 | **+Add** → WA or TG → name + phone → **Save** |
| 4 | **↻ Sync** → scan QR on marketing phone |
| 5 | If prompted → **Run** scraper |
| 6 | **Ticket** tab → handle issues → **Export** if needed |
| 7 | Repeat per account |

### 8.2 Routine health check

| # | Step |
|---|------|
| 1 | **Account** tab — set brand/platform filters |
| 2 | Review **N accounts not aligned** on brand headers |
| 3 | **Sync** rows with **Invalid** session |
| 4 | **Run** where counts are stale or not aligned |
| 5 | **Ticket** tab — bookmark **In Progress** → remediate → mark **Complete** |

### 8.3 Replace test accounts with production accounts

**Option A (recommended):** **Remove from slot** for each test account in app → IT cleans database  

**Option B:** IT deletes rows in Supabase → dashboard clears in realtime → team **+Add** and platform login for new accounts

### 8.4 End of shift

| Task | Action |
|------|--------|
| Leave sessions linked | OK — dashboard logout does not unlink phone |
| Hand off open tickets | Set **In Progress** + remarks in **Process** modal |
| Export for next shift | Ticket or Account **Export** with filters applied |

---

## 9. Glossary

| Term | Definition |
|------|------------|
| **Brand** | Operations unit (e.g. SBMY) with a master group list per WA/TG |
| **Account / slot** | One WA or TG row under a brand |
| **Master / std** | Brand standard group list (`groups_master`) |
| **Daily** | Today’s device group snapshot |
| **Aligned** | Device groups match brand standard for that platform |
| **Session Valid** | Active session record in DB (may still need device check today) |
| **Sync** | ↻ button — login or live device verification |
| **Run / Scraper** | Full read of groups from phone → database |
| **Ticket / Issue** | Remediation task for group data |
| **Bookmark** | Ticket filters: In Progress / Completed |
| **Slicer** | Filter & tool bar above cards/table |
| **Group Monitoring** | Main module for accounts and tickets |
| **Backend Operation** | Product family name shown in sidebar |

---

## 10. FAQ

**Do I need to reinstall when the app updates?**  
No. **Restart** after the update notification (if IT published to GitHub).

**Does deleting data in Supabase remove the installer?**  
No. Only dashboard data changes.

**Why is Session Valid but Run still asks for login?**  
This PC may have lost the device session — click **Sync** to verify.

**What does Groups `12/21` mean?**  
12 groups detected on device; 21 = brand standard for that platform (WA and TG counted separately).

**Can one PC host many WhatsApp accounts?**  
Yes — hundreds are supported, but each account needs its own QR scan; Chrome processes are limited (~4 concurrent).

**Tickets remain after I fixed groups on the phone?**  
Click **Run** or **Sync** so fresh device data reaches the database.

**Dashboard login fails?**  
Contact IT — account required in `users` table.

**Telegram QR or login errors?**  
Contact IT — verify Telegram API credentials and database migration `023`.

**What is the difference between Card view and Table view?**  
Same data; Card view groups by brand, Table view is one flat list.

**Does Dismiss (X on brand card) delete the brand?**  
No — it only hides the card until you reload or refilter.

**Where is UI language changed?**  
**Admin** → **Preferences** → **Language** → English or 中文.

---

## Appendix — Quick feature map

```
Login (Username / Password)
  └─ Group Monitoring
        ├─ [Tab Account]
        │     ├─ KPI: Brands, Accounts, Online, Aligned, Issue, Open issues
        │     ├─ Slicer: Search, Brand, Platform, Status, Card|Table, Export
        │     └─ Per Brand Card
        │           ├─ +Add account (WhatsApp / Telegram)
        │           ├─ Row: Sync ↻ | Remove X | Group link
        │           └─ Scraper: Run
        └─ [Tab Ticket]
              ├─ KPI: Open, Missing, Not admin, Groups to handle, …
              ├─ Slicer: Search, filters, In Progress | Completed, Export
              ├─ 6 issue types
              └─ Issue card → Process modal | Double-click Detail
  └─ Admin
        ├─ System status (Supabase, Platform, …)
        ├─ Open configuration folder / Check for app updates (IT)
        └─ Automatic account sync + Language (EN / 中文)
```

### Appendix B — Issue type → export columns (detail export)

Typical Excel columns: Issue ID, #, Account, Brand, Platform, Phone, Issue type, Group name, Group ID, Invite link, Note.

### Appendix C — Related documents

| Document | Purpose |
|----------|---------|
| [PROJECT.md](../../PROJECT.md) | Architecture, releases, IT |
| [INSTALL-WINDOWS.md](../../INSTALL-WINDOWS.md) | Windows install steps |
| [HANDBOOK.md](../HANDBOOK.md) | Bahasa Indonesia edition (same structure) |
| [HANDBOOK-zh.md](./HANDBOOK-zh.md) | 简体中文用户手册 |

---

*This guide matches application version **0.1.1**. Update this document when new features ship.*
