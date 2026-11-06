# TG-FINDINGS — Temuan & rekomendasi penyelesaian (Telegram)

| Versi | Tanggal | Basis | Pasangan |
|---|---|---|---|
| **v1.1** | 2026-11-06 | commit `24d2764` · app `1.0.37` · sidecar v14 | [`TG-SNAPSHOT.md`](./TG-SNAPSHOT.md) v1.1 |

**Label bukti:** ✅ dicek ulang ke kode/library — v1.1: **semua temuan berbasis kode diaudit ulang secara independen** (tidak ada yang salah total; 2 dikoreksi sebagian, 3 dampak diperbaiki, 2 nomor baris dibetulkan). C1 berbasis data produksi.
**Prioritas:** **P1** = cocok langsung dengan kegagalan di produksi / risiko keamanan besar · **P2** = risiko nyata · **P3** = perapian.
**Status:** `open` · `in progress` · `done (commit xxx)`.

---

## A. Sidecar & lifecycle

| # | Temuan | Bukti | Dampak | Rekomendasi | Prio | Status |
|---|---|---|---|---|---|---|
| A1 | Semua akun berbagi satu proses start sidecar; start gagal sehat dalam 25 s → semua akun yang menunggu gagal bersamaan | ✅ `telegramSidecar.ts:97, 158-229` | 18× `Telegram sidecar failed to start` serentak ~6 akun saat auto scrape mulai | Naikkan batas tunggu sehat (binary onefile perlu waktu ekstrak), retry start sekali dengan log stdout/stderr sidecar; auto scrape TG start bertahap (bukan 6 brand sekaligus) | P1 | open |
| A2 | Validate yang timeout/error transport me-restart sidecar bersama — mematikan scrape/automation semua akun TG | ✅ `validateSession.ts:17, 73-76` | Satu akun lambat → semua akun TG terputus | Restart hanya jika `/health` benar-benar mati; timeout validate per akun → kembalikan `busy/timeout` saja | P1 | open |
| A3 | Kill orphan membunuh proses apa pun di port 8765; di mac/Linux `lsof -ti` juga menangkap socket klien (termasuk Electron) | ✅ `telegramSidecar.ts:125-130` | Proses lain/Electron bisa terbunuh (mac/Linux) | Simpan PID sidecar sendiri; kill hanya PID itu; di mac/Linux pakai `lsof -ti tcp:8765 -sTCP:LISTEN` | P2 | open |
| A4 | Handler `exit` tidak cek identitas child → exit child lama bisa menghapus referensi child baru | ✅ `telegramSidecar.ts:212-215` | Sidecar baru dianggap orphan & dibunuh, start ganda | Bandingkan `child === sidecarProcess` sebelum reset | P2 | open |
| A5 | Restart sidecar menghapus semua session di memori untuk semua akun | ✅ `telegram_login.py:38` | Akun lain harus restore ulang; scrape berjalan putus | Minimalkan restart (A1, A2); restore otomatis saat session tidak ditemukan | P2 | open |

## B. Login & session

| # | Temuan | Bukti | Dampak | Rekomendasi | Prio | Status |
|---|---|---|---|---|---|---|
| B1 | `QRLogin.recreate()` mengembalikan `None` tapi GM menimpa `session.qr_login` dengan hasilnya | ✅ `telegram_login.py:382`; Telethon `qrlogin.py` (`recreate` tanpa `return`) | Setelah QR berumur 25 s, objek QR jadi `None` → QR berhenti diperbarui secara diam-diam (tanpa error) | Ganti jadi `await session.qr_login.recreate()` tanpa assignment; uji login QR > 25 s | P1 | open |
| B2 | Export memaksa status session `ready` walau belum login (hanya auth-key-dead yang membatalkan) | ✅ `telegram_login.py:605-627` | Session belum terotorisasi bisa tersimpan sebagai aktif di DB | Export hanya jika `is_user_authorized()` true; selain itu kembalikan error | P1 | open |
| B3 | Polling status tidak pernah berhenti untuk session yang tidak dikenal (`pending`), tidak ada guard request tumpang tindih | ✅ `telegram_login.py:546-547`; `telegramSidecar.ts:358-406` | Polling tanpa akhir; `recreate()` paralel | Batas waktu total polling; guard in-flight; `pending` tanpa session → error | P2 | open |
| B4 | `phone/start`, `/cancel`, status poll, cek hidup validate tidak memakai lock | ✅ `telegram_login.py:442, 536`; `main.py:218`; `telegram_scraper.py:1674` | `/cancel` atau validate bisa memutus client saat scrape/automation berjalan | Lindungi operasi yang mengubah/menghubungkan client dengan `tg_session_lock` | P2 | open |
| B5 | Clear Session tidak memanggil `log_out()`; string tetap di DB | ✅ `telegram_login.py:766-786`; `clearAccountSession.ts` | Key tetap berlaku di server Telegram | Panggil `client.log_out()` saat Clear Session; kosongkan `session_data` | P2 | open |
| B6 | Pindah PC tidak memutus client di PC lama | ✅ (tidak ada kolom pemilik device) | Risiko `AUTH_KEY_DUPLICATED` saat dua PC aktif | Catat PC pemilik session di DB; PC lain menolak/mengambil alih dengan pemutusan resmi | P2 | open |
| B7 | `loginMethod` default `qr` menimpa login via phone | ✅ `runAccountScraper.ts:42, 54`; `telegram_login.py:733` | Data metode login salah | Simpan metode asli | P3 | open |

## C. Scrape

| # | Temuan | Bukti | Dampak | Rekomendasi | Prio | Status |
|---|---|---|---|---|---|---|
| C1 | Baris `running` tak selesai berkelompok saat auto scrape mulai (6 akun sekaligus) | ✅ data Supabase (27 Okt, 29 Okt, 30 Okt) | Auto scrape akun pertama tiap brand tidak tuntas | Telusuri dengan log (C6); terapkan A1 & sweep run `running` basi | P1 | open |
| C2 | Poll result tanpa batas: HTTP non-OK / error fetch → `continue` selamanya tanpa batas jumlah error | ✅ `telegramScrape.ts:226-266` | Loop poll berjalan tanpa akhir jika sidecar tidak merespons | Batas error beruntun; hentikan loop saat watchdog/cancel | P2 | open |
| C3 | Run baru bisa menempel ke job lama (`alreadyRunning`) | ✅ `telegram_scraper.py:1472-1474`; `telegramScrape.ts:216` | Hasil scrape lama dipakai run baru | Tolak `alreadyRunning` dari run baru atau tunggu job lama selesai dulu | P2 | open |
| C4 | Cancel manual selalu membatalkan sidecar (bisa mematikan auto lane di akun sama); cancel saat menunggu lock hilang | ✅ `scraper/index.ts:202-205`; `telegram_scraper.py:974` | Auto scrape terputus; cancel tidak berefek | Cek lane aktif sebelum cancel; jangan hapus flag cancel setelah lock didapat | P2 | open |
| C5 | Retry "session" terlalu luas (cocok `TG_SESSION_DEAD`) → restore + scrape ulang sia-sia | ✅ `telegramScrape.ts:363-372` | Waktu terbuang | Retry hanya untuk pesan "session not found" | P3 | open |
| C6 | Log sidecar & alasan gagal tidak tersimpan ke file | ✅ (stdout sidecar hanya ke console) | Penyebab `sidecar failed to start` / `running` tidak bisa dibuktikan | Simpan stdout/stderr sidecar + log scrape ke file harian di `userData/logs` | P1 | open |
| C7 | Loop FloodWait discovery tanpa batas jumlah; beberapa tidur FloodWait tanpa heartbeat/cancel | ✅ `telegram_scraper.py:499-513, 263, 905` | Discovery bisa berulang tanpa batas; tidur hingga ~125 s tanpa progress & tanpa cek cancel | Batas percobaan; heartbeat & cek cancel di semua tidur | P2 | open |
| C8 | `_count_admin_roles` menelan semua error → 0 admin (bisa berarti gagal) | ✅ `telegram_scraper.py:929` | `admin_count` salah | Bedakan gagal vs nol; propagasi FloodWait | P3 | open |
| C9 | Batas unverified role longgar (24 dari 30 grup unverified tetap `ok`) | ✅ `telegram_scraper.py:1379-1396` | Grup tercatat bukan admin padahal admin | Ambang berbasis persentase untuk akun kecil | P3 | open |
| C10 | `SCRAPER_PARTIAL_RESULT` tidak punya teks UI | ✅ `scrapeErrorUi.ts:502-505, 574` | User melihat kode mentah | Tambah mapping pesan | P3 | open |

## D. Job Queue

| # | Temuan | Bukti | Dampak | Rekomendasi | Prio | Status |
|---|---|---|---|---|---|---|
| D1 | FloodWait sampai 7200 s ditidurkan di dalam request (timeout 600 s) → Electron abort lalu `withNetworkRetry` POST ulang sambil lock masih dipegang (berlaku untuk set admin, set foto, leave, delete; create & join tidak di-retry) | ✅ `telegram_set_group_photo.py:114`; `telegram_automation.py:631, 662, 700, 828`; `tgAutomationClient.ts:40-67`; `networkRetry.ts:13, 22` | Aksi diulang (foto ter-upload ulang), antrean ~30 menit per grup | Sidecar kembalikan `FLOOD_WAIT_RETRY` jika > batas request; Electron yang menunggu & mengulang; jangan retry aksi non-idempoten | P1 | open |
| D2 | Jeda after-create dari UI (≥150 s) dibatasi 15 s di sidecar | ✅ `telegram_automation.py:605`; `workerPlatformSettings.ts:449` | Setting anti-ban tidak berlaku penuh | Jalankan sisa jeda after-create di Electron atau naikkan batas sidecar | P2 | open |
| D3 | Cancel lalu Run membuat job tertahan `running` sampai stale 90 menit | ✅ `jobQueueRunner.ts:340-348`; `jobQueueStore.ts:275-281, 429-446` | Job macet; execute slot dilepas tapi job tetap dihitung running sehingga menghalangi job lain untuk akun itu | Tandai job `cancelled` saat flag cancel dikonsumsi; bersihkan flag saat requeue | P2 | open |
| D4 | Batch create > 90 menit dianggap stale sebelum timeout-nya sendiri | ✅ `jobQueueRunner.ts:48`, `jobQueueStore.ts:646-658` | Slot dilepas saat sidecar masih membuat grup | Stale berbasis heartbeat progress | P2 | open |
| D5 | Recovery create mencocokkan judul di 40 dialog terakhir → bisa mengambil grup lama bernama sama | ✅ `telegram_automation.py:366-381, 683-728` | Grup lama dilaporkan sebagai hasil create | Catat ID dialog sebelum create; cocokkan grup baru berdasarkan waktu/ID, bukan judul saja | P2 | open |
| D6 | Set admin & set foto: tanpa try/catch per grup, outcome hanya di akhir; set admin sukses jika ≥1 target | ✅ `tgAutomationClient.ts:230-239, 326-334`; `telegram_automation.py:852` | Progres hilang saat error; laporan berlebih | Simpan outcome per grup; status per target | P2 | open |
| D7 | `TG_ACCOUNT_MISMATCH` / error session tetap diulang untuk setiap grup dengan jeda penuh | ✅ (tidak ada cek `errorCode` di loop) | Waktu terbuang, beban akun | Hentikan batch pada error akun/session | P2 | open |
| D8 | Hitungan sukses batch dihitung ganda | ✅ `jobQueueRunner.ts:513-516` | Pesan "Success N" berlebih | Hitung dari outcome saja | P3 | open |

## E. Keamanan & config

| # | Temuan | Bukti | Dampak | Rekomendasi | Prio | Status |
|---|---|---|---|---|---|---|
| E1 | API sidecar tanpa auth + CORS `*`; `GET /telegram/session/export/{id}` mengembalikan StringSession | ✅ `main.py:67-72, 260-262` | Halaman web lokal bisa membaca session / memanggil aksi jika tahu UUID akun | Token rahasia per proses (dibuat Electron, dikirim di header); CORS hanya origin app; cek Host header | P1 | open |
| E2 | `TELEGRAM_API_HASH` & `SUPABASE_SERVICE_ROLE_KEY` ikut terbundel teks biasa di installer; StringSession tersimpan teks biasa & tabel session bisa dibaca anon | ✅ `build-installer.mjs:55`; `017_rm_full_reset.sql:314` | Kebocoran kredensial/session | Pindahkan rahasia ke backend; enkripsi `session_data`; perketat RLS | P1 | open |
| E3 | Dependensi Python tanpa batas atas & tanpa lockfile; PyInstaller tidak dipin | ✅ `requirements.txt`; `build-telegram-sidecar.mjs:73-83` | Build tidak reproducible; risiko perubahan perilaku Telethon (GM memakai internal privat Telethon) | Pin versi pasti + lockfile; uji smoke saat upgrade | P2 | open |
| E4 | Perubahan hanya di `python-sidecar/**` tidak memicu workflow rilis | ✅ `release-multiplatform.yml:8-15` | Perbaikan sidecar tidak ikut build tanpa perubahan lain | Tambahkan `python-sidecar/**` ke path workflow (hanya dengan perintah eksplisit user, sesuai aturan rilis) | P3 | open |
| E5 | Edge function `telegram-sheets-sync` tanpa auth, select tanpa pagination, cocok akun via substring | ✅ `config.toml:3-4`; `index.ts:89-100`; `telegramAlignment.ts:54-55` | Bisa dipanggil siapa pun; data terpotong; akun salah cocok | Verifikasi secret header; pagination; cocok label persis | P2 | open |

---

## Urutan pengerjaan yang disarankan (P1)
1. **C6** log sidecar & scrape ke file — dasar pembuktian.
2. **A1, A2** — start sidecar serentak & restart bersama (penyebab kegagalan massal).
3. **B1, B2** — QR login rusak setelah 25 s & session tidak sah tersimpan.
4. **D1** — FloodWait vs timeout & retry aksi.
5. **E1, E2** — keamanan session & kredensial.
6. **C1** — telusuri `running` tak selesai setelah log tersedia.

## Changelog
| Versi | Tanggal | Perubahan |
|---|---|---|
| v1 | 2026-11-06 | Versi pertama dari scan 5 subagent + verifikasi ulang (GM, Telethon 1.45, data Supabase) |
| v1.1 | 2026-11-06 | Audit independen semua temuan → semua bertanda ✅; koreksi A2, B1, C2, C7 (dampak), C10 & D1 (baris + cakupan), D3 (nuansa slot) |
