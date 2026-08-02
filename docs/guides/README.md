# User guides — for your team (not Markdown)

**End users should open PDF or Word only** — normal documents (Confluence style).

| Language | PDF | Microsoft Word |
|----------|-----|----------------|
| English | [documents/EN/Resource-Management-User-Guide-EN.pdf](./documents/EN/Resource-Management-User-Guide-EN.pdf) | [documents/EN/Resource-Management-User-Guide-EN.docx](./documents/EN/Resource-Management-User-Guide-EN.docx) |
| 中文 | [documents/ZH/Resource-Management-User-Guide-ZH.pdf](./documents/ZH/Resource-Management-User-Guide-ZH.pdf) | [documents/ZH/Resource-Management-User-Guide-ZH.docx](./documents/ZH/Resource-Management-User-Guide-ZH.docx) |

You can also open the `.html` file in a browser — it looks like a Confluence page.

- **Panduan operasional R&M (ID, v1.0.35):** [PANDUAN-PENGGUNA-SIMPLE.md](../PANDUAN-PENGGUNA-SIMPLE.md) · [Confluence paste HTML](./Panduan-Group-Monitoring-v1.0.35-Confluence.html) — generate: `node scripts/build-panduan-confluence.mjs`
- **User Guide (EN, v1.0.35, Confluence paste):** [User-Guide-Group-Monitoring-v1.0.35-Confluence.html](./User-Guide-Group-Monitoring-v1.0.35-Confluence.html) — Account | Operations, CTA → Job Queue, scrape = grup real di akun

---

## IT only

- **Versi app saat ini:** `1.0.35` — setelah edit `_source/HANDBOOK-*.md`, rebuild: `npm run build:handbook-docs`
- Job Queue troubleshooting (dev/ops): [job-queue-troubleshooting-reference.md](./job-queue-troubleshooting-reference.md) · [Confluence paste HTML](./job-queue-troubleshooting-reference-Confluence.html)
- Edit source: `_source/HANDBOOK-en.md` / `_source/HANDBOOK-zh.md` (internal; users do not need these)
- Rebuild: `npm run build:handbook-docs`
- Output: `documents/EN/` and `documents/ZH/`

Do **not** send `.md` files to operations staff.
