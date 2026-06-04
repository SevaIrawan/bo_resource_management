# Install untuk client (Win / Mac / Linux)

**Tanpa install yang benar, tidak ada update in-app.**

Release yang **sudah ada**: https://github.com/SevaIrawan/bo_resource_management/releases/tag/v1.0.6

---

## Windows

| | |
|---|---|
| File | `Resource.Management.Setup.1.0.6.exe` |
| Jangan | Kirim `.dmg` ke Windows |

Jalankan `.exe` → ikuti wizard → buka app.

---

## Mac (M1/M2/M3/M4)

| | |
|---|---|
| File | `Resource.Management-1.0.6-arm64.dmg` |
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
| File | `Resource.Management-1.0.6.AppImage` |

```bash
chmod +x Resource.Management-1.0.6.AppImage
./Resource.Management-1.0.6.AppImage
```

---

## Update otomatis (setelah install benar)

- Butuh rilis GitHub **Published** + `latest*.yml` benar.
- IT: jalankan workflow **Fix release yml** untuk `v1.0.6`, lalu rilis **v1.0.8+** setelah CI hijau.
- Di app: tunggu notifikasi → **Restart** (bukan unduh `.exe` di Mac).

---

## Ringkas masalah yang sering terjadi

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| Mac dapat `.exe` | Update in-app metadata salah / file Windows dikirim | Pasang dari **.dmg** di Mac; IT fix yml |
| DMG tidak buka di Windows | DMG bukan untuk Windows | Unduh & buka **di Mac** |
| CI v1.0.8 gagal | Bug build/publish (bukan secret) | Pakai **v1.0.6** install manual; IT jalankan Fix release yml + workflow setelah patch ter-push |
| Tidak ada v1.0.8 di Releases | Build gagal | Fix CI dulu, jangan andalkan push dokumen |
