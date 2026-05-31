# APA YANG HARUS DIJALANKAN (TIDAK ADA LAINNYA)

## A. Di komputer (terminal)

```powershell
cd "c:\Work\Resource Management"
npm run setup
npm run dev
```

`.env` harus isi `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` dari project **bbuxfnchflhtulainndm**.

---

## B. Di Supabase (SQL Editor) — INI YANG BIKIN ERROR 404/400 HILANG

### Kalau app sudah pernah jalan (punya akun di dashboard)

Jalankan **2 file** ini saja, **urutan tetap**, **satu Run per file**:

| Urutan | File |
|--------|------|
| 1 | `supabase/migrations/020_fix_duplicate_active_sessions.sql` |
| 2 | `supabase/migrations/023_session_and_sync_logs_bundle.sql` |

**Jangan** jalankan: 017 (hapus semua data) kalau DB sudah jalan.

### Kalau database masih kosong / belum pernah 017

| Urutan | File |
|--------|------|
| 1 | `supabase/migrations/003_auth_login_rpc.sql` |
| 2 | `supabase/migrations/017_rm_full_reset.sql` |
| 3 | `supabase/migrations/020_fix_duplicate_active_sessions.sql` |
| 4 | `supabase/migrations/023_session_and_sync_logs_bundle.sql` |

### Cara Run (sama untuk setiap file)

1. Buka https://supabase.com → project **bbuxfnchflhtulainndm**
2. **SQL Editor** → **New query**
3. Buka file di VS Code/Cursor → **Ctrl+A** → **Ctrl+C**
4. Paste → klik **Run**
5. Harus hijau / Success → baru file berikutnya

---

## C. Cek sukses (copy paste, Run sekali)

```sql
SELECT 1 FROM resource_management_sync_activity_logs LIMIT 1;
```

Kalau **error relation does not exist** → file **023 belum sukses**.

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'resource_management_platform_session_logs'
  AND column_name = 'session_status';
```

Harus keluar **1 baris** `session_status`.

---

## D. Setelah SQL sukses

```powershell
npm run dev
```

Hard refresh app (Ctrl+Shift+R).

Console boleh **1x** warning kuning `[rm-schema]` sebelum 023; setelah 023 **tidak** boleh ada 404 `sync_activity_logs` dan 404 `rm_log_session_activity`.

---

## E. Bukan ini

| Salah | Benar |
|-------|--------|
| File 021/022 | **Sudah dihapus** — hanya **023** |
| `npm run migrate` | Tidak ada — SQL Editor manual |
| Hanya browser localhost | Harus **Electron** (`npm run dev`) untuk WA/TG |
