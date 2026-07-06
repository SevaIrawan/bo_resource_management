# Install untuk client (Win / Mac / Linux)

**Tanpa install yang benar, tidak ada update in-app.**

Release: https://github.com/SevaIrawan/bo_resource_management/releases

**Versi terbaru:** `v1.0.30`

---

## Windows

| | |
|---|---|
| File | `Resource.Management.Setup.1.0.30.exe` |
| Jangan | Kirim `.dmg` ke Windows |

Jalankan `.exe` → ikuti wizard → buka app.

---

## Mac (M1/M2/M3/M4)

| | |
|---|---|
| File | `Resource.Management-1.0.30-arm64.dmg` |
| Jangan | File `.exe`, jangan buka DMG di Windows |

**Hanya di Mac:**

1. Unduh `.dmg` dari halaman Releases (nama pakai **titik**: `Resource.Management-…`).
2. Double-click DMG → drag **Resource Management** ke **Applications**.
3. Jika diblokir: Applications → klik kanan app → **Open** → konfirmasi.
4. Terminal (jika perlu): `xattr -cr "/Applications/Resource Management.app"`

---

## Linux

| | |
|---|---|
| File | `Resource.Management-1.0.30.AppImage` |

```bash
chmod +x Resource.Management-1.0.30.AppImage
./Resource.Management-1.0.30.AppImage
```

---

## Update otomatis (setelah install benar)

- Butuh rilis GitHub **Published** + `latest*.yml` benar (path **titik**, selaras `artifactName` di `package.json`).
- CI v1.0.9+ menjalankan `sync-release-yml.mjs` saat publish — hindari edit manual yml kecuali hotfix.
- Di app: tunggu notifikasi → **Restart** (bukan unduh `.exe` di Mac).

---

## Ringkas masalah yang sering terjadi

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| *Downloading…* tidak selesai | `latest*.yml` path spasi vs file titik → 404 | IT: **Fix release yml** untuk tag rilis; client: install manual per OS |
| Mac dapat `.exe` | `latest-mac.yml` mengarah ke installer Windows | IT fix yml; Mac pasang **.dmg** |
| DMG tidak buka di Windows | DMG bukan untuk Windows | Unduh & buka **di Mac** |
| CI gagal | Bug build/publish | IT: cek Actions log; **Force rebuild** workflow |
| Tidak ada rilis di GitHub | Build gagal / skip | Fix CI dulu; naikkan `version` di `package.json` lalu push |
