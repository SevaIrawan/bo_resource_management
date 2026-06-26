# Supabase migrations

Migrasi di folder ini — jalankan urutan di `SUPABASE_RUNBOOK.md` / `JALANKAN_INI.md`.

**Panduan lengkap step-by-step:** baca `SUPABASE_RUNBOOK.md` di root project.

## Instal baru (kosong / boleh reset data RM)

| Urutan | File |
|--------|------|
| 1 | `003_auth_login_rpc.sql` |
| 2 | `017_rm_full_reset.sql` — **hapus semua data RM** |
| 3 | `020_fix_duplicate_active_sessions.sql` |
| 4 | `023_session_and_sync_logs_bundle.sql` |
| 5 | `030_groups_master_member_counts.sql` |
| 6 | `032_rm_replace_account_scrape_daily.sql` |
| 7 | `035_rm_fix_master_pk_and_scrape_commit.sql` |
| 8 | **`036_rm_master_pk_brand_platform_group_id.sql`** — PK `(brand, platform, group_id)` |

## DB production yang sudah jalan (tanpa full reset)

| Urutan | File |
|--------|------|
| 1 | `018_drop_legacy_rm.sql` — **sekali saja** jika DB lama |
| 2 | `019_realtime_group_scrape_daily.sql` — opsional |
| 3 | `020` … `023` — wajib |
| 4 | `030` … `032` — wajib |
| 5 | `033` / `034` — drop ticket (jika masih ada) |
| 6 | `035` — RPC scrape atomik |
| 7 | **`036`** — **wajib** (fix duplicate key master saat scrape) |

**Jangan** jalankan `017` lagi.

Lalu di app: **scrape ulang** semua akun.

## Tabel inti

| Tabel | Fungsi | Realtime |
|-------|--------|----------|
| `resource_management_brands` | Registry brand | Ya |
| `resource_management_messaging_accounts` | Akun WA/TG | Ya |
| `resource_management_platform_sessions` | Session aktif | Ya |
| `resource_management_platform_session_logs` | Audit login | — |
| `resource_management_scrape_runs` | Log scrape | Ya |
| `resource_management_group_scrape_daily` | Snapshot device per akun | Ya |
| `resource_management_groups_master` | Master per brand+platform; **PK = (brand, platform, group_id)** | Ya |
| `resource_management_account_snapshots` | Metrik dashboard | Ya |
| `resource_management_sync_activity_logs` | Log sync manual | — |

`public.users` — tabel existing, tidak dibuat di sini.
