# Rilis GitHub Actions — panduan IT (wajib baca)

## Kenapa CI merah setelah v1.0.6?

**`ORG_ENV_FILE` sudah benar** (bukti: rilis **v1.0.6** sukses, run #7).

Kegagalan **v1.0.8** bukan karena secret hilang, melainkan:

1. **Regresi `publish` di `package.json`** — v1.0.6 **tidak** punya blok ini; CI + `electron-builder` bisa minta `GH_TOKEN` → Win/Mac/Linux gagal di `build:installer`. Publish hanya lewat `electron-builder.publish.json` + `npm run publish:github`.
2. **Windows:** `prepare-win-codesign-cache.ps1` salah folder (isi `winCodeSign/` harus langsung di `winCodeSign-2.6.0/`, bukan root zip).
3. **Metadata rilis:** `latest*.yml` nama file strip vs titik (`Resource.Management.…`) + Mac butuh `.zip` untuk auto-update.
4. **Workflow:** push `main` berulang memicu build **v1.0.8** sebelum perbaikan selesai → run merah beruntun (bukan IP/VPN).

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

1. Naikkan `version` di `package.json` + `scripts/validate-release-version.mjs` + `PROJECT.md`.
2. Commit & push (hanya perubahan version memicu workflow otomatis).
3. **Actions → Release multi-platform** — tunggu hijau (~30–90 menit).
4. Cek **Releases → v{x.y.z}** ada:
   - `Resource.Management.Setup.x.y.z.exe` (Windows)
   - `Resource.Management-x.y.z-arm64.dmg` + `.zip` (Mac)
   - `Resource.Management-x.y.z.AppImage` (Linux)
   - `latest.yml`, `latest-mac.yml`, `latest-linux.yml`
5. **Hotfix metadata rilis lama** (mis. v1.0.6): **Actions → Fix release yml** → tag `v1.0.6` → Run.

**Jangan** push berkali-kali kalau CI belum hijau — perbaiki secret / log error dulu.

---

## Build lokal Windows (tanpa CI)

```powershell
.\scripts\prepare-win-codesign-cache.ps1   # sekali, hindari error symlink
npm run build:installer:win
# atau distribusi cepat operator:
npm run build:operator   # HANYA .exe Windows
```

---

## Client tidak bisa install / update

Lihat **[CLIENT-INSTALL.md](./CLIENT-INSTALL.md)** — install manual dari **v1.0.6** dulu; update in-app setelah yml diperbaiki + rilis baru Published.
