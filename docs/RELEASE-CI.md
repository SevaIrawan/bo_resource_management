# Rilis GitHub Actions — panduan IT (wajib baca)

**Versi acuan saat ini:** `1.0.25` (`package.json` + `scripts/validate-release-version.mjs` + `PROJECT.md`)

---

## Setup sekali (GitHub repo)

**Settings → Secrets and variables → Actions → New repository secret**

| Nama | Isi |
|------|-----|
| `ORG_ENV_FILE` | Base64 isi file `.env` lengkap (sama seperti build lokal) |

PowerShell (di PC yang punya `.env`):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".env")) | Set-Clipboard
```

Paste ke secret `ORG_ENV_FILE`.

Kunci wajib di `.env`: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`.

---

## Cara rilis (urutan benar)

1. Naikkan `version` di `package.json` + `scripts/validate-release-version.mjs` + `PROJECT.md` (+ dokumen install jika perlu).
2. Commit & push ke `main` (perubahan `package.json` version memicu workflow **Release multi-platform**).
3. **Actions → Release multi-platform** — tunggu hijau (~30–90 menit).
4. Cek **Releases → v{x.y.z}** ada:
   - `Resource.Management.Setup.x.y.z.exe` (Windows)
   - `Resource.Management-x.y.z-arm64.dmg` + `.zip` (Mac auto-update)
   - `Resource.Management-x.y.z.AppImage` (Linux)
   - `latest.yml`, `latest-mac.yml`, `latest-linux.yml` (dari job publish + `sync-release-yml.mjs`)
5. **Hotfix metadata rilis lama:** **Actions → Fix release yml** → isi tag (mis. `v1.0.11`) → Run.

**Jangan** push berkali-kali kalau CI belum hijau.

**Satu push saja** setelah di PC build lokal sukses:

```powershell
npm run validate:installer-pipeline
npm run build:installer:win
```

Kalau release sudah ada di GitHub tapi gagal, workflow **skip** otomatis — pakai **Actions → Release multi-platform → Run workflow → centang Force rebuild**.

---

## Build lokal Windows (tanpa CI)

```powershell
.\scripts\prepare-win-codesign-cache.ps1   # sekali, hindari error symlink
npm run build:installer:win
# atau distribusi cepat operator:
npm run build:operator   # HANYA .exe Windows
```

---

## Catatan historis (v1.0.8)

Kegagalan **v1.0.8** bukan karena secret hilang. Penyebab utama sudah diperbaiki di **v1.0.9+**:

- `artifactName` titik di `package.json` (bukan spasi)
- `sync-release-yml.mjs` + validasi upload
- CI tidak upload `latest*.yml` duplikat dari job platform

---

## Client tidak bisa install / update

Lihat **[CLIENT-INSTALL.md](./CLIENT-INSTALL.md)** — install manual dari release terbaru; update in-app setelah rilis **Published** + yml valid.
