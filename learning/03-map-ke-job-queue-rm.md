# Map pola operasional → Job Queue Resource Management

## Sudah di-port

| Pola / script | RM action | Implementasi |
|---------------|-----------|----------------|
| `create_groups.py` + `run_create_until_done` | `create_group` | TG sidecar + `waAutomation` batch `perRun` / `pause_between_runs` |
| `set_admin.py` | `set_admin` | `payload.groups[]` + `targets` + delay |
| `join_groups.py` (folder join member) | `join_by_invite_link` | throttle invite + batch rest |
| `set_group_photo.py` / `set-group-photo.js` | `set_group_photo` | follow-up dari VIEW create + brand photo IPC |
| `leave-groups.js` + TG LeaveChannel | `leave_group` / `exit_delete_group` | leave SETUP → optional auto-enqueue delete |
| delete chat / DeleteChannel | `delete_group` | policy Settings `deleteEnabled` (default OFF) |

Pola yang **harus** diikuti untuk task:

1. Satu job = satu akun (`sessionId`) + list grup (`payload.groups[]`) — batch besar **auto-split ≤30** (v1.0.30)
2. Delay dari `readWhatsAppWorkerSettings()` / `readTelegramWorkerSettings()` saat enqueue
3. Progress `onProgress(i, total, groupName)`
4. Partial fail: `success/total` → job failed jika tidak full (runner join/set_admin)
5. Idempotent skip — status kolom / sudah ada photo

## Payload & settings (ringkas)

### set_group_photo

- `photoPath` / brand JPG via IPC `brandGroupPhoto`
- Skip jika sudah ada foto (idempotent)
- Settings: `standard.setPhotoMaxRetry`, `betweenGroupsSec`

### leave_group / exit_delete_group

- Status per grup: left | not_found | error | skipped_creator (TG)
- Settings: `leaveDelete.leaveEnabled`, `betweenGroupsSec`
- WA leave dan delete = fase terpisah (atau exit → auto delete jika policy ON)

### delete_group

- TG owner: `DeleteChannel` (guard size / owner)
- WA: tidak ada hapus grup untuk semua — leave + optional clear chat
- Settings: `deleteEnabled` (default false), `requireOwnerForDelete` (TG)

## Post-job wajib (RM production)

Script lapangan sering pakai Excel/CSV state lokal. RM pakai Supabase:

Setelah leave/delete/create/join sukses → **scrape akun** (atau patch realtime) → grid & Issue refresh via `patchAccountGridAfterDailyWrite` + `scheduleMonitoringReload`.

## Human delay vs kode

Port RM: `python-sidecar/telegram_human_delay.py` + worker settings — **subset** jitter + FloodWait. Long-pause penuh boleh dilengkapi jika FloodWait sering di lapangan — jangan potong delay default tanpa bukti.
