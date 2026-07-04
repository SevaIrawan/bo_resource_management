# Referensi — Aturan & risiko platform (riset global)

Sumber utama: [WhatsApp ToS](https://www.whatsapp.com/legal/terms-of-service/), [WhatsApp Business ToS](https://www.whatsapp.com/legal/business-terms/), [FAQ unauthorized automation](https://faq.whatsapp.com/5957850900902049/), [Telegram core API](https://core.telegram.org/), dokumentasi Telethon/grammY, artikel industri rate-limit 2025–2026.

---

## WhatsApp Web (unofficial — whatsapp-web.js)

### Fakta resmi

- Meta melarang **reverse engineering**, API tidak resmi, automation/bulk messaging pada consumer WhatsApp ([ToS § Harm To WhatsApp](https://www.whatsapp.com/legal/terms-of-service/)).
- [FAQ Meta](https://faq.whatsapp.com/5957850900902049/): bulk/automated messaging **selalu** pelanggaran; enforcement via teknologi + hukum.
- **WhatsApp Business Platform / Cloud API** adalah jalur resmi untuk automation bisnis — **bukan** yang dipakai project ini (kita pakai Web session + Puppeteer).

### Observasi industri (bukan kebijakan resmi Meta)

- Unofficial client (wwebjs, Baileys, WAHA): risiko ban **behavioral** — burst, pola waktu tetap, banyak join/leave/create dalam sesi singkat ([Achiya 2026](https://achiya-automation.com/en/blog/whatsapp-spam-detection-2026/)).
- Operasi **reaktif** (respon ke chat masuk) risiko lebih rendah vs **proaktif massal** ke kontak baru.
- Ban unofficial sering **permanen** tanpa appeal — berbeda dari restriction API resmi.

### Implikasi untuk task baru (reasoning)

| Task | Risiko relatif | Catatan |
|------|----------------|---------|
| Set foto grup | Rendah–sedang | Butuh admin; bukan spam pesan; tetap butuh delay |
| Leave grup | Sedang | Bukan messaging; burst leave tetap anomali |
| Clear/delete chat | Rendah–sedang | Lokal per device; volume tinggi tetap pola bot |

**Mitigasi wajib (selaras produk multi-akun):** jitter delay, cap per run/hari, lock per session, max concurrent browser, tidak parallel 2 Puppeteer per akun.

---

## Telegram (user session — MTProto / Telethon)

### Fakta teknis

- User account MTProto ≠ Bot API (@BotFather) — limit dan enforcement berbeda.
- Rate limit utama: **`FLOOD_WAIT_X`** — wajib tunggu X detik ([core.telegram.org errors](https://tgkit.io/telegram-error-codes/)).
- 2026+: variasi header (`FLOOD_PEER_WAIT`, `FLOOD_PREMIUM_WAIT`, `SLOWMODE_WAIT`) — perlu handling terpisah ([TG:ON MTProto changes](https://tg-on.com/articles/12-mtproto-changes.en.html)).
- Abaikan FloodWait berulang → eskalasi restriction/ban ([grammY flood docs](https://grammy.dev/advanced/flood) — berlaku prinsip untuk user MTProto juga).

### Observasi industri (praktik aman MTProto)

| Aksi | Pedoman kasar (bukan angka resmi TG) |
|------|--------------------------------------|
| Join grup | 10–20/hari akun baru; jeda 60–180s antar join |
| Leave grup | Sama — velocity join/leave dipantau |
| Set foto / edit admin | Lebih toleran jika jeda antar grup & bukan spam DM |
| Delete history | `DeleteHistory` / `delete_dialog` — FloodWait mungkin |

Sumber konsolidasi: [Telega rate limits 2026](https://telega.to/blog/telegram-rate-limits-for-automation-2026), [tg-mcp-guarded](https://github.com/matskevich/tg-mcp-guarded) (contoh circuit breaker + quota).

### ToS Telegram

- Telegram memoderasi spam via @SpamBot; laporan user → restriction sementara/permanen ([docs industri](https://docs.radist.online/en/our-products/integrations/telegram+kommo.com/telegram-restrictions-number-bans/)).
- Userbot untuk otomasi personal **umum dipakai** industri, tapi bulk spam tetap forbidden.

---

## Perbandingan singkat

| Aspek | WhatsApp Web | Telegram MTProto |
|-------|--------------|------------------|
| Protokol | DOM / Store injection | Native API |
| Sinyal limit | Disconnect, timeout, kadang ban tanpa warning | `FLOOD_WAIT_X` eksplisit |
| Leave sebagai creator | Bisa leave (admin lain ada) | **`UserCreatorError`** — tidak bisa leave biasa |
| Hapus grup untuk semua | Tidak native (leave saja) | `DeleteChannel` — owner, max ~1000 member |
| Clear history grup | Device-local (`clearMessages`) | `DeleteHistory(just_clear=True)` |
| Set foto | Admin + `setPicture` | Admin + `change_info` → `EditPhoto` |

---

## Kesimpulan referensi aturan

1. **Keduanya bukan “API resmi untuk automation massal”** — operasi harus **throttled, idempotent, reversible sebisa mungkin**.
2. Task destructive (delete) default **OFF** di settings RM — selaras risiko.
3. Desain Job Queue harus **human-like delay** + **partial success + retry state** — bukan sekadar panggil API.
