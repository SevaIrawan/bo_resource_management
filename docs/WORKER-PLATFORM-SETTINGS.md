# Worker platform settings (Admin)

Policy storage untuk **Operations Job Queue** — **WhatsApp** dan **Telegram** terpisah. Dibaca saat **enqueue** job (bukan hanya scaffolding).

- Storage: `localStorage` — `rm_worker_settings_whatsapp`, `rm_worker_settings_telegram`
- UI: Admin / Settings — **WhatsApp worker** | **Telegram worker** (separate expand cards)
- Event: `rm-worker-settings-changed` after Save

Validate: `npm run validate:worker-platform-settings`

## What is configurable (by section)

### Standard (both platforms)

| Field | WA | TG | Safe default |
|-------|----|----|--------------|
| Human delay profile | ✓ | ✓ | `safe` |
| Max per run | ✓ | ✓ | WA 20, TG 30 |
| Delay between groups | ✓ | ✓ | WA 120s, TG 90s |
| Delay between targets | ✓ | ✓ | 30s |
| Delay after create | ✓ | ✓ | 90s |
| Flood-wait extra | ✓ | ✓ | 60s |
| Pause between runs (min range) | ✓ | ✓ | 45–65 min |
| Pause between scripts (min range) | ✓ | ✓ | 45–65 min |
| Max FloodWait auto-sleep | — | ✓ | 7200s |
| Set photo max retry | — | ✓ | 1 |

### Create group

| Field | WA | TG | Safe default |
|-------|----|----|--------------|
| Messages admins only | ✓ | — | **OFF** (customer 2-way; turn ON for stock NEW) |
| Add members admins only | ✓ | — | ON |
| Edit info admins only | ✓ | — | ON |
| Hide chat history for members | — | ✓ | ON |
| Admin rights (11 toggles) | — | ✓ | only post + invite |

### Invite by link (separate from standard)

| Field | WA | TG | Safe default |
|-------|----|----|--------------|
| Join delay min/max | ✓ | ✓ | 30–60s |
| Batch rest every N | ✓ | ✓ | 10 |
| Batch rest delay min/max | ✓ | ✓ | 180–360s |
| Max per run | ✓ | ✓ | 30 |
| Invite export retries | — | ✓ | 5 |
| Export retry delay | — | ✓ | 5s |

### Set admin

| Field | WA | TG | Safe default |
|-------|----|----|--------------|
| Delay between targets | ✓ | ✓ | 30s |
| Max admin slots | — | ✓ | 5 |
| Resolve entity attempts | — | ✓ | 3 |

WA promote has no granular rights in whatsapp-web.js — only delay.

### Leave & delete

| Field | WA | TG | Safe default |
|-------|----|----|--------------|
| Allow leave job | ✓ | ✓ | ON |
| Allow delete job | ✓ | ✓ | **OFF** |
| Require owner for delete | — | ✓ | ON |
| Clear chat on delete | ✓ | — | OFF |
| Delay between groups | ✓ | ✓ | 60s |

## Reference

- TG: `learning Script Worker/telegram/Master/` + `human_delay.py`
- WA: whatsapp-web.js `GroupChat` — 3 group permission toggles only

## Wire to worker

Settings are read in the renderer at **enqueue** time via `readWhatsAppWorkerSettings()` / `readTelegramWorkerSettings()`.

| Section | Wired to |
|---------|----------|
| Standard delays + human profile jitter | create_group batch, set_admin between targets, TG flood-wait |
| Create group toggles | **Defaults only** — modal SETUP seeds from Settings but enqueues **per-job draft** in `payload.createGroupSettings` (`buildCreateGroupEnqueueFromJobDraft`) |
| Invite by link | join throttle (`invite_delay_*`, batch rest), `maxPerRun` at enqueue (auto-split chunks) |
| Set admin | `betweenTargetsSec`, `maxAdminSlots`, `resolveEntityMaxAttempts` (TG) |
| Leave & delete | exit/delete job guards + delays at enqueue |

Runner (Electron/TG) reads **frozen job payload** — not live Settings after enqueue.

Export shapes: `toTelegramLearningConfigShape()` / `toWhatsAppWorkerConfigShape()` for reference scripts.
