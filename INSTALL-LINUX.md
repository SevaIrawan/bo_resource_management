# Install Resource Management (Linux) — Tim Internal

> **Status:** Skrip build & konfigurasi electron-builder **sudah ada** (v1.0.4+). Versi produksi terbaru: **1.0.37**.  
> Installer Linux harus di-build di **mesin Linux** (atau GitHub Actions). Lihat [docs/RELEASE-CI.md](./docs/RELEASE-CI.md).

Dokumen resmi lengkap: **[PROJECT.md](./PROJECT.md)**

---

## Tim IT — build & rilis (Linux)

**Prasyarat:** Ubuntu 22.04+ (atau setara), Node.js LTS, Python 3, `.env` lengkap di root project.

```bash
cd "/path/to/Resource Management"
npm install
npm run build:installer:linux
```

Output (contoh):

- `release/Resource.Management-1.0.37.AppImage` (nama artefak mengikuti `package.json` / CI)

**Update kode:** naikkan `version` → GitHub Release dengan `latest-linux.yml` → operator **Restart** app.

---

## Tim operasional — Linux baru

### Opsi A — AppImage (disarankan, portable)

```bash
chmod +x "Resource.Management-1.0.37.AppImage"
./Resource.Management-1.0.37.AppImage
```

Opsional: integrasi menu desktop sesuai kebijakan IT (AppImageLauncher, dll.).

### Format rilis Linux

Produksi memakai **AppImage** (lihat [docs/RELEASE-CI.md](./docs/RELEASE-CI.md)). Paket `.deb` tidak menjadi artefak rilis utama.

---

## Setelah install

1. Login **username/password** (dari IT)
2. Tambah akun marketing → **WhatsApp/Telegram** (QR di HP)
3. **Tidak perlu** isi `.env` manual

---

## Lokasi data di Linux

| Item | Path |
|------|------|
| Config & sesi | `~/.config/Resource Management/` |
| Sesi WhatsApp | `.../wa-sessions/` |

---

## Prasyarat sistem (umum)

| Paket | Kegunaan |
|-------|----------|
| `libfuse2` | Menjalankan AppImage (distribusi lama) |
| GTK 3 | UI Electron (biasanya sudah ada di desktop) |

---

## Troubleshooting singkat

| Gejala | Langkah |
|--------|---------|
| AppImage tidak jalan | `chmod +x`; install `libfuse2` |
| WA sync lambat / timeout | Cek RAM; tutup Chrome lain; lihat runbook Windows (timeout sama) |
| Port 8765 busy | Tutup instance app lama: `lsof -i :8765` |
| Permission denied userData | Pastikan home directory writable |

---

*Format rilis Linux produksi: **AppImage** — lihat [docs/RELEASE-CI.md](./docs/RELEASE-CI.md) dan [docs/CLIENT-INSTALL.md](./docs/CLIENT-INSTALL.md).*
