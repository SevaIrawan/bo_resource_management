# Reference — Task automation WA / TG untuk Job Queue

Sintesis referensi desain Job Queue (**bukan** dependency runtime; implementasi = kode RM di `electron/` + `python-sidecar/`).

| Sumber | Peran |
|--------|--------|
| **Internet / dokumentasi resmi** | Aturan platform, limit API, perilaku resmi WA Web & TG MTProto |
| **Library & Core API** | whatsapp-web.js, Telethon, core.telegram.org |
| **Pola operasional lapangan** | Prinsip desain (delay, idempotent, batch) — sudah di-port ke kode RM |

## Isi

| File | Topik |
|------|--------|
| [01-platform-rules-global.md](./01-platform-rules-global.md) | ToS, risiko ban, rate limit WA & TG (fakta + mitigasi) |
| [01-pattern-telegram-master.md](./01-pattern-telegram-master.md) | Pola Telegram worker (config / delay / CSV) |
| [02-pattern-whatsapp-wa-group-tool.md](./02-pattern-whatsapp-wa-group-tool.md) | Pola WA (set photo / leave / delete) |
| [02-task-capabilities-reference.md](./02-task-capabilities-reference.md) | Set foto, leave, clear/delete — kemampuan teknis per platform |
| [03-map-ke-job-queue-rm.md](./03-map-ke-job-queue-rm.md) | Map pola → action Job Queue RM |

## Konteks project (kode aktual)

Job Queue actions di `src/types/automationJob.ts`:

- `create_group`, `set_group_photo`, `set_admin`, `join_by_invite_link`
- `leave_group`, `delete_group`, `exit_delete_group`

Settings Admin (`workerPlatformSettings`) → dibaca saat enqueue. Runner Electron/sidecar memakai payload job.
