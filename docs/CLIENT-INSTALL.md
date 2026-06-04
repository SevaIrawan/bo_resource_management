# Install untuk client (Win / Mac / Linux)

**Tanpa install yang benar, tidak ada update in-app.**

Release: https://github.com/SevaIrawan/bo_resource_management/releases

**Versi terbaru:** `v1.0.8` — jika **semua client** (Win/Mac/Linux) macet di **Downloading v1.0.8…**, install manual dari file di bawah (bukan tunggu in-app).

---

## Windows

| | |
|---|---|
| File | `Resource.Management.Setup.1.0.8.exe` |
| Jangan | Kirim `.dmg` ke Windows |

Jalankan `.exe` → ikuti wizard → buka app.

---

## Mac (M1/M2/M3/M4)

| | |
|---|---|
| File | `Resource.Management-1.0.8-arm64.dmg` |
| Jangan | File `.exe`, jangan buka DMG di Windows |
| Jangan | Tombol **Check for app updates** di app **1.0.4** (bisa unduh `.exe` Windows salah) |

**Hanya di Mac:**

1. Unduh `.dmg` dari halaman Releases (nama pakai **titik**: `Resource.Management-…`).
2. Double-click DMG → drag **Resource Management** ke **Applications**.
3. Jika diblokir: Applications → klik kanan app → **Open** → konfirmasi.
4. Terminal (jika perlu): `xattr -cr "/Applications/Resource Management.app"`

---

## Linux

| | |
|---|---|
| File | `Resource.Management-1.0.8.AppImage` |

```bash
chmod +x Resource.Management-1.0.6.AppImage
./Resource.Management-1.0.6.AppImage
```

---

## Update otomatis (setelah install benar)

- Butuh rilis GitHub **Published** + `latest*.yml` benar.
- IT: jalankan workflow **Fix release yml** untuk tag **`v1.0.8`** (perbaiki `latest.yml`, `latest-mac.yml`, `latest-linux.yml` sekaligus).
- Di app: tunggu notifikasi → **Restart** (bukan unduh `.exe` di Mac).

---

## Ringkas masalah yang sering terjadi

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| **Win/Mac/Linux** *Downloading…* tidak selesai | Ketiga `latest*.yml` salah: path pakai **spasi**, file di GitHub pakai **titik** → 404 | IT: **Fix release yml** `v1.0.8`; client: install manual per OS (`.exe` / `.dmg` / `.AppImage`) |
| Mac dapat `.exe` | `latest-mac.yml` mengarah ke installer Windows | IT fix yml; Mac pasang **.dmg** |
| DMG tidak buka di Windows | DMG bukan untuk Windows | Unduh & buka **di Mac** |
| CI v1.0.8 gagal | Bug build/publish (bukan secret) | Pakai **v1.0.6** install manual; IT jalankan Fix release yml + workflow setelah patch ter-push |
| Tidak ada v1.0.8 di Releases | Build gagal | Fix CI dulu, jangan andalkan push dokumen |
