# Resource Management

Desktop dashboard untuk group monitoring — WhatsApp & Telegram scraper summary.

## Stack

- **Electron** — desktop app (Windows)
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
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (client) | Supabase Dashboard → Settings → API |
| `TELEGRAM_API_ID` | Telethon login | [my.telegram.org](https://my.telegram.org) → API Development tools |
| `TELEGRAM_API_HASH` | Telethon login (**rahasia**) | Sama — jangan expose ke UI |

**WhatsApp** tidak butuh API key — cukup scan QR; session disimpan di Supabase.

> `TELEGRAM_*` **tanpa** prefix `VITE_` supaya tidak masuk bundle React (aman).

```bash
# Run web + electron dev
npm run dev
```

## Build Desktop (Windows)

```bash
npm run electron:build
```

Output: `release/` folder

## Export (Excel)

- Library: **xlsx** (SheetJS) — `src/lib/exportExcel.ts`
- **Brand card** → `RM-{brand}-group-links-YYYYMMDD.xlsx`
- **Table view** → `RM-all-accounts-YYYYMMDD.xlsx`
- **Tickets** → `RM-tickets-YYYYMMDD.xlsx`
- Python sidecar also has **openpyxl** for server-side export later.

## Supabase Setup

### Database Supabase (desktop-ready, realtime)

1. `supabase/migrations/003_auth_login_rpc.sql`
2. `supabase/migrations/017_rm_full_reset.sql` — **9 tabel RM** + master brand + RPC + Realtime

**DB yang sudah production (tanpa reset data):** jalankan sekali `018_drop_legacy_rm.sql`, lalu scrape ulang.

**Peringatan:** `017` menghapus semua data RM. `public.users` tidak disentuh. Migrasi `001–011`, `019–021` sudah dihapus dari repo — jangan jalankan lagi di Supabase.

Detail tabel: `supabase/migrations/README.md`.

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
