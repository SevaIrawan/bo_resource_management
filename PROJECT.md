# Resource Management — Dokumen Resmi Proyek

**Versi dokumen:** 2026-06-02  
**Versi aplikasi:** `1.0.3` (lihat `package.json`)  
**Status:** Produksi internal — desktop Windows untuk tim operasional perusahaan  

---

## 1. Ringkasan

**Resource Management** (tampilan: *Backend Operation*) adalah aplikasi **desktop Windows (Electron)** untuk memantau dan mengoperasikan banyak akun **WhatsApp** dan **Telegram** per brand: login platform, sync grup, scraper, ticket/issue, dan export Excel.

| Aspek | Keterangan |
|--------|------------|
| **Pengguna** | Tim internal perusahaan saja — **bukan** produk dijual ke pihak luar |
| **Database** | Supabase (cloud), satu project organisasi |
| **Distribusi** | Satu file installer `.exe`; config organisasi **terbundel** |
| **Pembaruan kode** | **Auto-update** dari GitHub Releases → user **Restart** (tanpa install ulang manual) |
| **Pembaruan data** | **Supabase Realtime** → dashboard tim ikut berubah saat DB di-update |

**Repository GitHub:** `SevaIrawan/bo_resource_management`

---

## 2. Stack teknis (kondisi aktual)

| Lapisan | Teknologi |
|---------|-----------|
| Desktop shell | Electron 36 |
| UI | React 19, TypeScript, Vite 6, Tailwind CSS v4 |
| Routing | React Router 7 |
| Database | Supabase JS (`@supabase/supabase-js`) |
| WhatsApp | `whatsapp-web.js` + Puppeteer/Chrome (main process) |
| Telegram | Python sidecar Telethon → `rm-telegram-sidecar.exe` (terbundel) |
| Excel export | SheetJS (`xlsx`) di renderer |
| Auto-update | `electron-updater` → GitHub Releases |

---

## 3. Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Renderer (React)                                   │
│  Group Monitoring · Tickets · Login · Admin                  │
│  getSupabase() ← service role via IPC (app terinstall)       │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC
┌──────────────────────────▼──────────────────────────────────┐
│  Electron Main                                               │
│  appEnv · platformLogin (WA/TG) · scraper · autoUpdate        │
└───────┬─────────────────────────────┬────────────────────────┘
        │                             │
        ▼                             ▼
  wa-sessions/ (AppData)      rm-telegram-sidecar.exe
  Puppeteer per akun         (resources/sidecar/)
        │                             │
        └─────────────┬───────────────┘
                      ▼
              Supabase (PostgreSQL + Realtime)
```

**Prinsip data:** Semua data bisnis (brand, akun, grup, ticket, session flag) di **Supabase**. Sesi device WA/TG: string/session di DB + file auth WA di `%APPDATA%\Resource Management\wa-sessions\`.

---

## 4. Konfigurasi & installer (kondisi 1.0.3)

### 4.1 Variabel lingkungan

| Variabel | Peran |
|----------|--------|
| `VITE_SUPABASE_URL` | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci utama app desktop (bypass RLS) — **bukan** untuk publik |
| `VITE_SUPABASE_ANON_KEY` | Opsional; fallback dev |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | Satu pasang untuk semua akun TG (my.telegram.org) |

WhatsApp **tidak** memakai API key — login QR/pairing per akun.

### 4.2 Build installer (tim IT)

```powershell
cd "C:\Work\Resource Management"
# .env di root project HARUS lengkap (validate-org-env)
npm run build:installer
```

Output: `release\Resource Management Setup 1.0.3.exe`

**Yang terbundel dalam satu paket:**

- Aplikasi Electron + UI production
- `org-default.env` (salinan `.env` tim IT saat build)
- `rm-telegram-sidecar.exe`
- Dependensi WA (asarUnpack Puppeteer)

### 4.3 User internal — yang mereka lakukan

1. Terima **satu file** `Resource Management Setup x.x.x.exe`
2. Install sekali
3. Buka app → **login username/password** (`public.users`)
4. Tambah akun marketing → **login WA/TG** (QR di HP marketing)
5. **Tidak** mengisi `.env` manual (config dari `org-default.env`)

Saat buka app, main process memuat `resources/org-default.env` dulu; jika AppData `.env` kosong/rusak (installer lama), **diperbaiki otomatis** dari bundel.

### 4.4 Auto-update (layout, logic, bugfix)

| Peran | Langkah |
|--------|---------|
| **Developer / IT** | Naikkan `version` di `package.json` → `npm run publish:github` (butuh `GH_TOKEN`) |
| **Tim internal** | App cek GitHub ~12 detik setelah buka + tiap 4 jam → unduh → **Restart** |

**Bukan** cukup `git push` saja — harus ada **GitHub Release** berisi artefak update (`latest.yml`, installer, blockmap).

`.env` organisasi dan sesi WA di PC user **tetap** setelah restart.

---

## 5. Autentikasi

| Jenis | Mekanisme |
|-------|-----------|
| **Login dashboard** | Tabel `public.users` — kolom `username` + `password` (bukan Supabase Auth JWT) |
| **Klien Supabase di app** | Service role dari bundel/IPC (`src/lib/supabaseConfig.ts`) |
| **Login platform WA/TG** | Modal QR/phone di Electron; session disimpan ke `resource_management_platform_sessions` |

---

## 6. Fitur utama (UI)

### 6.1 Group Monitoring (`/`)

- Brand card + tabel akun (WA hijau / TG biru)
- Kolom: Account, Brand, Status, Session, Groups, Admin, Scraper, Action
- **Session:** INVALID → login modal; VALID → probe device / SYNC / RUN
- Multi-akun per brand (slot kosong + Add)
- Remove akun dari slot → nonaktifkan DB + cabut sesi device (WA: `purgeWaDisk`)
- Export: group links, semua akun, tickets (Excel)
- Auto-sync terjadwal (`useAutoAccountSync`)

### 6.2 Ticket monitoring

- Issue dari rekonsiliasi daily vs master brand (`reconcileTickets.ts`)
- **Kontrak bisnis:** login/logout session **bukan** ticket; hanya mismatch grup/admin, grup sampah, duplicate ID/nama
- Workflow: handle issue, modal detail, proses ticket (migrasi 024–026)
- Realtime reload saat tabel `tickets` / `scrape_runs` berubah

### 6.3 Admin (`/admin`)

- Status sistem, buka folder config (untuk IT), cek update manual

---

## 7. Multi-akun (100+ WA & Telegram)

| Platform | Kunci device | Batasan |
|----------|--------------|---------|
| WhatsApp | `resolveDeviceSessionId()` → LocalAuth `clientId` / folder `wa-sessions/session-{id}` | Lock per session; pool max ~4 Chrome (`waBrowserPool.ts`) |
| Telegram | UUID `messaging_accounts.id` → sidecar `SESSIONS[session_id]` | Poll QR v3; tidak cancel `wait_task` saat finalize |

Validasi sebelum rilis: `npm run validate:desktop`

---

## 8. Supabase — tabel & realtime

### 8.1 Tabel aktif (`src/config/tables.ts`)

| Tabel | Fungsi |
|-------|--------|
| `resource_management_brands` | Registry brand |
| `resource_management_messaging_accounts` | Akun WA/TG per user |
| `resource_management_platform_sessions` | Session aktif device |
| `resource_management_platform_session_logs` | Audit login |
| `resource_management_sync_activity_logs` | Log sync |
| `resource_management_scrape_runs` | Log scrape |
| `resource_management_group_scrape_daily` | Snapshot grup per hari per akun |
| `resource_management_groups_master` | Master join list per brand+platform |
| `resource_management_account_snapshots` | Metrik kartu dashboard |
| `resource_management_tickets` | Issue terbuka |
| `resource_management_ticket_issue_handles` | Workflow handle issue |

`public.users` — existing, tidak dibuat migrasi RM.

### 8.2 Urutan migrasi SQL

**DB baru:** `003` → `017` → `020` → `023` → `024` → `025` → `026`  

**DB production lama:** ikuti **SUPABASE_RUNBOOK.md** (jangan ulang `017`).

Detail: `supabase/migrations/README.md`

### 8.3 Apa yang auto-sync ke app terbuka

| Perubahan di DB | Dampak di app |
|-----------------|---------------|
| Ticket, scrape run, snapshot | UI patch / reload ticket |
| `groups_master`, `group_scrape_daily` | Metrik & master (debounce ~400 ms) |
| Brand / messaging account | Reload monitoring penuh |
| Session `is_active` false | Badge session invalid |

**Tidak realtime:** perubahan **kode/layout** → hanya lewat **auto-update app**.

**Hapus akun di DB:** CASCADE data terkait; baris hilang di dashboard (realtime). File installer di PC user **tidak** terhapus.

---

## 9. Alur rilis (developer)

```text
1. Develop (npm run dev)
2. validate:desktop
3. Bump version di package.json
4. git commit / push (opsional, backup kode)
5. npm run publish:github
   - build:installer
   - upload Release (PUBLIC)
6. Tim: Restart app → versi baru
```

**Distribusi pertama** ke PC baru: hanya kirim **Setup .exe** terbaru.

---

## 10. Struktur folder penting

```text
electron/main/          Main process, IPC, WA login, autoUpdate, appEnv
electron/preload/       contextBridge electronAPI
python-sidecar/         Sumber Telegram (dev)
resources/
  org-default.env       Hasil copy .env saat build (gitignore)
  sidecar/              rm-telegram-sidecar.exe
src/
  components/group-monitoring/
  hooks/                useRealtimeMonitoring, useAccountSyncFlow, …
  lib/                  Supabase, sync, tickets, scraper
  providers/            GroupMonitoringProvider
scripts/
  build-installer.ps1
  publish-release.ps1
  validate-*.mjs
supabase/migrations/
release/                Output installer (gitignore)
```

---

## 11. Perintah npm

| Perintah | Kegunaan |
|----------|----------|
| `npm run dev` | Development Electron + Vite |
| `npm run setup` | Node + Python deps |
| `npm run validate:desktop` | Gate sebelum build |
| `npm run build:installer` | Installer Windows lengkap |
| `npm run publish:github` | Build + upload Release (auto-update) |
| `npm run typecheck` | TypeScript check |

---

## 12. Batasan & hal yang sering disalahpahami

| Pernyataan | Fakta |
|------------|--------|
| "Hapus di database = uninstall app" | **Salah.** Hanya data cloud; `.exe` tetap di PC |
| "Push GitHub = tim dapat UI baru" | Perlu **Release** + version naik + app terinstall punya auto-update |
| "User isi .env tiap PC" | **Tidak** (build 1.0.2+ dengan `.env` IT lengkap saat build) |
| "Service role aman di web publik" | Hanya untuk desktop internal terdistribusi terbatas |
| "Session invalid = ticket" | **Tidak** — kontrak issue di `.cursorrules` §11 |

---

## 13. Dokumen terkait

| File | Isi |
|------|-----|
| **[docs/guides/documents/](./docs/guides/documents/)** | **Panduan user — PDF & Word (EN + 中文)** — bukan Markdown |
| [docs/guides/README.md](./docs/guides/README.md) | Cara bagikan ke tim |
| [docs/HANDBOOK.md](./docs/HANDBOOK.md) | Referensi internal (ID) |
| `docs/guides/_source/` | Sumber IT saja — jangan kirim ke user |
| [SUPABASE_RUNBOOK.md](./SUPABASE_RUNBOOK.md) | Urutan SQL wajib |
| [INSTALL-WINDOWS.md](./INSTALL-WINDOWS.md) | Panduan install singkat |
| [README.md](./README.md) | Quick start developer |
| [.cursorrules](./.cursorrules) | Kontrak bisnis ticket & multi-akun untuk AI/dev |

---

## 14. Kontak & kepemilikan

- **Author (package.json):** Seva Irawan  
- **Product name (installer):** Resource Management  
- **AppId:** `com.resourcemanagement.app`

---

*Dokumen ini mencerminkan kondisi codebase per build **1.0.3**. Jika version atau alur berubah, perbarui bagian 4, 9, dan nomor versi di header.*
