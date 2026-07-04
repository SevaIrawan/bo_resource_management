# Referensi — Kemampuan teknis per task (riset global)

Sumber: [wwebjs GroupChat](https://docs.wwebjs.dev/GroupChat.html), [wwebjs Chat](https://docs.wwebjs.dev/structures_Chat.js.html), [Telethon client](https://docs.telethon.dev/en/stable/modules/client.html), [channels.editPhoto](https://core.telegram.org/method/channels.editPhoto), [channels.leaveChannel](https://core.telegram.org/method/channels.leaveChannel), [messages.deleteHistory](https://core.telegram.org/method/messages.deleteHistory), [channels.deleteChannel](https://core.telegram.org/method/channels.deleteChannel).

---

## 1. Set foto grup (admin)

### WhatsApp

| Item | Detail |
|------|--------|
| API | `GroupChat.setPicture(MessageMedia)` |
| Prasyarat | Admin grup; jika `infoAdminsOnly`/`restrict` aktif, hanya admin ubah foto |
| Gagal | Return `false` atau `ServerStatusCodeError` — bukan admin / `canSet()` false |
| Media | File path, URL, atau base64 via `MessageMedia` |

### Telegram

| Item | Detail |
|------|--------|
| API supergroup | `channels.EditPhoto` + `InputChatUploadedPhoto` |
| API basic group | `messages.EditChatPhoto` (legacy, bukan megagroup) |
| Prasyarat | Admin dengan **`change_info`** |
| Error umum | `ChatAdminRequiredError`, `PhotoInvalidError`, `PhotoCropSizeSmall`, `FloodWaitError` |

### Referensi desain (bukan kode learning)

- Satu asset foto per brand/batch (bukan per grup beda file kecuali requirement produk).
- **Skip idempotent** jika grup sudah punya foto (hindari API call sia-sia).
- Retry terbatas pada FloodWait dengan cap auto-sleep.

---

## 2. Leave group

### WhatsApp

| Item | Detail |
|------|--------|
| API | `GroupChat.leave()` |
| Efek | Anda keluar; grup tetap ada untuk anggota lain |
| Bukan admin? | Tetap bisa leave |
| Chat setelah leave | Bisa hilang dari daftar atau tetap ada (versi WA Web) |

### Telegram

| Item | Detail |
|------|--------|
| API | `channels.LeaveChannel` atau `client.delete_dialog(entity)` |
| Creator | **`UserCreatorError`** — harus transfer owner atau `DeleteChannel` |
| Sudah keluar | `UserNotParticipantError` → treat as success (idempotent) |
| Legacy basic chat | `DeleteChatUserRequest` (me) |

### Referensi desain

- Status per grup: `left` | `not_found` | `error` | `skipped_creator` (TG).
- Retry hanya pada `error`, bukan `not_found` / `left`.

---

## 3. Clear history & delete chat

Definisi operasi (penting untuk UI):

| Mode | WA | TG | Dampak orang lain |
|------|----|----|-------------------|
| Clear history | `Chat.clearMessages()` | `DeleteHistory(just_clear=True)` | Tidak (grup) |
| Delete dari daftar | `Chat.delete()` | `delete_dialog()` | Tidak (grup) |
| Hapus grup (semua) | ❌ tidak ada | `DeleteChannel` | Ya — grup hilang |

### WhatsApp urutan aman (dari praktik lapangan + wwebjs)

1. `getChatById` → optional `fetchMessages({limit:1})` sync
2. `unarchive()` jika archived
3. `clearMessages()` (opsional, flag settings)
4. `delete()` — hapus chat dari perangkat

### Telegram

- Clear saja: `DeleteHistory(peer, max_id=0, just_clear=True)`
- Leave + hilang dari dialog: `delete_dialog`
- Hapus channel: `DeleteChannel` — **owner only**, `ChannelTooLargeError` jika >~1000 member

### Referensi desain

- **Dua fase** leave dulu, clear/delete kemudian (dependency eksplisit).
- TG delete grup terpisah dari leave — guard `require_owner`.
- Default RM: `deleteEnabled: false`.

---

## Matrix feasibility teknis

| Task | WA | TG | Blocker utama |
|------|----|----|---------------|
| Set foto | ✅ | ✅ | Admin rights, file foto |
| Leave | ✅ | ✅ | TG creator |
| Clear history | ✅ | ✅ | FloodWait TG |
| Delete grup | ❌ | ✅ owner | TG size limit |
