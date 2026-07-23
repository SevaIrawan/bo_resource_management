# Bundel installer — satu paket, user klik install

Setelah install, **operator tidak** perlu menginstal Chrome, Python, Node, atau mengisi `.env` manual.

## Yang terbundel (Win / Mac / Linux)

| Komponen | Lokasi setelah install | Fungsi |
|----------|------------------------|--------|
| **Chrome (Puppeteer)** | `resources/puppeteer-chrome/chrome/...` | WhatsApp Web / QR login |
| **Sidecar Telegram** | `resources/sidecar/rm-telegram-sidecar(.exe)` | Login & sync Telegram |
| **org-default.env** | `resources/org-default.env` | Supabase + Telegram API (dari `.env` IT saat build) |
| **env-template.env** | `resources/env-template.env` | Referensi / perbaikan `.env` user |
| **whatsapp-web.js + puppeteer** | `app.asar.unpacked/node_modules/...` | Runtime WA (asarUnpack) |
| **Aplikasi React + Electron** | `app.asar` + `dist` | UI, monitoring, Operations |

## Build (IT)

```bash
# Lengkapi .env organisasi, lalu per OS di runner yang sama:
npm run build:installer:win    # Windows runner / PC Windows
npm run build:installer:mac    # macOS runner
npm run build:installer:linux  # Linux runner

# CI: workflow Release multi-platform (matrix)
```

Setiap build menjalankan:

1. Unduh Chrome + build sidecar PyInstaller  
2. Salin `.env` → `resources/org-default.env`  
3. `validate-installer-package` + `validate-installer-runtime` (QR, skala hingga 6000 grup)  
4. Vite + electron-builder `--publish never`  
5. **`validate-release-artifact`** — scan folder `release/` bahwa bundel benar-benar masuk installer  

## Isu yang dicegah validator

| Isu user | Pencegahan |
|----------|------------|
| QR tidak tampil | Chrome terbundel + `validate-wa-qr-login-flow` + timeout UI 150s/180s |
| Timeout sync akun besar | `DEVICE_GROUP_TARGET_MAX=6000`, timeout dinamis + idle watchdog (`validate-device-group-scale`) |
| Issue KPI tidak sinkron grid | Engine `accountMasterDailyCompare` + `validate:gm-master-contract` |
| Config Supabase hilang | `org-default.env` wajib di build + post-build scan |
| Telegram gagal | Sidecar binary per OS di `extraResources` |

## Cek manual setelah install (opsional IT)

Di folder instalasi → `resources/` harus ada:

- `puppeteer-chrome/chrome/...` (executable Chrome)  
- `sidecar/rm-telegram-sidecar` atau `.exe`  
- `org-default.env`  

## Publish ke user

1. Artefak dari CI: `release-win`, `release-mac`, `release-linux`  
2. Upload ke GitHub Release atau distribusi internal  
3. User: jalankan installer → buka app → Sync / login QR  
