# REPO-SNAPSHOT — Potret isi repo (untuk sesi Claude)

> **Snapshot dari commit:** `f0bc642` (main) · **Versi app:** `1.0.37` · **Dibuat:** 2026-10-28
>
> Cara pakai: baca file ini dulu, lalu cek perubahan sejak snapshot:
> `git log --oneline f0bc642..HEAD --stat` → baca hanya file yang berubah, laporkan bagian snapshot yang usang.
> Snapshot = **peta**, bukan sumber kebenaran. Untuk mengerjakan tugas tetap baca kode asli.
> Hierarki: kode + config > `logic_sync_scraper.txt` / `sessionColumnFlowSpec.ts` > dokumen ini > `docs/PROJECT-MASTER-REFERENCE.md` > `PROJECT.md` / `HANDBOOK.md`.
>
> **Wajib update** file ini (termasuk baris "Snapshot dari commit") di commit yang sama setiap kali perilaku/struktur kode berubah.

---

## 1. Produk & stack

- Desktop **Electron 36** + **React 19 / TypeScript / Vite 6 / Tailwind v4**; rilis Windows (NSIS), macOS (DMG+ZIP), Linux (AppImage); auto-update `electron-updater` dari GitHub Releases. Product name `Resource Management`, brand sidebar `Backend Operation` (`src/config/navigation.ts`).
- Pengguna: tim internal. Multi-brand, multi-akun (100+ akun WA/TG).
- **WhatsApp:** `whatsapp-web.js` + Puppeteer/Chrome di main process.
- **Telegram:** sidecar Python **Telethon + FastAPI** di `127.0.0.1:8765` (`electron/main/platformLogin/telegramSidecar.ts:10-14`, `python-sidecar/main.py:349`), versi sidecar **14** (TS dan Python harus sama).
- **Database:** Supabase (Postgres + Realtime + Storage). Edge function `telegram-sheets-sync` (Google Sheets).

## 2. Peta folder

| Folder | Isi |
|---|---|
| `electron/main/platformLogin/` | Login WA (`whatsapp.ts`), lifecycle sidecar TG (`telegramSidecar.ts`), pool Chrome |
| `electron/main/scraper/` | Scrape WA/TG, checkpoint, watchdog, cancel registry, lane auto |
| `electron/main/automation/` | Job Queue (store, runner, slot pool) + operasi WA; client TG automation |
| `electron/preload/index.ts` | `contextBridge` → `window.electronAPI` (app, platform-login, scraper, jobQueue, brandGroupPhoto, executeSlots) |
| `python-sidecar/` | `main.py` (endpoint), `telegram_login.py`, `telegram_scraper.py`, `telegram_automation.py`, `telegram_{leave,delete,set_group_photo}*.py`, `telegram_human_delay.py` |
| `src/` | UI React: `pages/`, `providers/GroupMonitoringProvider.tsx`, `hooks/`, `services/`, `lib/` (engine & data), `config/` |
| `supabase/migrations/` | Skema & RPC (003, 017–040; nomor bolong ada) |
| `scripts/` | Build installer, validator `validate-*.mjs`, audit |
| `.github/workflows/` | `release-multiplatform.yml` (+ 2 workflow repair manual) |
| `docs/` | Dokumen proyek, panduan user (PDF/DOCX EN+ZH) |

## 3. Autentikasi & hak akses

- Login app: SELECT `public.users` dengan `username` + `password` **plaintext** (`src/lib/auth.ts`), sesi di localStorage `rm-auth`. Bukan Supabase Auth.
- Role app hanya `admin` | `operator`: admin = username persis `admin` (`src/lib/userRole.ts`). Semua kapabilitas (`canManageStructure`, `canOperatePlatform`, `canAutoSync`, `canAdminSettings`) = isAdmin. Operator melihat data milik user admin (`src/lib/monitoringDataUser.ts`).
- "Master / GCS" = **role operasional per akun** (`src/config/accountOpsRole.ts`, disimpan di `messaging_accounts.metadata`), dipakai menggating Create Group — bukan role login.
- Klien Supabase di renderer memakai **service role key** jika ada (`src/lib/supabaseEnvKey.ts`), dari IPC `app:get-config`; key ikut terbundel di installer via `resources/org-default.env` (`scripts/build-installer.mjs`).

## 4. Login platform

**WhatsApp** (`electron/main/platformLogin/whatsapp.ts`)
- `LocalAuth({ clientId: sessionId, dataPath: userData/wa-sessions })` → folder `wa-sessions/session-{id}` per akun. Auth asli hanya di disk PC; DB hanya flag session (`rm_save_platform_session`, `session_type='whatsapp_local_auth'`).
- QR (auto-regenerate) atau pairing code nomor HP. Lock per `sessionId` (promise chain).
- Pool Chrome: user **10**, auto-scrape **6** per platform (`src/config/deviceConcurrencyPolicy.ts`, env `RM_WA_MAX_CONCURRENT_BROWSERS`). Pool hanya membungkus `client.initialize()`.
- Probe session: `getState()` client hidup, atau cold-boot dari disk sampai CONNECTED/unlinked.

**Telegram** (`telegramSidecar.ts`, `python-sidecar/telegram_login.py`)
- Sidecar di-spawn Electron (binary PyInstaller saat packaged, `python` saat dev). Anti-orphan: kill proses di port 8765 bila bukan milik app / versi beda.
- QR login (`/telegram/login/qr/start`), phone + code + 2FA. Poll status 300 ms. Session string disimpan di DB (`telethon_string`); di sidecar disimpan di memori `SESSIONS[session_id]` (key = UUID akun).
- `AuthKeyDuplicated` → re-login (`TG_AUTH_KEY_DUPLICATED`).

## 5. Sync & Scrape (alur utama Account tab)

- Spec: `logic_sync_scraper.txt`, `.cursor/rules/rm-sync-scraper-flow.mdc`. Orkestrator `src/hooks/useAccountSyncFlow.ts` → `services/syncFlowService.ts` / `scrapeFlowService.ts` → `lib/runAccountScraper.ts` → IPC `scraper:run` / `scraper:run-auto`.
- Session INVALID + Sync → modal login. VALID + Sync → probe device (busy → alert, bukan login palsu) → modal **Scrape Now | Later**. Tidak ada tombol Run di grid.
- **WA scrape** (`electron/main/scraper/whatsappScrape.ts`): tunggu store + inbox stabil → fase 1 metadata paralel (pool) → fase 2 invite link **serial** khusus grup admin. Checkpoint `userData/scrape-checkpoints/{id}.json` (maks 24 jam). Cap 6000 grup. Gagal lengkap (<85%) → `SCRAPER_INCOMPLETE`. Watchdog idle → `SCRAPER_IDLE_STUCK`.
- **TG scrape** (`python-sidecar/telegram_scraper.py`): `GetDialogsRequest` paginasi sendiri; skip shell `migrated_to`/deactivated; invite: username → exported_invite → `getExportedChatInvites` → `ExportChatInvite` terakhir. Hasil `partial:true` ditolak Electron (`SCRAPER_PARTIAL_RESULT`, `telegramScrape.ts:408`).
- **Tulis DB:** `writeScrapeDailyRows` (`src/lib/accountScraper.ts`) → RPC **`rm_commit_account_scrape`** atomik: DELETE daily akun → INSERT daily → DELETE + rebuild `groups_master` brand+platform.
- **Master gate (migrasi 040):** per `group_id`, `bool_or(is_admin='yes') AND bool_or(invite valid)` — boleh dari akun/baris berbeda.
- Clear Session (X di kolom Session): purge WA disk / release TG + invalidate DB; daily tetap.

## 6. Engine issue & metrik (in-memory)

- `src/lib/accountMasterDailyCompare.ts` → `computeAccountTicketBreakdown`, 5 tipe: `daily_junk_group`, `missing_group`, `not_admin`, `duplicate_group_id`, `duplicate_group_name`. Tidak ada tabel ticket (dihapus migrasi 033/034).
- UI grid hanya menampilkan Junk / Missing / Not admin (+ On device). Dua tipe duplicate dihitung tapi tidak dipakai UI.
- Realtime (`src/hooks/useRealtimeMonitoring.ts`): snapshots, brands, messaging_accounts, scrape_runs, groups_master, group_scrape_daily, new_register → patch grid + `rm-reporting-reload` (Group matrix `BrandMasterGroupsModal`). Session: `useRealtimeAccountSessions.ts`.

## 7. Job Queue (tab Operations)

- **Penyimpanan lokal:** `userData/automation-job-queue.json` (`electron/main/automation/jobQueueStore.ts:83`) — **bukan** Supabase; per PC. Job `running` saat load → `queued`.
- Aksi: `create_group`, `set_group_photo`, `set_admin`, `join_by_invite_link`, `leave_group`, `delete_group` (`exit_delete_group` legacy, enqueue diblok).
- Status: `queued|running|completed|failed|cancelled` (+ flag paused). Batch parsial → `failed` dengan error `PARTIAL_BATCH`; UI membedakan Partial vs Failed. Outcome per grup di `payload.groupOutcomes`.
- Concurrency: 10 slot/platform, **1 job per akun** (`executeSlotPool.ts`); settle 15 s antar job (`jobQueueSettle.ts`); stale 90 menit (`jobQueueRunner.ts:48`); watchdog interval runner.
- Rantai otomatis: create → set photo (`autoEnqueueSetPhotoFromCreate.ts`), leave → delete (`autoEnqueueDeleteFromExit.ts`), chunk 30. Delete selalu `requireOwnerForDelete:false` (hapus chat lokal, bukan bubarkan grup).
- Payload dibangun di renderer `src/hooks/useJobQueueSetupEnqueue.ts`; delay/worker settings dari localStorage.

| Operasi | WhatsApp | Telegram (sidecar) |
|---|---|---|
| Join | `client.acceptInvite`, jeda 30–60 s (+ jeda panjang tiap 10) | `ImportChatInviteRequest` / `JoinChannelRequest` |
| Create | `client.createGroup` + set property + invite link | `CreateChannelRequest(megagroup)` + export invite |
| Set admin | `promoteParticipants` | `EditAdminRequest` / `EditChatAdminRequest` |
| Set photo | `setPicture` (foto brand dari Storage `brand-group-photos`) | `EditPhotoRequest` |
| Leave | `sendExitGroup` | `LeaveChannelRequest` / `DeleteChatUserRequest` |
| Delete | `sendDeleteChat` (lokal) | `delete_dialog` (atau dissolve bila owner & require_owner) |

## 8. Settings & auto scrape

- Semua setting di **localStorage per PC** (worker WA/TG `rm_worker_settings_*`, auto-scrape `rm_auto_scrape_*`, stock policy) — tidak tersimpan di DB.
- Auto scrape: `src/hooks/useAutoAccountSync.ts`, admin saja, maks sekali per hari lokal, lane auto terpisah (pool 6).

## 9. Supabase

- Tabel (`src/config/tables.ts`): `users`, `resource_management_{brands, messaging_accounts, platform_sessions, platform_session_logs, sync_activity_logs, scrape_runs, group_scrape_daily, groups_master, account_snapshots}`, `new_register`.
- PK `groups_master` = `(brand, platform, group_id)` (migrasi 036). Daily punya kolom `is_owner` (039).
- RPC dipakai app: `rm_commit_account_scrape`, `rm_rebuild_brand_groups_master` (hanya saat hapus akun), `rm_save_platform_session`, `rm_deactivate_platform_sessions`, `rm_log_session_activity`. Definisi terbaru scrape/master: migrasi **040**.
- RLS aktif tapi policy `USING (true)` untuk anon/authenticated.
- `SUPABASE_RUNBOOK.md` & `supabase/migrations/README.md` hanya sampai migrasi **036** (037–040 belum tercatat).

## 10. Build, CI, validator

- CI `release-multiplatform.yml`: push ke `main` pada path `package.json`, `src/**`, `electron/**`, `scripts/**`, `resources/**`, workflow; rilis hanya jika tag `v<version>` belum ada (artinya saat version naik). Secret `ORG_ENV_FILE`. Tidak ada CI untuk PR.
- Validator `npm run validate:*`: mayoritas **statis** (cek string di source/SQL). `validate:grid-db-live` mengakses DB live (read-only). `validate:desktop` = gate utama; `validate:pre-release` = gate lengkap + typecheck.
- Audit `npm run validate:master-reference` saat snapshot dibuat: **1 check FAIL** (`column count not 9`).

## 11. Temuan terverifikasi (belum diperbaiki — bukan perintah)

1. `buildTicketSummariesFromEngine.ts` tidak ada, masih dirujuk `docs/PROJECT-MASTER-REFERENCE.md` (baris 522, 537, 722).
2. Runbook/README migrasi berhenti di 036.
3. Tanggal scrape ditulis UTC (`accountScraper.ts:228`) tapi cek "daily hari ini" pakai tanggal lokal (`accountMonitoringEngine.ts` `todayScrapeDate`).
4. Service role key di renderer + terbundel installer; password `users` plaintext.
5. Lock automation per akun berhenti menunggu setelah 90 s lalu tetap jalan (`automationAccountLock.ts`).
6. `jobQueue:cancel` melepas execute slot walau kerja lama mungkin masih jalan (`electron/main/automation/index.ts:79`, disengaja per komentar).
7. Operasi WA (`waAutomation.ts`) tidak menyimpan outcome per grup di tengah batch (TG menyimpan).
8. `isRetryableNetworkError` menganggap `timeout`/`abort`/`not found` retryable (`electron/main/lib/networkRetry.ts`) — berpotensi mengulang aksi non-idempoten.
9. Recovery create TG mencocokkan judul grup di 40 dialog terakhir (`telegram_automation.py` `_find_recent_group_by_title`) — bisa salah ambil grup lama bernama sama.
10. `scraper:cancel` (manual) selalu memanggil cancel sidecar TG untuk session yang sama dengan lane auto (`electron/main/scraper/index.ts`).
11. Auto-update `quitAndInstall` tanpa cek job berjalan (`electron/main/autoUpdate.ts:80,209`).
12. Sidecar FastAPI tanpa auth, CORS `*` (`python-sidecar/main.py:69`).
