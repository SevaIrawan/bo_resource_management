# Reference — Task automation WA / TG untuk Job Queue

Dokumen ini **bukan** salinan script dari `learning Script Worker/`.  
Ini **sintesis referensi** dari tiga sumber:

| Sumber | Peran |
|--------|--------|
| **Internet / dokumentasi resmi** | Aturan platform, limit API, perilaku resmi WA Web & TG MTProto |
| **Library & Core API** | whatsapp-web.js, Telethon, core.telegram.org |
| **Folder learning** | Pola operasional yang sudah terbukti di lapangan — dijadikan **prinsip desain**, bukan kode yang di-copy |

## Isi

| File | Topik |
|------|--------|
| [01-platform-rules-global.md](./01-platform-rules-global.md) | ToS, risiko ban, rate limit WA & TG (fakta + mitigasi) |
| [01-pattern-telegram-master.md](./01-pattern-telegram-master.md) | Pola Script Worker Telegram Master |
| [02-pattern-whatsapp-wa-group-tool.md](./02-pattern-whatsapp-wa-group-tool.md) | Pola WA group tool (set photo / leave / delete) |
| [02-task-capabilities-reference.md](./02-task-capabilities-reference.md) | Set foto, leave, clear/delete — kemampuan teknis per platform |
| [03-map-ke-job-queue-rm.md](./03-map-ke-job-queue-rm.md) | Map learning → action Job Queue RM |

## Konteks project (kode aktual)

Job Queue actions di `src/types/automationJob.ts`:

- `create_group`, `set_group_photo`, `set_admin`, `join_by_invite_link`
- `leave_group`, `delete_group`, `exit_delete_group`

Settings Admin (`workerPlatformSettings`) → dibaca saat enqueue. Runner Electron/sidecar memakai payload job.

Folder `learning Script Worker/` = sumber pola lapangan (jangan dihapus sampai project 100% fixed); referensi desain dipakai lewat file di folder `learning/` ini.
