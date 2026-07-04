# Map pola learning → Job Queue Resource Management

## Sudah di-port (ikuti pola learning)

| Learning | RM action | Implementasi |
|----------|-----------|----------------|
| `create_groups.py` + `run_create_until_done` | `create_group` | TG sidecar + `waAutomation` batch `perRun` / `pause_between_runs` |
| `set_admin.py` | `set_admin` | `payload.groups[]` + `targets` + delay |
| `join_groups.py` (folder join member) | `join_by_invite_link` | throttle invite + batch rest |

Pola yang **harus** diikuti untuk task baru:

1. Satu job = satu akun (`sessionId`) + list grup (`payload.groups[]`)
2. Delay dari `readWhatsAppWorkerSettings()` / `readTelegramWorkerSettings()` saat enqueue
3. Progress `onProgress(i, total, groupName)`
4. Partial fail: `success/total` → job failed jika tidak full (runner join/set_admin)
5. Idempotent skip — lihat learning (status kolom / sudah ada photo)

## Belum di-port — dari learning Script Worker

### set_group_photo

| Platform | Sumber learning | Port ke |
|----------|-----------------|---------|
| TG | `set_group_photo.py` | `telegram_automation.run_set_group_photo` + route sidecar |
| WA | `set-group-photo.js` | `waAutomation.runSetGroupPhoto` |

Payload tambahan:
- `photoPath` atau `photoUrl` (TG: `config.group.photo_path`; WA: `photos/groups/photo.*`)
- Skip jika sudah ada foto (TG: `has_group_photo`; WA: kolom status — di RM bisa cek scrape atau flag job row)

Settings: `standard.setPhotoMaxRetry`, `betweenGroupsSec`

### leave_group

| Platform | Sumber learning | Port ke |
|----------|-----------------|---------|
| WA | `leave-groups.js` | `chat.leave()` + status Left/NotFound/Error |
| TG | *belum ada script* | `LeaveChannelRequest` / `delete_dialog` — tiru pola delay TG Master |

Settings: `leaveDelete.leaveEnabled`, `betweenGroupsSec`

Status idempotent learning WA:
- Skip `Left`, `Not Found`
- Retry `Error` atau kosong

### clear / delete chat

| Platform | Sumber learning | Port ke |
|----------|-----------------|---------|
| WA | `delete-group-chats.js` | Hanya jika sudah leave: `clearMessages` → `delete` |
| TG | *belum ada script* | `DeleteHistory` + optional `DeleteChannel` jika owner |

Settings:
- `deleteEnabled` (default false)
- `clearChatHistoryOnDelete` (WA)
- `requireOwnerForDelete` (TG delete channel)

**Penting dari learning:** WA leave dan delete adalah **2 action terpisah** (atau 1 job dengan step 2 phase + state per grup).

## Rekomendasi action Job Queue (selaras learning)

```
set_group_photo     — 1 phase, skip if has photo
leave_group         — mirror leave-groups.js status machine
clear_group_chat    — hanya baris yang status leave=ok (WA) atau equivalent TG
delete_group        — TG owner only; WA tidak ada (leave saja)
```

Atau gabung `leave_group` + optional flag `clearChatAfterLeave` (WA `clearChatHistoryOnDelete`).

## Post-job wajib (RM production — di luar learning scripts)

Learning pakai Excel/CSV state lokal. RM pakai Supabase:

Setelah leave/delete sukses → **scrape akun** → grid & Issue refresh via realtime + `patchAccountGridAfterDailyWrite`.

## Feasibility

**Ya** — asalkan implementasi **clone pola learning**, bukan API generik dari internet:

- TG set photo: copy logic `set_group_photo.py` (sudah hampir sama dengan yang perlu di sidecar)
- WA leave/delete: copy `leave-groups.js` + `delete-group-chats.js` verbatim ke `waAutomation.ts`
- TG leave/delete: tulis baru mengikuti `human_delay` + `resolve_channel_entity` Master (belum ada referensi .py)

Estimasi tetap ~1 sprint kecil jika mengikuti file learning yang sudah ada.
