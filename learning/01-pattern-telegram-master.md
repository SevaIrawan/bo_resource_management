# Pola Telegram — `telegram-group-tool - MASTER`

Path: `learning Script Worker/telegram/Master/telegram-group-tool - MASTER/`

## Arsitektur umum

```
config.json          ← delay, group, admin, output
.env                 ← API_ID, API_HASH, SESSION_NAME, SESSION_DIR
output/result.csv    ← state antar script (bukan Excel)
human_delay.py       ← jitter, micro-pause, pause antar run/script
telethon_helpers.py  ← resolve entity + FloodWait cap
csv_schema.py        ← kolom standar + MAX_ADMIN_SLOTS=5
```

### Kolom CSV (`csv_schema.py`)

```
group_name, group_id, owner_user, admin_user, group_link,
admin_user2 .. admin_user5, invited_members
```

`group_id` = ID numerik channel (bukan `-100...`).

### config.json — bidang penting

| Bagian | Field | Dipakai script |
|--------|-------|----------------|
| `group` | `photo_path`, `total_to_create`, `per_run`, `hide_chat_history_for_members` | create, set_photo |
| `admin` | `targets[]`, `rights{}` | set_admin |
| `output` | `csv_file` | semua |
| `delay` | `between_groups_sec`, `set_photo_max_retry`, `resolve_entity_max_attempts`, `human.profile` | semua |

Shape ini sudah dipetakan di RM: `toTelegramLearningConfigShape()` → `workerPlatformSettings.ts`.

## human_delay.py — pola delay

- Profil: `safe` | `fast` | `off` di `delay.human.profile`
- `human_sleep(delay_cfg, "between_groups_sec")` — jitter ±50% + chance long pause
- `human_micro_pause` sebelum aksi Telethon
- `human_flood_wait_seconds` = `telethon_seconds + flood_wait_extra_sec` + jitter
- `pause_between_runs_minutes` — dipakai `run_create_until_done.py` antar batch create
- `pause_between_scripts_minutes` — jeda antar skrip (.bat: photo → admin → invite)

Port RM: `python-sidecar/telegram_human_delay.py` (subset; belum semua long-pause).

## set_group_photo.py — pola task

1. Baca `config.group.photo_path` (satu file untuk semua grup)
2. Baca CSV `output.csv` — loop tiap baris dengan `group_link`
3. **Skip** jika entity sudah punya photo (`has_group_photo`)
4. `resolve_channel_entity` → backfill `group_id` ke CSV jika kosong
5. Upload file sekali → `EditPhotoRequest` + `InputChatUploadedPhoto`
6. Retry FloodWait sampai `set_photo_max_retry`; stop run jika FloodWait > `max_floodwait_auto_sleep_sec`
7. `human_sleep` antar grup (`between_groups_sec`)
8. Tulis CSV incremental jika `group_id` ter-backfill

**Belum ada** di Master: `leave_groups.py` / `delete_groups.py` (hanya direferensikan di UI Admin RM sebagai rencana TG).

## set_admin.py — pola task (sudah di-port RM)

- Baca `admin.targets` dari config (max 5 slot selain owner)
- Filter baris CSV (semua / nama / rentang nomor)
- Per grup: resolve → cek sudah admin → `EditAdminRequest`
- Update kolom `admin_user`, `admin_user2`.. di CSV
- Delay `between_targets_sec` antar target

## create_groups.py + run_create_until_done.py

- `per_run` grup per eksekusi; `start_from` naik di config setelah selesai
- Loop luar `run_create_until_done` jeda `pause_between_runs_minutes` (45–65 menit safe)

## Urutan operasi tipikal (.bat learning)

1. `create_groups.py` / loop until done  
2. `set_group_photo.py`  
3. `set_admin.py`  
4. `invite_members.py`  
5. (join akun lain: folder `join member/tg-group-join-v2`)

Jeda antar skrip: `pause_between_scripts_minutes`.
