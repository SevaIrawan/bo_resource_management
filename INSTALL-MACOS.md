# Install Resource Management (macOS) — Tim Internal

Dokumen lengkap: **[PROJECT.md](./PROJECT.md)** · Panduan client: **[docs/CLIENT-INSTALL.md](./docs/CLIENT-INSTALL.md)** · CI/rilis IT: **[docs/RELEASE-CI.md](./docs/RELEASE-CI.md)**

---

## Penting: file yang benar untuk Mac

| OS | File yang benar | Jangan pakai |
|----|-----------------|--------------|
| **Mac (M1/M2/M3/M4)** | **`Resource Management-x.x.x-arm64.dmg`** | `.exe` (Windows), folder Setup Windows |
| Windows | `Resource Management Setup x.x.x.exe` | `.dmg`, `.AppImage` |

**File `.exe` tidak bisa dibuka di Mac** — ikon oranye "EXE" = salah kirim dari IT.

---

## Unduh untuk Mac (M-series / Apple Silicon)

1. Buka: **https://github.com/SevaIrawan/bo_resource_management/releases**
2. Pilih release terbaru (**v1.0.36**)
3. Unduh **hanya** file **`arm64.dmg`** — contoh:  
   **`Resource.Management-1.0.36-arm64.dmg`** (pakai **titik**, bukan strip `Resource-Management-…`)
4. **Jangan** pakai tombol **Check for app updates** di app versi lama (bisa unduh file `.exe` Windows salah). Pasang dari DMG dulu.
5. **Jangan** unduh `.exe`, `latest.yml`, atau source code zip

---

## Pasang di Mac

1. Double-click file **`.dmg`**
2. Jendela installer → drag **Resource Management** ke folder **Applications**
3. Jika macOS memblokir ("cannot be opened", "damaged", Gatekeeper):
   - Buka **Applications** → klik kanan **Resource Management** → **Open** → **Open** lagi (konfirmasi sekali)
   - Atau Terminal (sekali):
     ```bash
     xattr -cr "/Applications/Resource Management.app"
     ```
4. Buka app → login username/password → tambah akun WA/TG

Build internal belum notarized Apple — langkah "Open" di atas normal untuk pilot internal.

---

## Update app (setelah terpasang)

- App cek GitHub otomatis → **Restart** setelah notifikasi update  
- Jika unduh macet: minta IT jalankan **Fix release yml** untuk tag rilis terbaru, atau install manual **v1.0.36** `.dmg`

---

## Tim IT — build Mac

```bash
npm run build:installer:mac   # di Mac atau GitHub Actions
```

Output: `release/Resource Management-x.x.x-arm64.dmg` + `release/*.zip` (untuk auto-update, bukan untuk kirim manual ke user).

**Jangan** pakai `npm run build:operator` / `scripts\dist-operator\*.exe` untuk Mac — itu **hanya Windows**.

---

## Lokasi data

`~/Library/Application Support/Resource Management/`

---

## Troubleshooting

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| File .exe muncul / tidak buka | App update salah metadata atau file Windows | Pasang dari **.dmg** di Mac; jangan pakai update in-app sampai IT fix yml |
| File .exe tidak buka | File Windows dikirim ke Mac | Unduh **.dmg** dari GitHub **di Mac** |
| "App is damaged" | Unsigned build | Klik kanan → Open, atau `xattr -cr` |
| DMG tidak mount | Download corrupt | Unduh ulang .dmg |
| Auto-update macet | Metadata yml / rilis lama | Install manual **v1.0.36** `.dmg` atau IT: Fix release yml |
