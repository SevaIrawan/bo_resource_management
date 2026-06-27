# Resource Management

Desktop dashboard untuk group monitoring — WhatsApp & Telegram scraper summary.

**Versi saat ini:** `1.0.27` (lihat `package.json`)

**Rilis 1.0.27:** Auto scrape lane terpisah; progress scrape persist saat navigasi; audit guard job queue vs auto-scrape; Settings page; bersihkan dead code & duplikasi scrape cancel/metrics.

**Rilis 1.0.26:** Supabase migration **036** — PK `groups_master` = `(brand, platform, group_id)` (fix duplicate key scrape); satu alur tulis DB via `rm_commit_account_scrape`; multi-akun scrape UI per baris; idle scrape watchdog.

**Rilis 1.0.25:** Kontrak GM Sync/Run/Scrape — slot execute 4 akun paralel, scrape commit atomik (`rm_commit_account_scrape`), sync valid tanpa double device read, perbaikan guard IPC & tombol Run.

**Rilis 1.0.24:** Hapus tab Ticketing & modul issue (UI, reconcile, script validator); migrasi Supabase drop semua tabel `resource_management_ticket_*`.

**Rilis 1.0.23:** Scrape WA ambil invite link dari device (daily→master), stabilitas Puppeteer (protocolTimeout, concurrency, retry), job queue VIEW/export, validator data nyata.

**Rilis 1.0.21:** edit akun (pensil) — label, phone, location MY/KH sync DB + grid; kolom Location + migrasi Supabase `031`; WA scrape sequential per grup dengan delay.

**Rilis 1.0.20:** stabilitas Scrape/Sync — WA probe null state, grace skip probe, grid patch db+ui id, ticket/reporting refresh tanpa gate brandId, sync metrik dari daily DB.

**Rilis 1.0.19:** tab Operations stock engine, Reporting kolom Status + slicer, export modal bucket, worker settings scaffolding.

**Rilis 1.0.18:** perbaikan UI ticket/grid/reporting realtime setelah Run Scraper (bypass ticket lock, patch grid atomik).

**Rilis 1.0.17:** session probe 20s + resolve akun per baris grid; ticket/reporting data fresh setelah scrape; tab Reporting matrix dengan filter back.

**Dokumen resmi (kondisi proyek terkini):** **[PROJECT.md](./PROJECT.md)** — arsitektur, installer, auto-update, Supabase realtime, kontrak internal.

**Installer multi-platform:** Windows `.exe`, macOS `.dmg`/`.zip`, Linux `.AppImage` — lihat [docs/PLAN-CROSS-PLATFORM-INSTALLERS.md](./docs/PLAN-CROSS-PLATFORM-INSTALLERS.md) dan [docs/RELEASE-CI.md](./docs/RELEASE-CI.md).

**Panduan user (PDF / Word, bukan Markdown):** [docs/guides/documents/](./docs/guides/documents/) · rebuild: `npm run build:handbook-docs`

## Stack

- **Electron** — desktop app (Windows, macOS, Linux)
- **React 19 + TypeScript + Vite**
- **Tailwind CSS v4** — dark theme, WhatsApp & Telegram accents
- **Supabase** — database, auth, session tracking
- **React Router** — navigation

## Pages (Foundation)

| Page | Route | Description |
|------|-------|-------------|
| Group Monitoring | `/` | WA & TG scraper dashboard |
| Admin | `/admin` | Sessions, config, system |

## Development

```bash
# One-shot setup (Node + Python sidecar deps)
npm run setup

# Or manual:
npm install
npm run setup:python

# Copy env
cp .env.example .env
```

Isi `.env`:

| Variable | Untuk apa | Dari mana |
|----------|-----------|-----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci app desktop (internal) | Supabase → service_role |
| `VITE_SUPABASE_ANON_KEY` | Opsional (dev) | Supabase → anon |
| `TELEGRAM_API_ID` | Telethon login | [my.telegram.org](https://my.telegram.org) → API Development tools |
| `TELEGRAM_API_HASH` | Telethon login (**rahasia**) | Sama — jangan expose ke UI |

**WhatsApp** tidak butuh API key — cukup scan QR; session disimpan di Supabase.

> `TELEGRAM_*` **tanpa** prefix `VITE_` supaya tidak masuk bundle React (aman).

```bash
# Run web + electron dev
npm run dev
```

## Build Desktop (Windows) — installer untuk PC lain

```powershell
npm run build:installer
```

Output: `release\Resource Management Setup ….exe`

Panduan: **[INSTALL-WINDOWS.md](./INSTALL-WINDOWS.md)** · **[Bundel installer (Win/Mac/Linux)](./docs/INSTALLER-BUNDLE.md)** · Rilis/update: `npm run publish:github`

Ringkas: tim internal install `.exe` sekali → login → SYNC WA/TG. Config terbundel; update kode via auto-update (Restart).

## Export (Excel)

- Library: **xlsx** (SheetJS) — `src/lib/exportExcel.ts`
- **Group link / akun** → `RM-[nama akun]-YYYYMMDD.xlsx` (nama akun sudah berisi prefix brand)
- **Table view (semua akun)** → `RM-all-accounts-YYYYMMDD.xlsx`
- **Tickets** → `RM-tickets-YYYYMMDD.xlsx`
- Python sidecar also has **openpyxl** for server-side export later.

## Supabase Setup

**Urutan SQL wajib (jangan tebak-tebak):** lihat **[SUPABASE_RUNBOOK.md](./SUPABASE_RUNBOOK.md)** di root project.

Ringkas:
- **DB baru:** `003` → `017` → `020` → `023` → `030` → `032` → `035` → **`036`**
- **DB sudah jalan:** `018` (sekali) → `019` (opsional) → `020` → `023` → `030`–`032` → `035` → **`036`** (wajib — PK master + RPC scrape)
- Error console `404 sync_activity_logs` / `400 session_status` = belum jalankan **`023`**

**Prinsip:** Semua data bisnis di Supabase; session WA/TG tersimpan + Realtime; metrik sync di `account_snapshots`; audit di `platform_session_logs` & `scrape_runs`.

## Layout

- Sticky Header + Sub Header
- Collapsible Sidebar (expand/collapse)
- Full-frame content area
- Dark theme with WA green (#25D366) & TG blue (#229ED9) accents

## Project Structure

```
electron/          Electron main & preload
src/
  components/      Layout & UI
  pages/           Group Monitoring, Admin
  lib/             Supabase client, utils
  contexts/        Sidebar state
supabase/
  migrations/      SQL schema
```
