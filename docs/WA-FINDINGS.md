# WA-FINDINGS — Temuan & rekomendasi penyelesaian (WhatsApp)

| Versi | Tanggal | Basis | Pasangan |
|---|---|---|---|
| **v1.1** | 2026-11-06 | commit `af2f9a9` · app `1.0.37` | [`WA-SNAPSHOT.md`](./WA-SNAPSHOT.md) v1.1 |

**Label bukti:** ✅ dicek ulang ke kode/library — v1.1: **semua 35 temuan diaudit ulang secara independen** (30 terbukti, 2 dikoreksi sebagian, dampak 4 temuan diperbaiki). Angka dampak dari data produksi (Supabase) tidak bisa dicek dari kode.
**Prioritas:** **P1** = cocok langsung dengan kegagalan di produksi · **P2** = risiko nyata, belum terlihat di data · **P3** = perapian.
**Status:** `open` · `in progress` · `done (commit xxx)` — perbarui saat dikerjakan.

---

## A. Scrape

| # | Temuan | Bukti | Dampak | Rekomendasi | Prio | Status |
|---|---|---|---|---|---|---|
| A1 | Tahap buka WhatsApp (tunggu `ready`) tanpa batas waktu; watchdog baru aktif setelahnya | ✅ `whatsapp.ts:333-338`, `whatsappScrape.ts:304-308, 404-407` | 30 run `running` tak pernah selesai; auto scrape SBMY/M24SG macet di akun pertama tiap hari | Beri batas waktu pada fase buka client (mis. skala jumlah grup, maks ~15 menit); pasang watchdog sejak sebelum `withWhatsAppClient`; saat habis → tutup Chrome, lepas lock, error jelas `SCRAPER_WA_OPEN_TIMEOUT` | P1 | open |
| A2 | `store_not_ready` langsung gagal tanpa ditunggu/retry | ✅ `whatsappGroupScrapeStore.ts:48-50` | Gangguan halaman sesaat → ratusan grup gagal dalam detik → `SCRAPER_INCOMPLETE` | Saat `window.WWebJS` tidak ada: hentikan pool, tunggu store siap lagi (poll, batas waktu), lalu ulangi grup yang tersisa; jika store tak kembali → gagal dengan alasan `WA_PAGE_RELOADED` | P1 | open |
| A3 | Chrome tidak tertutup jika koneksi ke app sudah putus: `pupBrowser.catch` (bukan Promise) error, `destroy()` library hanya menutup jika `isConnected()`. Saat app quit GM tidak menutup Chrome WA secara eksplisit; Puppeteer mematikannya hanya saat proses keluar normal → Chrome tertinggal saat app crash / ditutup paksa | ✅ `whatsapp.ts:277-299`, wwebjs `Client.js:477, 1277-1283`, `main/index.ts:93-96`, `@puppeteer/browsers launch.js:189, 243-286` | 11× "browser is already running" | Simpan PID proses Chrome saat launch; tutup dengan `browser.close()` lalu kill PID bila masih hidup; tutup semua Chrome WA di `before-quit`; saat start app & sebelum `freshBoot` cek lock profil (`SingletonLock`) dan bersihkan proses yatim untuk profil itu | P1 | open |
| A4 | Retry scrape mengulang fase metadata dari nol; dari checkpoint hanya invite link yang dipakai ulang (grup admin yang link-nya ada di checkpoint melewati ambil-link) | ✅ `whatsappScrape.ts:122-135, 174, 207-212` | Akun ~700 grup ≈ 4 jam per percobaan | Pakai `doneGroupIds` + baris hasil dari checkpoint (< 24 jam) untuk melanjutkan; commit DB tetap sekali di akhir (atomik) | P1 | open |
| A5 | Invite link gagal tanpa alasan tercatat: 3 cara in-page menelan error (`catch {}`), hasil `null`, scrape tetap sukses; hanya `console.warn` + hint `WA_INVITE_EXPORT_PARTIAL` | ✅ `whatsappGroupInviteLink.ts` | Sejak ~11 Sep hampir semua scrape WA = 0 link; master hanya hidup dari data lama | (1) Log error tiap cara; (2) uji 3 modul WA Web (`WAWebMexFetchGroupInviteCodeJob`, `WAWebGroupInvite.queryGroupInviteCode`, `groupMetadata.inviteCode`) di versi WA Web saat ini — kemungkinan nama/bentuk modul berubah; (3) perbarui versi WA Web terkunci / whatsapp-web.js ke versi yang mendukung; (4) jika grup admin > 0 tapi link = 0 → tandai scrape **warning** + alert | P1 | open |
| A6 | `SCRAPER_IDLE_STUCK` tertimpa jadi `SCRAPER_CANCELLED` | ✅ `whatsappScrape.ts:551-553` | Penyebab asli hilang dari log | Periksa `ScrapeTimeoutError` sebelum cek `isCancelled` di catch lane | P2 | open |
| A7 | Inbox wait selalu skala 6000 grup (`max(jumlah, 6000)`) | ✅ `whatsappScrape.ts:437` | Akun kecil menunggu 8 putaran (≈45 s) bukan 3 (≈20 s) — sekitar 25 s lebih lama | Pakai jumlah grup sebenarnya untuk skala | P3 | open |
| A8 | Satu error lempar di fase 1 menggagalkan `Promise.all`, worker lain tetap jalan | ✅ `deviceGroupScale.ts:186` | Kerja yatim di background | `runPooled` dengan abort bersama + tunggu semua worker berhenti | P2 | open |
| A9 | `priorInvites` menghitung baris admin ber-link di checkpoint lama tanpa cek apakah masih ada di hasil sekarang | ✅ `whatsappScrape.ts:267-270` | `WA_INVITE_EXPORT_PARTIAL` bisa tersembunyi | Hitung hanya baris saat ini yang admin dan punya link | P3 | open |
| A10 | Akun > ~7058 grup selalu gagal gate (list dipotong 6000, hitungan inbox tidak) | ✅ `whatsappGroupDiscovery.ts:277-281` | Akun sangat besar tidak pernah sukses | Set `truncated` saat dipotong; bandingkan gate dengan angka yang sudah dipotong | P3 | open |

## B. Login, lock, pool Chrome

| # | Temuan | Bukti | Dampak | Rekomendasi | Prio | Status |
|---|---|---|---|---|---|---|
| B1 | QR login menunggu lock miliknya sendiri (45–600 s) | ✅ `whatsapp.ts:420-428, 795-799` | QR muncul sangat lambat | Panggil versi release yang tidak menunggu lock saat sudah di dalam lock (flag `insideLock`) | P1 | open |
| B2 | Lock per akun tanpa timeout | ✅ `whatsapp.ts:79-89` | Satu operasi macet menahan semua operasi akun | Batas waktu pada operasi di dalam lock + mekanisme lepas paksa yang menutup Chrome | P1 | open |
| B3 | Pool Chrome bisa lewat batas (cek `if`, bukan loop) & hanya membatasi `initialize()` | ✅ `waBrowserPool.ts:32-38` (sama di pool auto) | Lebih banyak Chrome hidup dari batas → beban PC | Ganti `if` → `while`; tahan slot selama client hidup, lepas saat client ditutup | P2 | open |
| B4 | Retry init menghancurkan session lalu init ulang client yang sama; QR/pairing tidak terkirim | ✅ `whatsapp.ts:516, 162-163` | Login gagal tanpa QR | Buat client baru di setiap retry | P2 | open |
| B5 | `disconnected` saat login tetap dikirim main (`platform-session:invalid`); renderer menahannya untuk akun yang sedang login/diproses, jadi invalidasi DB + purge disk hanya terjadi di luar alur login yang terlacak | ✅ `whatsapp.ts:142-152, 241`; `useRealtimeAccountSessions.ts:119-128`; `GroupMonitoringProvider.tsx:334-352`; `platformSessionSync.ts:103-105` | Session bisa terhapus jika `disconnected` datang di luar alur login yang terlacak | Tahan event di main selama fase login sampai `ready`/gagal final | P3 | open |
| B6 | Restore di renderer menyerah 15 s, main masih restore ≥45 s memegang lock | ✅ `usePlatformLogin.ts:16, 518`; `whatsapp.ts:607` | Restore terbuang dan QR tertunda karena antre di lock | Samakan batas waktu atau batalkan restore di main saat renderer menyerah | P3 | open |

## C. Auto scrape & pencatatan

| # | Temuan | Bukti | Dampak | Rekomendasi | Prio | Status |
|---|---|---|---|---|---|---|
| C1 | Tidak ada alert saat scrape gagal/macet berulang (permintaan Kent) | ✅ (tidak ada mekanisme di kode) | Kegagalan diam-diam, ketahuan setelah gali data | Retry otomatis terbatas per akun; setelah N gagal → alert ke Owner (mis. Slack/notifikasi app); alert juga saat koneksi tidak stabil & saat link = 0 (A5) | P1 | open |
| C2 | Log kegagalan tidak tersimpan ke file | ✅ (tidak ada `electron-log`/penulis file) | Penyebab tidak bisa dibuktikan | Tulis log main process ke file harian di `userData/logs`, simpan alasan skip per grup & ringkasan per run ke `scrape_runs.metadata` | P1 | open |
| C3 | Baris `scrape_runs` tertinggal `running` + `trigger_type` selalu `manual` | ✅ `scrapeRuns.ts:17-18` | Statistik & diagnosa menyesatkan | Sweep saat app start: `running` > batas waktu → `failed (STALE)`; isi `trigger_type` sesuai lane (`scheduled` untuk auto) | P2 | open |
| C4 | Setelah commit DB sukses, error langkah berikutnya menimpa run jadi `failed` | ✅ `runAccountScraper.ts:162-221` | Data tertulis tapi UI bilang gagal | Pisahkan try commit vs langkah sesudahnya; status run = hasil commit | P2 | open |
| C5 | Perubahan dependency hook membatalkan auto scrape yang sedang jalan | ✅ `useAutoAccountSync.ts:436-447` | Auto scrape putus di tengah | Pisahkan lifecycle runner dari dependency yang sering berubah | P2 | open |
| C6 | Mode Scrape Now menimpa jadwal user ke default | ✅ `autoScrapeDefaults.ts:65-69` | Setting jadwal user hilang | Reset hanya flag Scrape Now, bukan seluruh setting | P3 | open |
| C7 | Tanggal scrape UTC vs cek "hari ini" lokal | ✅ `accountScraper.ts:228` vs `accountMonitoringEngine.ts` | Salah deteksi "sudah scrape hari ini" 00:00–07:00 WIB | Satu sumber tanggal (lokal) untuk tulis & cek | P3 | open |

## D. Job Queue

| # | Temuan | Bukti | Dampak | Rekomendasi | Prio | Status |
|---|---|---|---|---|---|---|
| D1 | Batch create 25 grup ≈ 134 menit > stale 90 menit | ✅ `workerPlatformSettings.ts:448-449`, `jobQueueRunner.ts:48` | Job dianggap macet, slot dilepas saat device masih membuat grup | Stale dihitung dari aktivitas terakhir (heartbeat progress), bukan durasi total; atau stale = max(90 m, timeout job) | P1 | open |
| D2 | Lock automation menyerah 90 s lalu tetap jalan | ✅ `automationAccountLock.ts:10-18` | Dua operasi bisa jalan di akun yang sama | Jangan jalankan saat lock belum lepas; kembalikan job ke antrian | P2 | open |
| D3 | Cancel job selalu melepas execute slot akun | ✅ `automation/index.ts:75-80` | Bisa melepas slot milik scrape/sync lain | Lepas slot hanya jika dipegang oleh job itu (simpan id pemilik slot) | P2 | open |
| D4 | Leave, delete, set foto tidak cek stop & tidak cek akun | ✅ `waLeaveGroup.ts`, `waDeleteGroupChat.ts`, `waSetGroupPhoto.ts` | Cancel tidak menghentikan kerja; risiko akun salah | Tambah `peekJobStopRequest` per grup & `assertWhatsAppAccount` di awal | P2 | open |
| D5 | Rantai auto-enqueue ditolak `JOB_ALREADY_QUEUED_FOR_ACCOUNT`, hanya di-log | ✅ `jobQueueStore.ts:218-228`, `jobQueueRunner.ts:622-633, 657-669` | Grup tidak pernah dihapus/difoto | Izinkan multi-queue untuk rantai, atau gabungkan ke job follow-up yang ada | P2 | open |
| D6 | Join & set admin tidak simpan outcome di tengah batch; set admin sukses jika ≥1 target | ✅ `waAutomation.ts:675, 1048-1219` | Progres hilang saat timeout; laporan berlebih | Simpan outcome per grup; status per target | P2 | open |
| D7 | `createGroup` tanpa timeout di level app | ✅ `waAutomation.ts:518`; dibatasi `protocolTimeout` Puppeteer (`waPuppeteerChrome.ts:90-94`) | Hang dibatasi protocolTimeout (5–20 menit), bukan sampai timeout job | Bungkus dengan batas waktu | P3 | open |

## E. Config, build, data

| # | Temuan | Bukti | Dampak | Rekomendasi | Prio | Status |
|---|---|---|---|---|---|---|
| E1 | Env `RM_WA_SCRAPE_*`, `RM_SCRAPE_*`, `RM_SESSION_CHECK_TIMEOUT_MS` dibaca sebelum `loadAppEnv()` | ✅ `deviceGroupScale.ts:16-64`, `main/index.ts:12, 83-84` | Nilai dari `.env` AppData / `org-default.env` tidak berlaku | Baca env lewat fungsi saat dipakai (lazy), bukan konstanta saat modul dimuat | P2 | open |
| E2 | Ketergantungan ke build WA Web pihak ketiga yang dikunci | ✅ `whatsapp.ts:53-54` | Saat WhatsApp mengubah web, fitur bisa berhenti diam-diam (lihat A5) | Pantau & perbarui pin secara berkala; uji smoke (login, scrape 1 grup, invite) setiap ganti versi | P1 | open |
| E3 | Nomor lokal (`08…`) tidak cocok `62…` → `WA_ACCOUNT_MISMATCH` palsu | ✅ `whatsappScrape.ts:71-76` | Scrape ditolak walau akun benar | Normalisasi nomor ke format internasional saat simpan & saat bandingkan | P3 | open |
| E4 | Build Chrome 'latest' tanpa bersihkan cache; runtime pilih file pertama | ✅ `build-puppeteer-chrome.mjs:32`, `waPuppeteerChrome.ts:25-33` | Versi Chrome di installer tidak pasti | Pin versi Chrome sesuai puppeteer; bersihkan cache sebelum build | P3 | open |
| E5 | Engine Missing/Junk cocokkan `group_id` mentah (case-sensitive) | ✅ `accountMasterDailyCompare.ts:78-105` | Potensi selisih palsu | Pakai normalisasi yang sama dengan SQL (`rm_norm_group_id`) | P3 | open |

---

## Urutan pengerjaan yang disarankan (P1)
1. **C2** log ke file — supaya setiap perbaikan berikutnya bisa dibuktikan.
2. **A5 + E2** invite link — dampak bisnis langsung (master hanya hidup dari data lama).
3. **A1, B1, B2** — scrape/login macet.
4. **A2, A3** — gagal massal & Chrome tertinggal.
5. **A4, D1** — durasi panjang & stale job.
6. **C1** retry + alert ke Owner.

## Changelog
| Versi | Tanggal | Perubahan |
|---|---|---|
| v1 | 2026-11-06 | Dipisah dari WA-SNAPSHOT v1 + rekomendasi penyelesaian & prioritas |
| v1.1 | 2026-11-06 | Audit independen semua temuan → semua bertanda ✅; koreksi A3 (Chrome saat quit), A4, A5, A9, B5 (prio P2→P3), B6, D5 (baris), D7, A7 (dampak) |
