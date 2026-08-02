# Resource Management — Dokumen Resmi Proyek

**Versi dokumen:** 2026-07-29  
**Versi aplikasi:** `1.0.35` (lihat `package.json`)  
**Status:** Produksi internal — desktop **Windows, macOS, Linux** (installer + auto-update multi-platform)  
**Rilis CI:** [docs/RELEASE-CI.md](./docs/RELEASE-CI.md) — workflow **Release multi-platform** (`.exe`, `.dmg`/`.zip`, `.AppImage`)

---

## 1. Ringkasan

**Resource Management** (brand UI: *Backend Operation* — `src/config/navigation.ts`) adalah aplikasi **desktop Electron (Windows, macOS, Linux)** untuk memantau dan mengoperasikan banyak akun **WhatsApp** dan **Telegram** per brand: login platform, sync/scrape grup, Job Queue, KPI selisih grup/admin (in-memory), dan export Excel.

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
│  Group Monitoring (Account | Operations) · Login · Settings  │
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

**Prinsip data:** Semua data bisnis (brand, akun, grup, session flag) di **Supabase**. Issue/selisih grup = engine **in-memory** (bukan tabel ticket). **WhatsApp:** auth asli hanya di folder lokal `%APPDATA%\Resource Management\wa-sessions\` per PC; DB hanya flag `platform_sessions` + `localAuthClientId`. **Telegram:** session string di DB + sidecar di PC (bisa dipakai PC lain selama DB masih valid). Handoff operator: **Clear Session** (tombol X saat Valid) → WA purge disk + TG stop sidecar + invalidate DB.

---

## 4. Konfigurasi & installer (kondisi 1.0.35)

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

Runbook rilis multi-platform: [docs/RELEASE-CI.md](./docs/RELEASE-CI.md)

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

Tabs shell: **Account | Operations** saja (tidak ada tab Reporting / Ticket).

- Brand card + tabel akun (WA hijau / TG biru) — **10 kolom** (Card view)
- Kolom Card: Account, Role, Location, Session, **On device**, Junk, **In brand**, Admin, **Last update**, Action
- **In brand / Admin:** format `y/x` (join/admin vs standar brand)
- **On device:** total grup di device/daily (`groupsCurrent`)
- **Last update:** read-only (timestamp / progress / “Use Sync…”); scrape penuh hanya lewat **Sync → Scrape now** (tidak ada tombol Run)
- **Session:** INVALID → Sync langsung modal login; VALID → probe device (**20s**, retry busy) lalu Sync (+ prompt Scrape now/Later). Device **busy** (Chrome/scrape lain) → alert, **bukan** modal login palsu. Resolve session selalu **`messaging_accounts.id` baris grid** (`accountSessionResolve.ts`), bukan label global.
- **Clear Session (X):** hover baris/kolom Session saat **Valid** → purge session lokal + `platform_sessions` invalid → badge Logout/Invalid; Sync berikutnya QR bersih (bukan stuck restore)
- Multi-akun per brand (slot kosong + Add)
- Remove akun dari slot → DELETE `messaging_accounts` (CASCADE) + purge WA lokal + **rebuild `groups_master`** dari daily akun tersisa
- **Group link:** modal 7 kolom (daily akun) atau admin vs master; export `RM-[nama akun]-YYYYMMDD.xlsx`
- Export: group links, semua akun (Excel) — **bukan** tickets
- **Stock chips** di header brand Account; auto scrape terjadwal (`useAutoAccountSync` + Settings)

### 6.2 Issue & metrik (KPI Account — bukan fitur Ticket)

- **Bukan** modul Ticket first-class: tidak ada tab Ticket, tidak ada tabel `resource_management_ticket_*`, tidak ada `reconcileTickets` / `group_count_mismatch`.
- Selisih ditampilkan lewat badge **not aligned**, kolom In brand/Admin/Junk, KPI Account, dan Group matrix.
- Engine in-memory: `accountMasterDailyCompare.ts` → `computeAccountTicketBreakdown` (5 tipe per akun).
- **Kontrak bisnis:** login/logout session **bukan** issue; hanya mismatch grup/admin vs master brand.
- **daily_junk_group** (Group mismatch): gap daily > master — `group_id` di daily tidak ada di master.
- **missing_group**: gap master > daily — belum join grup master.
- **not_admin**, **duplicate_group_id**, **duplicate_group_name** — lihat `.cursorrules` §11.
- Realtime post-scrape: `patchAccountGridAfterDailyWrite` → patch grid + `scheduleMonitoringReload` (Group matrix + Operations).
- Modal **Admin vs master** / **Groups on account**: read-only dari Supabase (`fetchAccountGroupLinks`, `fetchAccountDailyGroupLinks`).
- **Group matrix:** `BrandMasterGroupsModal` dari badge grup header kartu (bukan tab Reporting).

### 6.3 Tab Operations (Job Queue)

Tab Operations langsung menampilkan **Job Queue** tanpa bookmark. Slicer shell hanya **Platform**; brand dan akun dipilih di form setup task. Antrian menjalankan otomasi device nyata (WA Puppeteer / TG sidecar):

| Action | Alur singkat |
|--------|----------------|
| `join_by_invite_link` | SETUP → queue dari master missing groups |
| `create_group` | SETUP modal (batch + **permission per job**) → runner baca `payload.createGroupSettings` |
| `set_group_photo` | Dari **VIEW** create job selesai → upload/select foto brand → queue follow-up |
| `set_admin` | SETUP super-admin targets |
| `exit_delete_group` | Leave SETUP → setelah leave selesai auto-enqueue delete (grup left); VIEW untuk retry |

**Create group permission (1.0.28):**

- **Settings → Worker settings** = **default saja** (localStorage, Save).
- **Modal SETUP** = custom **per job**; perubahan modal **tidak** menulis balik ke Settings.
- Saat Queue: permission masuk **job payload** via `buildCreateGroupEnqueueFromJobDraft()` — runner Electron/TG hanya baca payload. Export shape TG: `toTelegramWorkerConfigShape()` (bukan “Learning”).

**Set photo (1.0.28):**

- Grup dari `groupOutcomes` create job (VIEW Result).
- Foto brand `{brand}.jpg` via IPC `brandGroupPhoto`.
- Remark kolom queue + lock tab Set Photo: satu modul `createSetPhotoFlow.ts` (`createJobHasSetPhotoFollowUp`).

**Job Queue batch stability (1.0.30+):**

- Antrian besar (mis. 100 grup) **auto-split** saat Queue menjadi beberapa job **≤30 grup** per baris tabel (`maxPerRun` dari Settings → Invite by link).
- Satu akun = **1 slot Chrome**; chunk job **antri berurutan** (FIFO), bukan paralel — slot lain tetap tersedia untuk akun B/C/D.
- Settle **15s** antar chunk (`POST_JOB_SETTLE_MS`); stale sweep **90 menit** (`STALE_RUNNING_MS`).
- **Join missing:** drop zone CSV/XLSX + accordion master list; **VIEW** join menampilkan status/remark per grup; **Run** retry hanya yang failed.
- `create_group` tetap **1 job** dengan slice internal + pause 45–65 menit antar slice (ban safety).

Validasi: `npm run validate:operations-job-queue`, `npm run validate:real-operations-data`.

### 6.4 Group matrix (dari Account card)

Tab **Reporting** UI shell sudah dihapus. Entry: klik **xxx Group** di header brand card Account.

- Scope: brand + platform card itu (bukan slicer global)
- Matrix **semua Acc** platform tersebut — tanpa filter Acc Name (per-akun sudah di baris card)
- Bookmark **Full Group** / **Full Admin** (join vs admin Yes/No)
- Filter kolom akun (Yes/No/All) di header kolom Acc
- Data: `loadJoinGroupMatrix` — `groups_master` × daily terbaru (`dedupeDailyRowsByGroupIdKeepLatest`)
- Realtime: event `rm-reporting-reload` setelah scrape / master / daily (debounce 500 ms)

Komponen: `BrandMasterGroupsModal` → `ReportingJoinMatrixTable`.

### 6.5 Settings (`/settings`)

Halaman primer untuk preferensi & worker. Route `/admin` **redirect ke** `/settings`.

- Language, cek update, buka folder config (IT)
- **Automatic account scrape:** On Scheduled + Scrape Now (default Scheduled On, Scrape Now Off, jam **12:00 PM**, brand FWSG/JMMY/M24SG/SBMY/STMY/WBSG); Save/Cancel saat Scrape Now Off; Execute/Discard saat On; setelah Execute → factory reset; Scrape Now On → Status standby / Time "-"
- **Worker platform settings** (WA/TG): delay, create-group defaults, invite throttle — lihat `docs/WORKER-PLATFORM-SETTINGS.md`
- Validasi terkait: `npm run validate:auto-scrape`, `npm run validate:worker-platform-settings`

---

## 7. Multi-akun (100+ WA & Telegram)

| Platform | Kunci device | Batasan |
|----------|--------------|---------|
| WhatsApp | `resolveDeviceSessionId()` → LocalAuth `clientId` / folder `wa-sessions/session-{id}` | Lock per session; user pool max **10** Chrome; auto scrape brand slots max **6** (terpisah); TG user/auto kuota sendiri; **device key = UUID baris grid** |
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

`public.users` — existing, tidak dibuat migrasi RM.

**Catatan:** Tabel `resource_management_ticket_*` **dihapus** migrasi **033** (rilis 1.0.24). Issue hanya engine in-memory + KPI UI.

### 8.2 Urutan migrasi SQL

**DB baru:** `003` → `017` → `020` → `023` → `024` → `025` → `026`  

**DB production lama:** ikuti **SUPABASE_RUNBOOK.md** (jangan ulang `017`).

Detail: `supabase/migrations/README.md`

### 8.3 Apa yang auto-sync ke app terbuka

| Perubahan di DB | Dampak di app |
|-----------------|---------------|
| Scrape run, snapshot, daily, master | Patch grid metrik + **Group matrix** + Operations reload (debounce ~500 ms) |
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
  lib/                  Supabase, sync, scrape, issue engine
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
| `npm run validate:pre-release` | Gate lengkap sebelum publish (desktop + typecheck) |
| `npm run validate:auto-scrape` | Kontrak Automatic account scrape (Settings) |
| `npm run validate:worker-platform-settings` | Worker WA/TG + `toTelegramWorkerConfigShape` |
| `npm run validate:real-operations-data` | Data device nyata scrape/operations |
| `node scripts/validate-reporting-matrix.mjs` | Group matrix Acc=All (Account header) + filter kolom |
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
| **[docs/RELEASE-CI.md](./docs/RELEASE-CI.md)** | **Rilis multi-platform** (Win / Mac / Linux) + status installer Completed |
| **[docs/guides/documents/](./docs/guides/documents/)** | **Panduan user — PDF & Word (EN + 中文)** — bukan Markdown |
| [docs/guides/README.md](./docs/guides/README.md) | Cara bagikan ke tim |
| [docs/HANDBOOK.md](./docs/HANDBOOK.md) | Referensi internal (ID) |
| `docs/guides/_source/` | Sumber IT saja — jangan kirim ke user |
| [SUPABASE_RUNBOOK.md](./SUPABASE_RUNBOOK.md) | Urutan SQL wajib |
| [INSTALL-WINDOWS.md](./INSTALL-WINDOWS.md) | Panduan install singkat (Windows — produksi) |
| [INSTALL-MACOS.md](./INSTALL-MACOS.md) | Panduan install Mac (setelah rilis multi-platform) |
| [INSTALL-LINUX.md](./INSTALL-LINUX.md) | Panduan install Linux (setelah rilis multi-platform) |
| [README.md](./README.md) | Quick start developer |
| [docs/PANDUAN-PENGGUNA-SIMPLE.md](./docs/PANDUAN-PENGGUNA-SIMPLE.md) | **Panduan Group Monitoring** — tim R&M (operasional) |
| [.cursorrules](./.cursorrules) | Kontrak bisnis ticket & multi-akun untuk AI/dev |

---

## 14. Kontak & kepemilikan

- **Author (package.json):** Seva Irawan  
- **Product name (installer):** Resource Management  
- **AppId:** `com.resourcemanagement.app`

---

*Dokumen ini mencerminkan kondisi codebase per build **1.0.35**. Join Missing CSV/XLSX hybrid; Job Queue setup 100/page + scroll; TG scrape left/migrated + `TG_SESSION_DEAD`; leave/delete outcomes + set photo basic Chat; Job Queue basic Chat + Channel; AuthKeyDuplicated → re-login; filter Super Group di Group matrix; Sync↔Job saling blokir dua arah; scrape WA hanya grup yang masih di akun; tulis DB lewat RPC `rm_commit_account_scrape` atomik (+ `is_owner` daily, migrasi **039**); PK master `(brand, platform, group_id)` — migrasi **036** di Supabase; Job Queue batch split 30 grup per job + status partial = Failed; Automatic account scrape kontrak UI factory reset.*
