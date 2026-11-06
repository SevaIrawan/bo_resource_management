# WA-SNAPSHOT — Potret lengkap WhatsApp di GM Apps

| Versi | Tanggal | Snapshot dari commit | Sumber |
|---|---|---|---|
| **v1.1** | 2026-11-06 | `af2f9a9` (main) · app `1.0.37` | 5 subagent scan end-to-end + verifikasi ulang kode & data Supabase + audit independen (v1.1) |

**Cara pakai:** baca file ini sebelum menganalisis apa pun soal WhatsApp. Lalu cek perubahan sejak snapshot:
`git log --oneline af2f9a9..HEAD --stat -- electron/main/platformLogin electron/main/scraper electron/main/automation src supabase python-sidecar`
→ baca hanya file yang berubah. File ini **peta**, bukan pengganti kode; sebelum mengubah kode tetap baca file aslinya.

**Aturan update:** setiap perubahan perilaku/struktur kode WA → perbarui bagian terkait + naikkan versi + isi Changelog (paling bawah) di commit yang sama.

**Temuan & rekomendasi:** lihat [`WA-FINDINGS.md`](./WA-FINDINGS.md).

---

## 1. Versi & arsitektur

| Komponen | Versi / nilai | Sumber |
|---|---|---|
| whatsapp-web.js | **1.34.7** (pin `puppeteer` 24.38.0) | `package-lock.json:10111` |
| puppeteer / puppeteer-core | 24.38.0 | lock:8498, 8519 |
| @puppeteer/browsers | 2.13.0 | lock:1566 |
| Electron | 36.9.5 | lock:4654 |
| WA Web build (dikunci) | `2.3000.1020885143-alpha` dari `raw.githubusercontent.com/wppconnect-team/wa-version` (`webVersionCache: remote`) | `whatsapp.ts:53-54, 309-312` |
| Chrome | Chrome for Testing **'latest' saat build** (bukan revisi pin puppeteer) → `resources/puppeteer-cache` → installer `puppeteer-chrome/chrome` | `scripts/build-puppeteer-chrome.mjs:32`, `package.json:188-189` |

```
Renderer (React)                         Main process (Electron)                      Device / Cloud
useAccountSyncFlow / useAutoAccountSync  scraper/index.ts (IPC)                       Chrome headless per akun
 → services/*FlowService                  → whatsappScrape.ts                         (whatsapp-web.js + WA Web)
 → runAccountScraper ──IPC scraper:run──▶ → platformLogin/whatsapp.ts (client, lock)    profil: userData/wa-sessions/session-{id}
 → accountScraper.writeScrapeDailyRows    automation/* (Job Queue, file JSON lokal)
 → Supabase RPC rm_commit_account_scrape ──────────────────────────────────────────▶ Supabase (daily, master, sessions, scrape_runs)
```

Prinsip: **auth WA hanya di disk PC** tempat QR di-scan; Supabase hanya menyimpan flag session (`session_data` = LocalAuth clientId).

---

## 2. Peta file WA

**Main — login & client:** `electron/main/platformLogin/`
| File | Isi |
|---|---|
| `whatsapp.ts` | Engine WA: `sessions` map, `withWaSessionLock`, `ensureWhatsAppClientInner`, `withWhatsAppClient`, QR/pairing login, restore disk, probe, `closeWhatsAppPuppeteer`, `destroyWhatsAppSession`, `forceReleaseWhatsAppForLogin`, purge LocalAuth |
| `waBrowserPool.ts` / `waAutoScrapeBrowserPool.ts` | Semaphore Chrome user (10) / auto (6) — hanya membungkus `initialize()` |
| `waPuppeteerChrome.ts` | Opsi launch + cari executable Chrome |
| `restore.ts`, `index.ts` | Restore dari disk; IPC `platform-login:*`, `cleanupPlatformLogin` |

**Main — scrape:** `electron/main/scraper/`
| File | Isi |
|---|---|
| `index.ts` | IPC `scraper:run`, `scraper:run-auto`, `cancel`, `cancel-auto`, `auto-lane-ready`, `validate-session` |
| `whatsappScrape.ts` | Pipeline scrape (fase 1 metadata, fase 2 invite), quality gate, error mapping |
| `whatsappGroupDiscovery.ts` | Tunggu store, tunggu inbox stabil, list grup live (cap 6000) |
| `whatsappGroupScrapeStore.ts` | Baca 1 grup di page (participants, admin/owner, skip reason) |
| `whatsappGroupInviteLink.ts` | Ambil invite link (3 cara in-page) |
| `deviceGroupScale.ts` | Konstanta, rumus timeout/ETA, `runPooled` |
| `scrapeWatchdog.ts`, `scrapeCheckpoint.ts`, `scrapeProgress.ts` | Watchdog idle, checkpoint lokal, event progress |
| `scrapeCancel*.ts`, `autoScrapeCancel.ts`, `autoScrapeLane.ts` | Cancel registry manual/auto, slot lane auto |
| `whatsappLinkState.ts`, `validateSession.ts`, `scrapeOutput.ts`, `whatsappScrapeQuality.ts`, `scrapeGroupValidation.ts` | Klasifikasi state, validasi session, normalisasi & gate hasil |

**Main — Job Queue:** `electron/main/automation/`
| File | Isi |
|---|---|
| `waAutomation.ts` | Dispatcher WA + join, create group, set admin |
| `waLeaveGroup.ts`, `waDeleteGroupChat.ts`, `waSetGroupPhoto.ts`, `waExitDeleteGroup.ts` (legacy) | Leave, hapus chat lokal, set foto |
| `jobQueueRunner.ts`, `jobQueueStore.ts`, `executeSlotPool.ts`, `automationAccountLock.ts`, `promiseTimeout.ts` | Runner, penyimpanan JSON, slot, lock, timeout |
| `autoEnqueueSetPhotoFromCreate.ts`, `autoEnqueueDeleteFromExit.ts` | Rantai otomatis create→foto, leave→delete |
| `electron/main/brandGroupPhoto.ts` | Foto brand lokal / Supabase Storage |

**Renderer:** `useAccountSyncFlow.ts`, `useAutoAccountSync.ts`, `usePlatformLogin.ts`, `useJobQueueSetupEnqueue.ts`; `services/{sync,scrape,login}FlowService.ts`; `lib/runAccountScraper.ts`, `runAutoAccountScrape.ts`, `accountScraper.ts`, `scrapeRuns.ts`, `scrapeErrorUi.ts`, `platformSessions.ts`, `persistLoginSession.ts`, `prepareDeviceForLogin.ts`, `clearAccountSession.ts`, `deviceSessionId.ts`, `deviceSessionGate.ts`; `config/autoScrape*.ts`, `workerPlatformSettings.ts`, `deviceConcurrencyPolicy.ts`.

**DB:** migrasi `017` (tabel), `036` (PK master), `039` (`is_owner`), **`040`** (definisi aktif `rm_commit_account_scrape` & `rm_rebuild_brand_groups_master`).

---

## 3. Session & login

- **LocalAuth:** `clientId = sessionId`, `dataPath = userData/wa-sessions` → folder `session-{id}` (`whatsapp.ts:304-307`). Disk dianggap punya auth jika ada `Default/IndexedDB`, `Default/Local Storage`, atau `.wwebjs_auth` (`:65-69`).
- **Supabase** `resource_management_platform_sessions`: `session_type='whatsapp_local_auth'`, `session_data` = clientId, disimpan via RPC `rm_save_platform_session` (`platformSessions.ts:310`). "Valid" = ada baris `is_active=true`.
- **`resolveDeviceSessionId`** (WA): pakai `session_data` baris aktif terbaru, kalau tidak ada pakai `accountId` (`deviceSessionId.ts:5-17`).
- **QR login** (`startWhatsAppQrLogin`, `whatsapp.ts:784-828`, di dalam lock): forceRelease → pakai ulang client CONNECTED → restore disk (opsional) → client baru → `initializeClientWithRetry`. QR dikirim `platform-login:qr` dengan `generation`. Timer hanya mengirim pesan, tidak mematikan Chrome.
- **Pairing code** (`:830-852`): selalu purge LocalAuth dulu, lalu `pairWithPhoneNumber`. Nomor dibersihkan jadi digit saja (minimal 8 digit, selain itu `Invalid phone number`), **tanpa** menambah kode negara (`:111-117, 839-840`).
- **Probe/Sync check:** `getState()`; `CONNECTED`=linked, `OPENING/UNLAUNCHED/PAIRING`=loading, `UNPAIRED*`, `TOS_BLOCK`, `PROXYBLOCK`, `DEPRECATED_VERSION`, `CONFLICT`, `TIMEOUT`, `null` = unlinked (`whatsappLinkState.ts:19-26`). Batas 90 s (`RM_SESSION_CHECK_TIMEOUT_MS`).
- **Clear Session:** cancel scrape → release + purge disk → nonaktifkan baris DB → log logout (`clearAccountSession.ts:43-90`).

---

## 4. Client lifecycle, lock, pool

- **`withWaSessionLock`** = rantai promise per session, **tanpa timeout** (`whatsapp.ts:79-89`). `withWhatsAppClient` memegang lock **selama seluruh scrape/automation** (`:696-708`). Satu operasi yang macet → semua operasi berikutnya untuk akun itu ikut tertahan.
- **`ensureWhatsAppClientInner`** (`:636-690`): `freshBoot` (auto lane) menghancurkan client di memori dulu. Client CONNECTED dipakai ulang. Client yang **sudah ada tapi belum CONNECTED ditunggu sampai `ready`** (bukan dibuat ulang). Client baru hanya dibuat jika belum ada atau `getState()` error (`:645-661`). Scrape memakai `readyTimeoutMs:0` → **tanpa batas waktu** (`:333-338`, `whatsappScrape.ts:304-308`). Sebelum kembali, fungsi ini juga menunggu store siap (`waitForWhatsAppStoreReady`, scrape `storeWaitMs` ≈ 36,6 menit, `whatsapp.ts:651/680/688`, `whatsappScrape.ts:307`) — semuanya di luar watchdog.
- **Menutup Chrome:** `closeWhatsAppPuppeteer` (`:277-299`) memanggil `pupBrowser.catch(...)`, padahal di whatsapp-web.js `pupBrowser` adalah objek Browser, bukan Promise (`Client.js:477`) → error ditelan, lalu `client.destroy()`. `destroy()` milik library **hanya menutup browser kalau `isConnected()`** (`Client.js:1277-1283`).
- **Saat app ditutup:** `before-quit` hanya mematikan sidecar Telegram; GM tidak menutup Chrome WA secara eksplisit (`main/index.ts:93-96`, `platformLogin/index.ts:197-199`). Puppeteer sendiri mematikan Chrome (`taskkill /T /F` di Windows) saat proses app **keluar normal** (`@puppeteer/browsers` `launch.js:189, 243-286`) — Chrome tertinggal hanya jika app crash / ditutup paksa.
- **Pool Chrome:** user 10 (`RM_WA_MAX_CONCURRENT_BROWSERS`, maks 10), auto 6 (tetap). Hanya membungkus `initialize()`; Chrome yang sudah hidup tidak dibatasi (`whatsapp.ts:491-520`).

---

## 5. Pipeline scrape (main process)

**Jalur:** manual `scraper:run` (guard job queue → `runWhatsAppScrape`) · auto `scraper:run-auto` (cek user lane → slot auto maks 6 → `runWhatsAppScrapeAutoLane`, `freshBoot`, pool auto). Keduanya → `runWhatsAppScrapeLane` (`whatsappScrape.ts:390`).

| Langkah | Detail | Rujukan |
|---|---|---|
| 1. Buka client | Lock → `ensureWhatsAppClientInner`, tanpa timeout ready | `whatsapp.ts:636` |
| 2. Watchdog mulai | **Baru aktif di sini** (setelah client siap). Idle = 900 s + 216 ms×6000 = **2.196.000 ms (~36,6 menit)** | `whatsappScrape.ts:404-407, 541-546`, `deviceGroupScale.ts:70-74` |
| 3. Cek nomor | `client.info.wid.user` vs nomor akun (digit, sama atau berakhiran) → `WA_ACCOUNT_MISMATCH` | `:61-81` |
| 4. Cek state | Harus `CONNECTED` → `WA_NOT_CONNECTED` | `:417-422` |
| 5. Tunggu store | Hingga ~36,6 menit, poll 250 ms → `WA_STORE_NOT_READY` | `:433` |
| 6. Tunggu inbox stabil | `scaleEstimate = max(jumlah, 6000)` → selalu 8 putaran × 5 s, maks ~36,6 menit | `:437-452`, discovery `:183-265` |
| 7. Discovery | Grup, peserta > 0, akun termasuk peserta (PN/LID); cap 6000 | discovery `:73-166, 277-281` |
| 8. Fase 1 metadata | 4 paralel; per grup retry 6× di page (+ `syncHistory` mulai percobaan ke-3) | `:148-171`, store `:161-206` |
| 9. Fase 2 invite | Hanya grup admin tanpa link, **satu per satu**; 6 percobaan × 20 s; jeda 600 ms + 0–400 ms | `:229-262`, invite `:126-165` |
| 10. Quality gate | Lihat tabel di bawah | `:455-504` |
| 11. Output | `{ok, groups, count, loggedInAs, elapsedMs, hint, deviceGroupCount}`; owner ⇒ admin | `whatsappScrape.ts:531-539`, `scrapeOutput.ts:9` |

**Skip reason fase 1** (`whatsappGroupScrapeStore.ts`):
| Reason | Retry? | Dihitung |
|---|---|---|
| `store_not_ready` (modul `window.WWebJS` tidak ada) | **Tidak** — langsung kembali | incompleteStore |
| `metadata_missing` | Ya (6×) | incompleteStore |
| `not_group` | Tidak | absent |
| `empty_participants` | Ya | absent |
| `not_member` | Tidak | absent |

**Invite link — 3 cara in-page berurutan** (`whatsappGroupInviteLink.ts:40-123`): `WAWebMexFetchGroupInviteCodeJob.fetchMexGroupInviteCode` → `WAWebGroupInvite.queryGroupInviteCode` → `getChat().groupMetadata.inviteCode`. Setiap error ditelan (`catch {}`); gagal semua → `null`, scrape tetap sukses.

**`SCRAPER_INCOMPLETE` muncul jika:** inbox kosong/tidak stabil (final < 85% puncak) · grup terlisting < 85% hitungan inbox (jika > 50) · 0 baris padahal ada grup live · baris < 85% grup live saat ada incompleteStore (jika > 50).

**Cap 6000:** list sudah dipotong 6000 di discovery, sehingga `truncated` (`whatsappScrape.ts:113`) selalu false — hint `TRUNCATED_6000` tidak pernah muncul dan akun > 6000 grup terpotong tanpa tanda.

**Checkpoint:** `userData/scrape-checkpoints/{id}.json`, maks 24 jam, simpan tiap 25 grup; **hanya invite link yang dipakai ulang**, keanggotaan selalu di-scan ulang dari nol (`:122-135, 207`).

**Kode error utama:** `WA_ACCOUNT_MISMATCH`, `WA_NOT_CONNECTED`, `WA_STORE_NOT_READY`, `WA_CLIENT_NOT_READY`, `SCRAPER_INCOMPLETE`, `SCRAPER_NO_GROUPS`, `SCRAPER_WA_CONNECT_FAILED`, `SCRAPER_WA_SESSION_UNLINKED`, `SCRAPER_CANCELLED`, `SCRAPER_IDLE_STUCK`, `AUTO_SCRAPE_USER_LANE_BUSY:*`, `AUTO_SCRAPE_LANE_BUSY`, `JOB_QUEUE_EXECUTE_FULL`, `SESSION_SETTLING`.

---

## 6. Alur Sync/Scrape di UI & auto scrape

- **Sync (↻):** Session Invalid → modal login. Valid → probe device → (busy = alert, gagal = invalidate + login) → modal **Scrape Now | Later**. Later = update session saja (`useAccountSyncFlow.ts:392-552, 860, 885`).
- **Scrape Now:** `runScrapeInBackground` → `runScrapeFlow` → `executeScrapeRun` → `runAccountScraper` (IPC) → commit DB → patch grid (`useAccountSyncFlow.ts:621`, `scrapeFlowService.ts:80`).
- **Auto scrape (Settings):** jadwal default jam 12 **waktu lokal PC**, sekali per hari, hanya jika app sudah terbuka sebelum jam itu (tanpa catch-up) (`autoScrapeSchedule.ts:13, 107-136`). Brand×platform jalan paralel (maks 6 brand per platform), akun dalam 1 brand berurutan dengan jeda 30 s. Akun tunggu siap maks 3 menit (poll 10 s), jika tidak → `busy`. Setiap akun selesai → `teardownAutoScrapeDevice` → IPC `cancel-auto`; kalau lane auto tidak aktif → `stopWhatsAppLogin` (`runAutoAccountScrape.ts:274-277`, `scraper/index.ts:164-184`). Mode Scrape Now selesai → setting di-reset ke default pabrik (`useAutoAccountSync.ts:404-406`).
- **`scrape_runs`:** baris dibuat `status='running'`, `trigger_type='manual'` **selalu** (termasuk auto) sebelum IPC; diselesaikan `completed/failed` setelah itu. App tertutup/crash di tengah → baris tetap `running` selamanya (`scrapeRuns.ts:17-18`, `runAccountScraper.ts:98, 162-221`).

---

## 7. Penulisan ke DB & master

- **Baris daily** (`accountScraper.ts:174-205`): `id = "{group_id}-{acc_name}"`, `invite_link`, counts, `is_admin/is_owner`, `scrape_date` = **tanggal UTC** (`:228`), `phone_number` wajib untuk WA.
- **RPC `rm_commit_account_scrape`** (040, versi aktif di DB sama dengan repo ✅): kunci advisory per brand+platform → hapus semua daily akun → insert daily (`NULLIF(invite_link,'')`) → hapus master brand+platform → bangun ulang dari **semua** daily brand+platform.
- **Gate master** per `group_id`: ≥1 baris `is_admin='yes'` **dan** ≥1 baris invite valid (boleh dari akun berbeda). Invite diambil dari baris valid terbaru; nama/hitungan dari baris admin.
- **Invite valid (WA):** `^https?://(www\.)?chat\.whatsapp\.com/[A-Za-z0-9_-]+$` — hanya cek format.
- Tidak ada trigger di tabel daily/master ✅.

---

## 8. Job Queue — aksi WhatsApp

Penyimpanan `userData/automation-job-queue.json` (per PC). Slot 10/platform, 1 job per akun. Settle 15 s. Stale 90 menit. Timeout per aksi = max(dasar aksi, jumlah langkah × 5 m) untuk **semua** aksi; dasar: join 20 m, set admin/leave/delete 25 m, foto 35 m, create 90 m (`jobQueueRunner.ts:52-76`).

| Aksi | Panggilan WA | Jeda default | Catatan |
|---|---|---|---|
| Join | `client.acceptInvite(code)` (timeout 120 s), cek via `queryAndUpdateGroupMetadataById` + `getChat` | 30–60 s, tiap 10 join 180–360 s | Outcome disimpan di akhir saja |
| Create | `client.createGroup` (tanpa timeout) → `setGroupProperty` (announcement, member_add_mode, restrict) → ambil invite | antar grup ≥180 s, setelah create ≥150 s (dipaksa) | Outcome disimpan per grup |
| Set admin | `WAWebModifyParticipantsGroupAction.promoteParticipants`, target via `enforceLidAndPnRetrieval` | antar target 30 s, antar grup 180 s | Maks 5 target; sukses jika ≥1 target |
| Set foto | `WWebJS.setPicture` (120 s, 3×, hard-coded) | antar grup = setting (default 180 s); ≥180 s hanya untuk job foto otomatis setelah create | Tanpa cek akun & tanpa cek stop |
| Leave | `WAWebExitGroupAction.sendExitGroup` (+ fallback) | 60 s | Tanpa cek akun & tanpa cek stop |
| Delete | `WWebJS.sendClearChat` + `sendDeleteChat` (**hapus chat lokal, bukan bubarkan grup**) | 60 s | `requireOwnerForDelete` tidak dipakai di WA |

Rantai otomatis: create → set foto, leave → delete (chunk 30). Sumber grup SETUP: Join = Missing (master) atau impor CSV (maks 500 baris, cocok ID → link → nama); Set admin = grup admin akun pemilik ∩ Not admin target; Leave = tab Daily (semua) / Junk.

---

## 9. Config, env, build, validator

| Env var | Default | Catatan |
|---|---|---|
| `RM_WA_MAX_CONCURRENT_BROWSERS` | 10 (1–10) | dibaca saat dipakai |
| `RM_WA_PROTOCOL_TIMEOUT_MS` | 1.200.000 (≥300.000) | dibaca saat dipakai |
| `RM_WA_SCRAPE_METADATA_CONCURRENCY` | 4 (1–12) | **dibaca saat modul dimuat** |
| `RM_WA_SCRAPE_GROUP_DELAY_MS` / `_JITTER_MS` | 600 / 400 | dibaca saat modul dimuat; 0 tidak bisa diset |
| `RM_WA_SCRAPE_CHECKPOINT_EVERY` | 25 (≥5) | dibaca saat modul dimuat |
| `RM_WA_INVITE_EXPORT_RETRIES` | 5 (→ 6 percobaan) | |
| `RM_WA_INVITE_EXPORT_RETRY_SEC` | 5 | tidak pernah berlaku |
| `RM_SESSION_CHECK_TIMEOUT_MS`, `RM_SCRAPE_IDLE_MS`, `RM_SCRAPE_BASE_MS`, `RM_SCRAPE_PER_GROUP_MS` | 90 s, 900 s, 120 s, 3,5 s | dibaca saat modul dimuat |

Setting UI WA disimpan di localStorage `rm_worker_settings_whatsapp` (per PC). Setting `inviteExportRetries`, `inviteExportRetrySec`, `setPhotoMaxRetry` ikut masuk payload job tetapi **tidak dibaca** jalur WA (retry invite dari env, set foto tetap 3×) (`workerPlatformSettings.ts:462-474`). Validator WA (`validate:multi-account-wa`, `wa-qr-login`, `device-group-scale`, `real-operations-data`, `session-flow`) **mayoritas cek teks statis**; hanya `validate:puppeteer-chrome` yang cek file Chrome nyata.

---

## 10. Data produksi (fakta dari Supabase)

**Scrape WA 26 Okt – 2 Nov 2026:** 123 run → 46 sukses · 30 `running` tidak pernah selesai · 21 `INCOMPLETE` putus di tengah · 4 `INCOMPLETE` 0 baris · 11 "browser already running" · 10 `CANCELLED` · 1 `WA_ACCOUNT_MISMATCH` · 0 `IDLE_STUCK`.
- SBMY ela & M24SG Maxie macet `running` di auto scrape **6/6 hari**; auto scrape SBMY & M24SG tidak lanjut ke akun berikutnya.
- Scrape sukses akun ~700 grup ≈ 4 jam.

**Invite link WA kosong sejak ~9–11 Sep 2026:** scrape terakhir dengan link = SBMY mey 8 Sep (1193/1197); sejak WBSG Kenji 11 Sep (0/708) hampir semua scrape WA di semua brand = 0 link (pengecualian FWSG Zoey 3 Nov 186/186). Tidak ada commit kode GM antara 25 Agu–20 Sep. Supabase menyimpan link apa adanya (RPC & trigger dicek ✅). Master masih berisi link lama dari akun yang belum di-scrape ulang sejak Jul–Sep.

---

## 11. Temuan bug & rekomendasi

Dipindah ke file terpisah: **[`WA-FINDINGS.md`](./WA-FINDINGS.md)** — daftar temuan (bukti, dampak, rekomendasi penyelesaian, prioritas, status).

---

## Changelog
| Versi | Tanggal | Perubahan |
|---|---|---|
| v1 | 2026-11-06 | Versi pertama: scan 5 subagent (login/session, scrape main, alur UI & DB, Job Queue, config/build/validator) + verifikasi ulang + data produksi Supabase. Temuan dipisah ke `WA-FINDINGS.md`. |
| v1.1 | 2026-11-06 | Audit independen: koreksi pairing code, client belum CONNECTED (ditunggu, bukan dibuat ulang) + store wait di luar watchdog, Chrome saat quit (Puppeteer mematikan saat keluar normal), output scrape, cap 6000/`truncated`, rumus timeout job, jeda set foto, setting WA yang tidak dibaca, nomor baris. |
