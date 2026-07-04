# Pola WhatsApp — `wa-group-tool_fixed`

Path contoh: `learning Script Worker/wasapp/wa-group-tool_fixed - FWSG - Cassey/`

## Modul bersama

| File | Peran |
|------|--------|
| `wa-client-factory.js` | Satu client wwebjs per proses |
| `wa-safety-defaults.js` | Delay/jitter default per risiko skrip |
| `wa-helpers.js` | `humanDelay`, `withTimeout`, Excel `setCell`, `resolveGroup` |
| `wa-init-retry.js` | Init dengan retry |
| `--dry-run` / `--yes` | Wajib konfirmasi sebelum mutasi |

## Risiko & delay default (`wa-safety-defaults.js`)

| Skrip | Delay | Jitter | Catatan risiko |
|-------|-------|--------|----------------|
| `set-group-photo.js` | 480000 ms | 240000 ms | sedang |
| `leave-groups.js` | 8000 ms | 5000 ms | sedang–tinggi |
| `delete-group-chats.js` | 6500 ms | 4500 ms | sedang–tinggi |
| `set-admin.js` | 14000 ms | 9000 ms | tinggi |
| `join-by-link.js` | 120000 ms | 90000 ms | sangat tinggi |

RM `workerPlatformSettings` memakai detik (120s between groups WA) — skala berbeda tapi prinsip sama: **jitter + cap per run**.

## set-group-photo.js

**Input:** Excel output `create-groups.js` (sheet `groups`)  
**Foto:** `photos/groups/photo.jpg` — nama file wajib `photo.*` (satu file semua grup)

**Skip:** kolom `Photo Status` = `done`  
**Output:** `Photo Status` + `Photo Detail` ditulis per baris

**Eksekusi:**
```javascript
const chat = await resolveGroup(client, groupId, groupName, OP_TIMEOUT);
const media = MessageMedia.fromFilePath(photoPath);
const ok = await withTimeout(chat.setPicture(media), OP_TIMEOUT, 'setPicture');
```

**Safety:** `maxPerRun` (25), `maxPerDay` (50), daily state file, shuffle opsional, stop jika rate limit.

## leave-groups.js — pola leave

**Input:** Excel sheet `leave_group`  
**Kolom:** A=Group ID, B=Group Name, **E=Status (output)**

| Status | Perilaku |
|--------|----------|
| `Left` | skip |
| `Not Found` | skip (final) |
| `Error` atau kosong | **proses / retry** |

**Eksekusi:**
```javascript
const chat = await client.getChatById(groupId);
await chat.leave();
// status → Left | Not Found | Error
```

Simpan Excel **per baris** (crash-safe). `humanDelay(DELAY_MS, JITTER_MS)` antar grup.

## delete-group-chats.js — pola clear + delete (2 langkah setelah leave)

**Syarat proses:** kolom E `Status` = **`Left`** (harus leave dulu)  
**Output:** kolom F `Clean` = `Deleted` | `Not Found` | `Error`

**Urutan wipe:**
1. `getChatById`
2. `fetchMessages({ limit: 1 })` — sync ringan
3. `unarchive()` jika perlu
4. `clearMessages()`
5. `sleep(900)`
6. `delete()` — hapus chat dari daftar

Skip jika `Clean` = `Deleted` atau `Not Found`.

**Pola bisnis:** leave dan delete adalah **dua job terpisah** dengan state machine di Excel — bukan satu tombol.

## Mapping ke RM Admin settings

| Learning WA | `WorkerLeaveDeleteSettings` |
|-------------|----------------------------|
| leave-groups enabled | `leaveEnabled` |
| delete-group-chats | `deleteEnabled` (default OFF) |
| clearMessages sebelum delete | `clearChatHistoryOnDelete` |
| between groups delay | `betweenGroupsSec` (60s default) |

TG `delete.require_owner` di config shape — untuk `DeleteChannel` (script TG belum ada di folder).
