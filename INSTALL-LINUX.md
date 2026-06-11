# Install Resource Management (Linux) — Tim Internal

> **Status:** Skrip build & konfigurasi electron-builder **sudah ada** (v1.0.4+). Versi produksi terbaru: **1.0.15**.  
> Installer Linux harus di-build di **mesin Linux** (atau GitHub Actions). Lihat [docs/PLAN-CROSS-PLATFORM-INSTALLERS.md](./docs/PLAN-CROSS-PLATFORM-INSTALLERS.md).

Dokumen resmi lengkap: **[PROJECT.md](./PROJECT.md)**

---

## Tim IT — build & rilis (Linux)

**Prasyarat:** Ubuntu 22.04+ (atau setara), Node.js LTS, Python 3, `.env` lengkap di root project.

```bash
cd "/path/to/Resource Management"
npm install
npm run build:installer:linux   # tersedia setelah implementasi rencana cross-platform
```

Output (contoh):

- `release/Resource Management-1.1.0.AppImage`
- `release/resource-management_1.1.0_amd64.deb` (jika format deb dipilih)

**Update kode:** naikkan `version` → GitHub Release dengan `latest-linux.yml` → operator **Restart** app.

---

## Tim operasional — Linux baru

### Opsi A — AppImage (disarankan, portable)

```bash
chmod +x "Resource Management-1.1.0.AppImage"
./Resource\ Management-1.1.0.AppImage
```

Opsional: integrasi menu desktop sesuai kebijakan IT (AppImageLauncher, dll.).

### Opsi B — Debian/Ubuntu (.deb)

```bash
sudo dpkg -i resource-management_1.1.0_amd64.deb
sudo apt-get install -f   # jika ada dependency missing
```

Jalankan **Resource Management** dari menu aplikasi.

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

*Format rilis Linux final (AppImage vs deb) ditetapkan di [docs/PLAN-CROSS-PLATFORM-INSTALLERS.md](./docs/PLAN-CROSS-PLATFORM-INSTALLERS.md) §17.*
