# TG-SNAPSHOT — Potret lengkap Telegram di GM Apps

| Versi | Tanggal | Snapshot dari commit | Sumber |
|---|---|---|---|
| **v1.1** | 2026-11-06 | `24d2764` (main) · app `1.0.37` · sidecar v14 | 5 subagent scan end-to-end + verifikasi ulang kode, Telethon 1.45 & data Supabase + audit independen (v1.1) |

**Cara pakai:** baca file ini sebelum menganalisis apa pun soal Telegram. Lalu cek perubahan sejak snapshot:
`git log --oneline 24d2764..HEAD --stat -- python-sidecar electron/main/platformLogin electron/main/scraper electron/main/automation src supabase`
→ baca hanya file yang berubah. File ini **peta**, bukan pengganti kode.

**Aturan update:** perubahan perilaku/struktur kode TG → perbarui bagian terkait + naikkan versi + isi Changelog di commit yang sama.

**Temuan & rekomendasi:** lihat [`TG-FINDINGS.md`](./TG-FINDINGS.md). Pasangan WhatsApp: [`WA-SNAPSHOT.md`](./WA-SNAPSHOT.md).

---

## 1. Versi & arsitektur

| Komponen | Versi / nilai | Sumber |
|---|---|---|
| Telethon | `>=1.36.0` (tanpa batas atas, tanpa lockfile) | `python-sidecar/requirements.txt` |
| FastAPI / uvicorn | `>=0.115.0` / `>=0.32.0` | requirements.txt |
| Python (CI) | 3.12 | `release-multiplatform.yml:87-89` |
| PyInstaller | tidak dipin (versi terbaru saat build), `--onefile` | `scripts/build-telegram-sidecar.mjs:73-106` |
| Sidecar API | **versi 14** (TS & Python harus sama) | `telegramSidecar.ts:14`, `main.py:183` |
| Alamat | `127.0.0.1:8765` (tetap, tidak bisa diubah env) | `telegramSidecar.ts:10-12`, `main.py:349` |

```
Renderer (React)                     Electron main                              Python sidecar (1 proses untuk SEMUA akun TG)
useAccountSyncFlow / Job Queue  ──▶  telegramSidecar.ts (spawn, health, kill)  ──HTTP──▶ main.py (FastAPI)
runAccountScraper                    telegramScrape.ts (start + poll result)              telegram_login.py   (SESSIONS, lock)
                                     tgAutomationClient.ts (Job Queue)                    telegram_scraper.py (scrape)
                                                                                          telegram_automation.py, _leave/_delete/_set_group_photo
Supabase: platform_sessions.session_data = Telethon StringSession (teks biasa), daily, master, scrape_runs
```

Prinsip: **session TG tersimpan di Supabase** (portabel antar PC). Sidecar menyimpan client Telethon di memori `SESSIONS[account_uuid]`; restart sidecar menghapus semua session di memori.

---

## 2. Peta file TG

| Lapisan | File | Isi |
|---|---|---|
| Electron | `platformLogin/telegramSidecar.ts` | Spawn sidecar (binary terbundel / `python` saat dev), `ensureSidecarRunning` (health 1,2 s → reuse jika milik app & versi cocok, selain itu kill port 8765 lalu spawn; tunggu sehat 25 s), polling login 300 ms, `shutdownSidecar` |
| Electron | `platformLogin/tgExecuteSlots.ts`, `index.ts`, `restore.ts` | Slot TG (10), IPC login, restore session |
| Electron | `scraper/telegramScrape.ts`, `telegramScrapeSessionLock.ts` | Restore → start scrape → poll result; tolak `partial`; lock per session |
| Electron | `scraper/index.ts`, `validateSession.ts`, `autoScrapeLane.ts` | IPC run/cancel/validate, lane auto (6) |
| Electron | `automation/tgAutomationClient.ts`, `lib/networkRetry.ts` | Job Queue TG, retry jaringan |
| Python | `main.py` | Endpoint, CORS `*`, handler error → HTTP 200 `{status:error}` |
| Python | `telegram_login.py` | `SESSIONS`, `tg_session_lock`, QR / phone / code / 2FA, export/restore session |
| Python | `telegram_scraper.py` | Discovery dialog, role, invite link, checkpoint, validate |
| Python | `telegram_automation.py`, `telegram_leave_group.py`, `telegram_delete_group.py`, `telegram_set_group_photo.py`, `telegram_human_delay.py` | Aksi Job Queue & aturan jeda/FloodWait |
| Renderer | `usePlatformLogin.ts`, `PlatformLoginModal.tsx`, `platformSessions.ts`, `persistLoginSession.ts`, `platformSessionSync.ts`, `warmPlatformSession.ts`, `runAccountScraper.ts`, `scrapeErrorUi.ts`, `telegramGroupKind.ts` | Login UI, simpan/muat session, scrape, error, label Super Group |
| Supabase | `functions/telegram-sheets-sync` | Sinkron Google Sheets JMMY/STMY |

---

## 3. Sidecar lifecycle

- **Spawn:** packaged → `resources/sidecar/rm-telegram-sidecar(.exe)`; dev → `py -3` / `python3 python-sidecar/main.py` (`telegramSidecar.ts:40-58`).
- **Env:** seluruh `process.env` Electron + `RM_ENV_FILE=userData/.env` diteruskan (`:61-67`). `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` dibaca Python dari env (`telegram_login.py:156-157`), asalnya `org-default.env` yang ikut installer.
- **`ensureSidecarRunning`** (`:158-229`): dipanggil oleh `postJson` (login), tiap tick polling status login, restore/export/start scrape, automation, dan validate — **tidak** oleh polling progress/result scrape maupun cancel. Pemanggil bersamaan **berbagi satu proses start** (`sidecarStarting`) → jika start gagal (tidak sehat dalam 25 s → `Telegram sidecar failed to start`, `:97`), semua pemanggil ikut gagal. Tunggu sehat dibungkus `withNetworkRetry` tetapi pesan itu tidak termasuk pola retry, jadi efektif satu percobaan 25 s (`:217`). Versi tidak cocok setelah start → `API version mismatch` (`:219-222`).
- **Kapan port di-kill:** hanya jika `/health` **menjawab** dalam 1,2 s tetapi versi beda atau proses bukan milik app. Jika `/health` tidak menjawab (proses macet/sibuk), error ditelan lalu langsung spawn **tanpa** kill — proses macet tetap memegang port 8765 sehingga spawn baru gagal (`:166-195`).
- **Handler `exit`** mengosongkan `sidecarStarting` tanpa cek child mana yang keluar (`:212-215`) → child yang langsung mati bisa membuka jalan spawn ganda.
- **Kill orphan:** Windows `Get-NetTCPConnection -LocalPort 8765 | Stop-Process -Force`; mac/Linux `lsof -ti:8765 | xargs kill -9` (`:125-130`) — membunuh proses apa pun di port itu.
- **Quit:** `before-quit` → `shutdownSidecar` (kill child + kill port) (`:558-575`).
- **Restart paksa:** hanya dari validate saat error transport/timeout (`validateSession.ts:73-76`) — mematikan sidecar bersama semua akun.

---

## 4. Session & login

- **Kunci:** `SESSIONS[session_id]`, `session_id` = UUID `messaging_accounts.id` (`deviceSessionId.ts:16`).
- **Supabase:** `resource_management_platform_sessions`, `session_type='telethon_string'`, `session_data` = StringSession **teks biasa**, simpan via RPC `rm_save_platform_session`.
- **Pindah PC:** PC B memuat string dari DB → `restore`. PC A tidak diberi tahu; dua PC memakai key yang sama bisa memicu `AUTH_KEY_DUPLICATED`.
- **QR:** `qr/start` (dalam lock) → `qr_login()` → `wait()` maks 180 s. QR diperbarui jika umur ≥ 25 s lewat `recreate()` (`telegram_login.py:374-388`). Finalize: `is_user_authorized` → `get_me` → `ready` / `need_2fa`.
- **Phone:** `phone/start` (tanpa lock) → `send_code_request` → `code` → `2fa` (dalam lock).
- **Polling login (Electron):** `setInterval` 300 ms, fetch timeout 30 s, berhenti pada ready / need_code / need_2fa / error non-retry / 8 error **yang dilempar** beruntun (`telegramSidecar.ts:368-408`). Balasan `{status:'error'}` dengan pesan retryable tidak dilempar dan mereset hitungan → polling bisa berjalan tanpa batas (`:358-363, 376`).
- **Export/restore:** export (dalam lock) `session.save()` lalu cek hidup; hanya auth-key-dead yang membatalkan. Restore memakai ulang client jika string sama.
- **Clear Session:** batalkan scrape → `/cancel` → nonaktifkan baris DB. **Tidak memanggil `log_out()`**; key tetap berlaku di server Telegram.

**Lock `tg_session_lock` (per session):** dipakai `qr/start`, `code`, `2fa`, export, restore, scrape (`_collect_groups`), semua aksi automation. **Tidak dikunci:** `phone/start`, status poll, `/cancel`, cek hidup di validate.

---

## 5. Pipeline scrape

**Electron** (`telegramScrape.ts`): ensure sidecar → restore session (timeout 300 s, retry 3×, heartbeat 15 s) → `POST /telegram/scrape/{id}` (timeout 180 s) → poll progress 400 ms & result 500 ms (240× `idle` → `SCRAPER_TG_CONNECT_FAILED`) → `partial:true` ditolak `SCRAPER_PARTIAL_RESULT`. Error berisi kata "session" → restore + scrape ulang sekali. Watchdog idle selalu skala 6000 grup = **~36,6 menit**.

**Sidecar** (`telegram_scraper.py`):
| Langkah | Detail | Rujukan |
|---|---|---|
| Restore/reuse | Pakai client `ready` yang ada; restore hanya jika belum ada/tidak ready | `:1546-1580` |
| Cek akun | `is_user_authorized`, `get_me`, cocok nomor → `TG_ACCOUNT_MISMATCH` | `:964-971` |
| Discovery | `GetDialogsRequest` 100/halaman (bukan `iter_dialogs`); FloodWait > 120 s → `SCRAPER_DISCOVERY_FLOODWAIT`; macet → `SCRAPER_DISCOVERY_STALLED` | `:449-629` |
| Filter | buang `left`, Chat `migrated_to`, Chat `deactivated`; ambil grup & megagroup (channel broadcast dibuang); cap 6000 | `:323-342, 1004` |
| Per grup | jeda 1,5 s ±35%; upgrade basic chat → supergroup; member count; role (flag entity → `get_permissions` → GetParticipant → scan admin); hitung admin | `:1060-1283` |
| Invite link | username → `exported_invite` → (admin) `GetExportedChatInvites` → `ExportChatInviteRequest` (**membuat link baru**, jalan terakhir) | `:812-876` |
| Checkpoint | tiap 25 grup, `partial:true` | `:1272-1283` |
| Gagal role | unverified ≥ semua grup atau > max(25, n/5) → `SCRAPER_UNVERIFIED_ROLES` | `:1379-1396` |

FloodWait scrape: tidur otomatis maks 120 s (+5 s). Tidak ada env var di scraper; semua jeda hard-coded.

---

## 6. Penulisan ke DB

- Sama dengan WA: `writeScrapeDailyRows` → RPC `rm_commit_account_scrape` (040) → hapus daily akun → insert → bangun ulang master brand+platform. Gate master: ≥1 admin **dan** ≥1 invite valid per `group_id`.
- **Invite valid (TG):** `^https?://(t\.me|telegram\.me)/[A-Za-z0-9_+/=-]+$`.
- Session string disimpan ulang setelah scrape (sukses maupun gagal non-cancel). Setiap restore membuat session dengan `mode="qr"` (`telegram_login.py:733, 750`) dan scrape mengembalikan `loginMethod = session.mode` (`telegram_scraper.py:1438`) → akun yang login via phone tersimpan ulang sebagai `qr`.
- Basic chat yang di-upgrade ke supergroup mendapat ID baru `-100…`; ID lama & baru dianggap grup berbeda di engine (Junk/Missing).
- **Edge function `telegram-sheets-sync`:** dipicu webhook DB (konfigurasi di Dashboard), tanpa auth (`verify_jwt=false`), daftar akun JMMY/STMY hard-coded, menulis tab Full Group / Full Admin / Junk ke Google Sheets, kolom Remark dipertahankan.

---

## 7. Job Queue — aksi Telegram

Electron `tgAutomationClient.ts` → `POST /telegram/automation/{aksi}/{session}`. Timeout default 600 s, minimal 60 s; create 20 menit; join 120 s per request (`:40, 185, 754`). `withNetworkRetry` (3×) kecuali create & join.

| Aksi | Panggilan Telethon | Catatan |
|---|---|---|
| Join | `ImportChatInviteRequest` / `JoinChannelRequest` | Jeda join di Electron; FloodWait > 60 s dikembalikan ke Electron (tidur ≤900 s, ulang 1×); outcome disimpan per grup |
| Create | `CreateChannelRequest(megagroup=True)` → (opsional) `TogglePreHistoryHiddenRequest` → export invite | Jeda after-create dibatasi **15 s** di sidecar; gagal respons → cari grup berjudul sama di 40 dialog terakhir |
| Set admin | `EditAdminRequest` (supergroup) / `EditChatAdminRequest` (basic) | Maks 5 target; sukses jika ≥1 target; outcome hanya di akhir |
| Set foto | `upload_file` → `EditPhotoRequest` / `EditChatPhotoRequest` | Outcome hanya di akhir |
| Leave | `LeaveChannelRequest` / `DeleteChatUserRequest(me)` | `UserNotParticipant` = sudah keluar |
| Delete | `delete_dialog` (+ opsional `DeleteHistoryRequest`) | Sidecar **bisa** membubarkan grup (`DeleteChannelRequest`/`DeleteChatRequest`) jika `require_owner=true` (`telegram_delete_group.py:155-180`); setting UI default `true` dan jalur `exit_delete_group` meneruskannya (`tgAutomationClient.ts:380, 449`). Saat ini **tidak ada** jalur enqueue `exit_delete_group`, dan semua enqueue `delete_group` memaksa `false` → praktiknya hanya hapus dialog |

FloodWait automation: sidecar tidur otomatis sampai **7200 s** (+ `flood_wait_extra_sec`: default sidecar 5 s; dari setting UI default 90 s, create minimal 90 s) di dalam request (umumnya timeout 600 s), sambil memegang lock session. Join: FloodWait > 60 s dikembalikan ke Electron (`telegram_automation.py:979`).

---

## 8. Config, env, build, validator

| Env / tunable | Default | Catatan |
|---|---|---|
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | wajib | dari `org-default.env` installer → env proses |
| `RM_ENV_FILE` | `userData/.env` | diset Electron |
| `RM_TG_MAX_CONCURRENT_SLOTS` | 10 (1–10) | slot execute TG |
| `RM_SESSION_CHECK_TIMEOUT_MS` | 90 s | validate |
| Setting UI TG | localStorage `rm_worker_settings_telegram` | per PC; dikirim sebagai `delay` payload |

Validator TG (`validate:telegram-login`, `device-group-scale`, `real-operations-data`, `installer-package`, `cross-platform-build`) **semua cek teks statis**; tidak ada yang menjalankan sidecar atau menghubungi Telegram. Perubahan yang hanya di `python-sidecar/**` **tidak** memicu workflow rilis.

---

## 9. Data produksi (fakta dari Supabase)

**Scrape TG 26 Okt – 5 Nov 2026:** 157 run → **111 sukses (71%)** · 22 `running` tak selesai · 24 gagal: `Telegram sidecar failed to start` ×18, `TG_SESSION_DEAD` ×5, `SCRAPER_IDLE_STUCK` ×1.
- `sidecar failed to start` terjadi **serentak ~6 akun** saat auto scrape terjadwal mulai (28 Okt 12:02; 30 Okt 11:07–11:08) — akun pertama tiap brand (JMMY Lula, M24SG Jennifer, FWSG Jason, STMY Raisa, WBSG Carina, SBMY Kenny, dll.).
- Baris `running` tak selesai juga berkelompok ~6 akun pada jam mulai auto scrape (27 Okt 14:56, 29 Okt 11:35, 30 Okt 11:10).

**Invite link TG normal:** akun yang di-scrape 3–5 Nov punya link untuk hampir semua grup admin (contoh WBSG Carina 432/432, SBMY Aida 487/487, FWSG Jason 485/486) — berbeda dengan WhatsApp.

---

## Changelog
| Versi | Tanggal | Perubahan |
|---|---|---|
| v1 | 2026-11-06 | Versi pertama: scan 5 subagent (login/sidecar, scraper sidecar, Electron/UI/DB, Job Queue, config/build/validator) + verifikasi ulang (termasuk Telethon 1.45) + data produksi. |
| v1.1 | 2026-11-06 | Audit independen: koreksi pemanggil `ensureSidecarRunning` & kapan port di-kill, tambah perilaku handler exit / retry boot / polling tanpa batas, `loginMethod` qr setelah restore, timeout join & minimal, asal +90 s, kemampuan sidecar membubarkan grup. |
