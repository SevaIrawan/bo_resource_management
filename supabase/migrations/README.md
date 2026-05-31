# Supabase migrations

Hanya **3 file** — migrasi incremental lama sudah dihapus agar tidak jadi boomerang.

## Instal baru (kosong / boleh reset data RM)

| Urutan | File |
|--------|------|
| 1 | `003_auth_login_rpc.sql` — RLS login `public.users` |
| 2 | `017_rm_full_reset.sql` — **9 tabel RM** + master brand + RPC + Realtime |

**Peringatan:** `017` menghapus semua data `resource_management_*`. `public.users` tidak disentuh.

## DB production yang sudah jalan (tanpa full reset)

Jalankan **sekali**:

| File | Fungsi |
|------|--------|
| `018_drop_legacy_rm.sql` | Hapus RPC/trigger/tabel lama + upgrade master brand + ticket types |

Lalu di app: **scrape ulang** semua akun (rebuild master + ticket).

## Tabel (9)

| Tabel | Fungsi | Realtime |
|-------|--------|----------|
| `resource_management_brands` | Registry brand | Ya |
| `resource_management_messaging_accounts` | Akun WA/TG | Ya |
| `resource_management_platform_sessions` | Session aktif | Ya |
| `resource_management_platform_session_logs` | Audit login | — |
| `resource_management_scrape_runs` | Log scrape | Ya |
| `resource_management_group_scrape_daily` | Snapshot device per akun | — |
| `resource_management_groups_master` | Join Group List per brand+platform | Ya |
| `resource_management_account_snapshots` | Metrik dashboard | Ya |
| `resource_management_tickets` | Issue (missing, admin, junk, …) | Ya |

**Dihapus dari skema:** `resource_management_brand_standard_groups` dan semua RPC pipeline `019` (`rm_clean_daily_and_sync_master`, dll.).

`public.users` — tabel existing, tidak dibuat di sini.
