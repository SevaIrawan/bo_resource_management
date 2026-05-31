# Validasi fungsi & anti-deadlock

**Tanggal:** 2026-05-30  
**Build:** `npm run typecheck` + `npm run build:web` harus hijau sebelum uji manual.

---

## 1. Timeout & antrian (tidak boleh hang selamanya)

| Operasi | Batas waktu | File |
|---------|-------------|------|
| Probe Sync manual | 45s | `useAccountSyncFlow.ts` |
| Simpan session setelah login | 90s | `useAccountSyncFlow.ts` |
| Sync setelah login | 120s | `useAccountSyncFlow.ts` |
| Export Telegram | 60s (+ retry di Electron) | `persistLoginSession.ts` |
| QR login UI (TG) | 45s | `usePlatformLogin.ts` |
| QR login UI (WA) | 120s | `usePlatformLogin.ts` |
| Fase **Confirm login** | Tidak di-timeout ke error | `usePlatformLogin.ts` |
| Auto-sync per akun | 120s lalu skip | `useAutoAccountSync.ts` |
| WA init / login arm | 120s | `whatsapp.ts` |
| TG validate/count HTTP | 60–120s | Electron fetch |
| Restore disk WA | 22s race | `whatsapp.ts` |
| TG QR wait background | 180s | `telegram_login.py` |

---

## 2. Anti-deadlock

| Mekanisme | Perilaku |
|-----------|----------|
| `globalWaQueue` | Semua operasi WA (login, stop, scrape, validate strict) **antri satu per satu** |
| `withWaSessionLock` | Satu Puppeteer per `sessionId` |
| `runningRef` auto-sync | Satu siklus auto-sync; tidak overlap |
| `sessionReadyRef` login | Setelah QR sukses, tidak start login ulang |
| `loginHandledRef` modal | Tidak loop `onLoginSuccess` |
| TG `_finalize_qr_login_if_live` | Tidak menunggu `qr_login.wait()` jika `get_me` OK |
| Realtime probe 20s | **Dihapus** — tidak bentrok Chromium |

---

## 3. Checklist uji manual (Electron)

Jalankan: `npm run dev` → restart setelah setiap ubah main/python.

### Auth & load
- [ ] Login app (Supabase)
- [ ] Dashboard akun load tanpa `SCHEMA_OUTDATED`

### Telegram
- [ ] Sync akun logout → modal QR
- [ ] Scan + Confirm di HP → **Menyimpan session** → popup valid (bukan QR lagi)
- [ ] Card: session **valid**, angka grup terisi

### WhatsApp
- [ ] Sync logout → modal QR (atau phone)
- [ ] QR muncul &lt; 2 menit
- [ ] Setelah scan → simpan → valid

### Sync active
- [ ] Akun active + Sync → selesai &lt; 45s atau error jelas (bukan PROC SYNC menit-an)

### Scraper
- [ ] Run Scraper setelah valid → progress → selesai / error jelas

### Stabilitas
- [ ] Buka app 3 menit → session tidak hilang sendiri (tanpa logout di HP)
- [ ] Auto-sync **off** default — tidak ada aktivitas WA di background

---

## 4. Perintah verifikasi otomatis

```bash
npm run typecheck
npm run build:web
```

---

## 5. Batasan lingkungan (bukan bug kode)

- WhatsApp butuh Chromium lokal — PC lambat = QR lebih lama (maks ~120s lalu error).
- Telegram butuh Python sidecar + `TELEGRAM_API_ID/HASH` di `.env`.
- Supabase RLS/migrasi salah = error di load, bukan hang.
