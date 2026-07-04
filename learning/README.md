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
| [02-task-capabilities-reference.md](./02-task-capabilities-reference.md) | Set foto admin, leave, clear/delete — kemampuan teknis per platform |
| [03-learning-patterns-reference.md](./03-learning-patterns-reference.md) | Prinsip dari Script Worker → desain Job Queue RM |
| [04-job-queue-design-reference.md](./04-job-queue-design-reference.md) | Rekomendasi action, payload, state — feasibility |

## Konteks project

Job Queue existing: `create_group`, `set_admin`, `join_by_invite_link`  
Target baru: `set_group_photo`, `leave_group`, `clear_group_chat` (± `delete_group` TG owner)

Settings Admin sudah ada (`workerPlatformSettings.leaveDelete`) — runner belum.
