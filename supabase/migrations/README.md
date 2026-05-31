# Supabase migrations

Migrasi di folder ini — jalankan urutan di `SUPABASE_RUNBOOK.md` / `JALANKAN_INI.md`.

**Panduan lengkap step-by-step:** baca `SUPABASE_RUNBOOK.md` di root project.

## Instal baru (kosong / boleh reset data RM)

| Urutan | File |
|--------|------|
| 1 | `003_auth_login_rpc.sql` |
| 2 | `017_rm_full_reset.sql` — **hapus semua data RM** |
| 3 | `020_fix_duplicate_active_sessions.sql` |
| 4 | `023_session_and_sync_logs_bundle.sql` — session log + sync activity (fix 404/400) |

## DB production yang sudah jalan (tanpa full reset)

| Urutan | File |
|--------|------|
| 1 | `018_drop_legacy_rm.sql` — **sekali saja** jika DB lama |
| 2 | `019_realtime_group_scrape_daily.sql` — opsional |
| 3 | `020_fix_duplicate_active_sessions.sql` |
| 4 | `023_session_and_sync_logs_bundle.sql` — **wajib** untuk auto-sync log |

**Jangan** jalankan `017` lagi.

Lalu di app: **scrape ulang** semua akun (rebuild master + ticket).

## Tabel (9)

| Tabel | Fungsi | Realtime |
|-------|--------|----------|
| `resource_management_brands` | Registry brand | Ya |
| `resource_management_messaging_accounts` | Akun WA/TG | Ya |
| `resource_management_platform_sessions` | Session aktif | Ya |
| `resource_management_platform_session_logs` | Audit login | — |
| `resource_management_scrape_runs` | Log scrape | Ya |
| `resource_management_group_scrape_daily` | Snapshot device per akun | Ya (019) |
| `resource_management_groups_master` | Join Group List per brand+platform | Ya |
| `resource_management_account_snapshots` | Metrik dashboard | Ya |
| `resource_management_tickets` | Issue (missing, admin, junk, …) | Ya |

**Dihapus dari skema:** `resource_management_brand_standard_groups` dan semua RPC pipeline `019` (`rm_clean_daily_and_sync_master`, dll.).

`public.users` — tabel existing, tidak dibuat di sini.
