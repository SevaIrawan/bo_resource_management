# CLAUDE.md — Aturan kerja Claude di repo ini

Repo: **Resource Management** (`SevaIrawan/bo_resource_management`) — aplikasi desktop Electron untuk mengelola akun & grup WhatsApp dan Telegram per brand (login, scrape, join, create group, set admin, set photo, leave, delete, Job Queue, KPI). Data di Supabase cloud. **Ini produksi nyata, multi-akun (100+ WA/TG) — bukan sandbox.**

## Aturan wajib (berlaku di setiap perintah)

1. **Pahami dulu.** Uraikan perintah user. Jika ada bagian yang ambigu atau kurang — tanya dulu, jangan jalan dengan pemahaman setengah.
2. **Riset sebelum menyimpulkan.** Baca semua source terkait di repo (trace end-to-end, bukan satu file) dan sumber luar bila perlu (dokumentasi resmi whatsapp-web.js, Telethon, Supabase, Electron). Analisis dan rekomendasi harus berdasar data, sertakan rujukan `file:baris` atau link.
3. **Dilarang asumsi.** Tidak ada tebakan. Pisahkan **fakta** (terverifikasi dari kode/log/DB/pernyataan user) dan **hipotesis** (tulis eksplisit "belum terverifikasi"). Kalau bukti belum cukup, tanya satu pertanyaan paling kritis.
4. **Bahasa Indonesia** untuk semua percakapan.
5. **Tidak mengubah, mengedit, atau menghapus file repo** — termasuk commit, push, install dependency, atau migrasi DB — **tanpa izin eksplisit user untuk perubahan itu**. Sebelum eksekusi: tulis rencana (file apa, berubah apa, kenapa) lalu minta persetujuan. Izin satu perubahan tidak berlaku untuk perubahan lain. Gate teknis: hook `.claude/hooks/guard-repo-write.mjs` memaksa konfirmasi untuk setiap Edit/Write di repo dan perintah Bash yang mengubah file/git.
6. **Izin default hanya membaca** source yang relevan dengan perintah user.
7. **Tanya jika kurang jelas** — lebih baik bertanya daripada salah eksekusi.

## Perintah "hi"

Jika user mengetik **hi** di sesi mana pun, wajib (sebelum menjawab): baca penuh semua aturan (`CLAUDE.md`, `.cursorrules`, `.cursor/rules/*.mdc`) dan potret repo `docs/REPO-SNAPSHOT.md`; jalankan `git log --oneline <commit-snapshot>..HEAD --stat` dan baca file yang berubah sejak snapshot; lalu laporkan aturan yang berlaku, kondisi repo, dan bagian snapshot yang usang. Hook `.claude/hooks/hi-bootstrap.mjs` menyisipkan instruksi ini otomatis.

## Potret repo (`docs/REPO-SNAPSHOT.md`)

- Ringkasan seluruh isi repo agar tidak membaca ulang semua file tiap sesi. Baris "Snapshot dari commit" menandai versi kode yang dipotret.
- Setiap commit yang mengubah perilaku/struktur kode **wajib** memperbarui snapshot di commit yang sama (termasuk baris commit-nya).
- Snapshot hanya peta; untuk mengerjakan tugas tetap baca kode asli.
- Push langsung ke `main` (instruksi user).

## Saat menjawab bug / perilaku sistem

- Ikuti juga `.cursorrules` dan `.cursor/rules/*.mdc` (kontrak bisnis 5 tipe issue, multi-akun, alur scrape → daily → master, larangan mock/dummy).
- Hierarki kebenaran: **kode + config** > `logic_sync_scraper.txt` / `sessionColumnFlowSpec.ts` > `docs/PROJECT-MASTER-REFERENCE.md` > `PROJECT.md` / `HANDBOOK.md` (bisa kedaluwarsa — selalu cek kode).
- Jika user sudah menyatakan fakta, percayai dan cari penyebab di layer lain.
- Jalankan validator repo yang relevan (`npm run validate:*`) bila ada; laporkan hasilnya apa adanya.

## Peta singkat

- `electron/main/` — main process: `platformLogin/` (WA whatsapp-web.js + TG sidecar), `scraper/`, `automation/` (Job Queue, file lokal `userData/automation-job-queue.json`).
- `python-sidecar/` — Telethon + FastAPI di `127.0.0.1:8765`.
- `src/` — React UI; engine issue in-memory `src/lib/accountMasterDailyCompare.ts`; tulis scrape via RPC `rm_commit_account_scrape`.
- `supabase/migrations/` — skema; definisi terbaru RPC scrape/master ada di migrasi `040`.
