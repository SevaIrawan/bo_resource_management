# Resource Management — Dokumen Resmi Proyek

**Versi dokumen:** 2026-06-11  
**Versi aplikasi:** `1.0.14` (lihat `package.json`)  
**Status:** Produksi internal — desktop **Windows, macOS, Linux** (installer + auto-update multi-platform)  
**Rilis CI:** [docs/RELEASE-CI.md](./docs/RELEASE-CI.md) — workflow **Release multi-platform** (`.exe`, `.dmg`/`.zip`, `.AppImage`)

---

## 1. Ringkasan

**Resource Management** (brand UI: *Backend Operation* — `src/config/navigation.ts`) adalah aplikasi **desktop Electron (Windows, macOS, Linux)** untuk memantau dan mengoperasikan banyak akun **WhatsApp** dan **Telegram** per brand: login platform, sync grup, scraper, ticket/issue, dan export Excel.

| Aspek | Keterangan |
|--------|------------|
| **Pengguna** | Tim internal perusahaan saja — **bukan** produk dijual ke pihak luar |
| **Database** | Supabase (cloud), satu project organisasi |
| **Distribusi** | Installer per OS (`.exe` / `.dmg`+`.zip` / `.AppImage`) — lihat `RELEASE-CI.md` |
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

**Prinsip data:** Semua data bisnis (brand, akun, grup, ticket, session flag) di **Supabase**. **WhatsApp:** auth asli hanya di folder lokal `%APPDATA%\Resource Management\wa-sessions\` per PC; DB hanya flag `platform_sessions` + `localAuthClientId`. **Telegram:** session string di DB + sidecar di PC. Handoff operator/PC lain: **Clear Session** (tombol X di kolom Session Valid) → purge lokal + invalidate DB.

---

## 4. Konfigurasi & installer (kondisi 1.0.14)

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
npm run build:installer        # OS saat ini
npm run build:installer:win    # Windows eksplisit
```

**macOS / Linux** (build di mesin atau CI OS yang sama):

```bash
npm run build:installer:mac
npm run build:installer:linux
# atau: bash scripts/build-installer.sh mac
```

Output Windows: `release/Resource Management Setup x.y.z.exe`  
Output macOS: `release/*.dmg` + `release/*-arm64.zip` (zip = auto-update)  
Output Linux: `release/*.AppImage`  

CI: workflow **Release multi-platform** — job `build-win`, `build-mac`, `build-linux` → publish gabung ketiga artefak.

Rencana lengkap: [docs/PLAN-CROSS-PLATFORM-INSTALLERS.md](./docs/PLAN-CROSS-PLATFORM-INSTALLERS.md)

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
| **Developer / IT** | Naikkan `version` di `package.json` → `git push origin main` → GitHub Actions otomatis build + publish Release (Win/Mac/Linux). Opsional publish cepat Windows dari PC: `$env:GH_TOKEN = "ghp_..."` lalu `npm run publish:github`. |
| **Tim internal** | App cek GitHub ~12 detik setelah buka + tiap 4 jam → unduh → **Restart** |

`GH_TOKEN` di PowerShell = hanya untuk publish **lokal**. Push `main` tidak butuh token Anda di GitHub Secrets.

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

- Brand card + tabel akun (WA hijau / TG biru) — **9 kolom data**
- Kolom: Account, Brand, Status, Session, Groups, **On device**, **In brand**, Admin, Scraper, Action
- **Groups / Admin:** format `Y/X` (device vs standar brand)
- **On device:** total grup di device/daily (`groupsCurrent`)
- **In brand:** join di master brand (`joinedInMaster` / `groupsTotal`)
- **Session:** INVALID → Sync/Run langsung modal login; VALID → probe device lalu SYNC / RUN
- **Clear Session (X):** hover baris/kolom Session saat **Valid** → purge session lokal + `platform_sessions` invalid → badge Logout/Invalid; Sync berikutnya QR bersih (bukan stuck restore)
- Multi-akun per brand (slot kosong + Add)
- Remove akun dari slot → DELETE `messaging_accounts` (CASCADE) + purge WA lokal + **rebuild `groups_master`** dari daily akun tersisa
- **Group link:** modal 7 kolom (daily akun) atau admin vs master; export `RM-[nama akun]-YYYYMMDD.xlsx`
- Export: group links, semua akun, tickets (Excel)
- Auto-sync terjadwal (`useAutoAccountSync`)

### 6.2 Ticket monitoring

- Issue dari rekonsiliasi daily vs master brand (`reconcileTickets.ts`)
- **Kontrak bisnis:** login/logout session **bukan** ticket; hanya mismatch grup/admin, grup sampah, duplicate ID/nama
- **Group mismatch** (`daily_junk_group`): gap **daily > master** — semua baris **daily** yang `group_id`-nya tidak ada di master
- **Missing groups** (`missing_group`): gap **master > daily** — baris **master** yang belum ada di daily akun (kebalikan Group mismatch)
- **Duplicate Group ID:** `group_id` sama (HP & master), nama beda
- **Duplicate Name:** `group_id` beda (HP vs master), nama sama
- **Detail:** double-click kartu → tabel lengkap (Group ID, invite link, note); export Excel per issue atau semua issue terfilter
- **Auto-close:** issue hilang setelah scrape/sync → `resolveTickets` menutup baris open; kartu hilang dari UI
- Workflow: handle issue, modal proses ticket (migrasi 024–026)
- Realtime: `group_scrape_daily` + `scrape_runs` completed → reconcile akun → reload ticket
- **UI ticket (1.0.12):** angka kartu tab Ticket dari `buildTicketSummariesFromEngine` — sama engine dengan kolom Groups/Admin bookmark (`accountMasterDailyCompare`)
- **Modal Admin vs master (1.0.12):** daftar hanya grup master brand (denominator **X**); grup junk di device tidak masuk modal (lihat tab Ticket → Junk)

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
| **[docs/PLAN-CROSS-PLATFORM-INSTALLERS.md](./docs/PLAN-CROSS-PLATFORM-INSTALLERS.md)** | **Perencanaan installer Windows + macOS + Linux** (Fase 0–7) |
| **[docs/guides/documents/](./docs/guides/documents/)** | **Panduan user — PDF & Word (EN + 中文)** — bukan Markdown |
| [docs/guides/README.md](./docs/guides/README.md) | Cara bagikan ke tim |
| [docs/HANDBOOK.md](./docs/HANDBOOK.md) | Referensi internal (ID) |
| `docs/guides/_source/` | Sumber IT saja — jangan kirim ke user |
| [SUPABASE_RUNBOOK.md](./SUPABASE_RUNBOOK.md) | Urutan SQL wajib |
| [INSTALL-WINDOWS.md](./INSTALL-WINDOWS.md) | Panduan install singkat (Windows — produksi) |
| [INSTALL-MACOS.md](./INSTALL-MACOS.md) | Panduan install Mac (setelah rilis multi-platform) |
| [INSTALL-LINUX.md](./INSTALL-LINUX.md) | Panduan install Linux (setelah rilis multi-platform) |
| [README.md](./README.md) | Quick start developer |
| [.cursorrules](./.cursorrules) | Kontrak bisnis ticket & multi-akun untuk AI/dev |

---

## 14. Kontak & kepemilikan

- **Author (package.json):** Seva Irawan  
- **Product name (installer):** Resource Management  
- **AppId:** `com.resourcemanagement.app`

---

*Dokumen ini mencerminkan kondisi codebase per build **1.0.14**. Jika version atau alur berubah, perbarui bagian 4, 6, 9, dan nomor versi di header.*
