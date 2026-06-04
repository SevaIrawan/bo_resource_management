# Install Resource Management (macOS) — Tim Internal

Dokumen lengkap: **[PROJECT.md](./PROJECT.md)**

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
2. Pilih release terbaru (mis. **v1.0.6** atau **v1.0.8** setelah CI hijau)
3. Unduh **hanya** file yang berakhiran **`arm64.dmg`**  
   Contoh: `Resource Management-1.0.6-arm64.dmg`
4. **Jangan** unduh `.exe`, `latest.yml`, atau source code zip

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
- Jika unduh macet: tunggu rilis **v1.0.8+** (perbaikan auto-update) atau minta IT jalankan workflow Repair di GitHub Actions

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
| File .exe tidak buka | File Windows | Unduh **.dmg** dari GitHub |
| "App is damaged" | Unsigned build | Klik kanan → Open, atau `xattr -cr` |
| DMG tidak mount | Download corrupt | Unduh ulang .dmg |
| Auto-update macet | Rilis lama | Tunggu v1.0.8+ / Repair workflow |
