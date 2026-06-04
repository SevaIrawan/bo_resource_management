# Install Resource Management (macOS) — Tim Internal

> **Status:** Skrip build & konfigurasi electron-builder **sudah ada** (v1.0.4+).  
> Installer Mac harus di-build di **mesin macOS** (atau GitHub Actions). Lihat [docs/PLAN-CROSS-PLATFORM-INSTALLERS.md](./docs/PLAN-CROSS-PLATFORM-INSTALLERS.md).

Dokumen resmi lengkap: **[PROJECT.md](./PROJECT.md)**

---

## Tim IT — build & rilis (Mac)

**Prasyarat:** Mac dengan Node.js LTS, Python 3, `.env` lengkap di root project, Apple Developer ID (disarankan untuk notarization).

```bash
cd "/path/to/Resource Management"
npm install
npm run build:installer:mac   # tersedia setelah implementasi rencana cross-platform
```

Output (contoh): `release/Resource Management-1.1.0.dmg`

**Update kode ke semua Mac operator:** naikkan `version` di `package.json` → publish GitHub Release (artefak Mac + `latest-mac.yml`) → app unduh otomatis → **Restart**.

---

## Tim operasional — Mac baru

1. Terima **`Resource Management-x.x.x.dmg`** dari IT — **bukan** file `.exe`
2. Buka DMG → drag **Resource Management** ke Applications
3. Jika macOS memblokir app:
   - **Production (notarized):** buka normal
   - **Pilot internal:** klik kanan app → **Open** → konfirmasi sekali
4. Buka app → login **username/password**
5. Tambah akun → login **WhatsApp/Telegram** (QR di HP marketing)

**Tidak perlu** isi `.env` — konfigurasi organisasi sudah terbundel saat build IT.

---

## Lokasi data di Mac

| Item | Path |
|------|------|
| Config & sesi | `~/Library/Application Support/Resource Management/` |
| Sesi WhatsApp | `.../wa-sessions/` |
| File `.env` salinan | `.../Resource Management/.env` |

Admin → **Buka folder config** di app membuka folder di atas.

---

## Troubleshooting singkat

| Gejala | Langkah |
|--------|---------|
| "App is damaged" | Install ulang dari DMG IT; pastikan notarized build |
| Telegram sidecar error | Tutup app sepenuhnya → buka lagi; cek `.env` terbundel |
| WhatsApp QR tidak muncul | Tunggu hingga 3 menit; pastikan Chrome terbundel (install ulang) |
| Auto-update gagal | Cek koneksi internet; install manual dari GitHub Release |

---

*Implementasi installer Mac mengikuti [docs/PLAN-CROSS-PLATFORM-INSTALLERS.md](./docs/PLAN-CROSS-PLATFORM-INSTALLERS.md).*
