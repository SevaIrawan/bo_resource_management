# RUNBOOK Supabase — ikuti urutan ini saja

Dokumen ini **satu-satunya urutan** untuk database. Jangan jalankan file migrasi acak-acakan.

Project Supabase kamu (dari error console): **bbuxfnchflhtulainndm**

---

## Langkah 0 — Cek kamu masuk skenario mana

Buka Supabase → **SQL Editor** → jalankan:

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'resource_management_messaging_accounts'
) AS sudah_punya_tabel_rm;
```

| Hasil `sudah_punya_tabel_rm` | Artinya | Lanjut ke |
|------------------------------|---------|-----------|
| `false` | DB belum punya tabel RM | **BAGIAN A** |
| `true` | DB sudah dipakai app ini | **BAGIAN B** |

---

## BAGIAN A — Instal baru (belum ada tabel RM)

Jalankan **berurutan**, satu file = satu kali **Run**, tunggu sukses sebelum file berikutnya.

| # | File (copy semua isi → SQL Editor → Run) |
|---|------------------------------------------|
| 1 | `supabase/migrations/003_auth_login_rpc.sql` |
| 2 | `supabase/migrations/017_rm_full_reset.sql` |
| 3 | `supabase/migrations/020_fix_duplicate_active_sessions.sql` |
| 4 | `supabase/migrations/023_session_and_sync_logs_bundle.sql` |
| 5 | `supabase/migrations/030_groups_master_member_counts.sql` — count di `groups_master` + RPC rebuild |

**Jangan jalankan:** 018, 019 (kecuali skenario B).

---

## BAGIAN B — DB sudah jalan (production / sudah pernah pakai app)

Jalankan **berurutan**:

| # | File | Kapan |
|---|------|--------|
| 1 | `018_drop_legacy_rm.sql` | **Sekali saja** jika belum pernah (DB lama sebelum 017) |
| 2 | `019_realtime_group_scrape_daily.sql` | Opsional; aman di-run jika ragu |
| 3 | `020_fix_duplicate_active_sessions.sql` | Wajib |
| 4 | `023_session_and_sync_logs_bundle.sql` | **Wajib** — perbaiki error 404/400 di console |
| 5 | `030_groups_master_member_counts.sql` | **Wajib** — `owner_count`, `admin_count`, `member_count`, `member_non_admin` di master + RPC rebuild |

**Jangan jalankan:** 017 lagi (akan **hapus semua data** RM).

Setelah 018: di app, **scrape ulang** tiap akun (rebuild master + ticket).

---

## Verifikasi wajib (setelah semua SQL di atas)

Jalankan di SQL Editor:

```sql
-- Harus 9 baris (tabel RM inti)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'resource_management_%'
ORDER BY 1;

-- Harus ada kolom ini (bukan 400 di app)
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'resource_management_platform_session_logs'
  AND column_name IN ('session_status', 'updated_at');

-- Harus ada tabel ini (bukan 404 di app)
SELECT 1 FROM resource_management_sync_activity_logs LIMIT 1;

-- Harus ada kolom count di groups_master (bukan 42703 di app setelah scrape)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'resource_management_groups_master'
  AND column_name IN ('owner_count', 'admin_count', 'member_count', 'member_non_admin')
ORDER BY 1;
```

Harus **4 baris** kolom count. Kalau kosong → file **030** belum di-run.

Kalau query ketiga error **relation does not exist** → file **023** belum di-run atau gagal.

---

## Langkah app (setelah Supabase sukses)

```powershell
cd "c:\Work\Resource Management"
copy .env.example .env
# Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY dari Supabase → Settings → API
npm run setup
npm run dev
```

Buka app lewat **Electron** (`npm run dev`), bukan hanya browser — scraper WA/TG butuh desktop.

---

## Error console yang kamu lihat → penyebab → fix

| Error | Penyebab | Fix |
|-------|----------|-----|
| `404` … `sync_activity_logs` | Tabel belum ada | Run **023** |
| `400` … `session_status` | Kolom belum ada | Run **023** |
| `RM_SCHEMA` / load akun gagal | 017/003 belum atau salah project | Ikuti **BAGIAN A** atau **B** dari awal |

---

## Yang TIDAK perlu dijalankan

- Migrasi `001–011`, `021`, `022` — **tidak ada** di repo; hanya **023** untuk log/sync.
- `npm run migrate` — **tidak ada** di project ini; semua lewat SQL Editor manual.

---

## Kalau Run SQL gagal

Copy **seluruh teks error merah** dari SQL Editor.

- Error `relation … does not exist` pada langkah 020/023 → belum jalankan **017** (atau salah project Supabase di `.env`).
- Error constraint / policy → kirim teks error; jangan ulang run file yang sama berkali-kali tanpa tahu pesannya.
