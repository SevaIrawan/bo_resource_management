# Perencanaan — Installer Multi-Platform (Windows · macOS · Linux)

**Versi dokumen:** 1.0  
**Tanggal:** 2026-06-03  
**Versi aplikasi acuan:** `1.0.15` (`package.json`)  
**Status:** **In progress** — Fase 1–5 diimplementasi (runtime, skrip build, electron-builder, validator, CI draft). Mac/Linux installer perlu build di runner native + QA pilot.
**Audience:** Developer / IT release / stakeholder operasional  

**Dokumen terkait:** [PROJECT.md](../PROJECT.md) · [INSTALL-WINDOWS.md](../INSTALL-WINDOWS.md)

---

## Daftar isi

1. [Ringkasan eksekutif](#1-ringkasan-eksekutif)
2. [Tujuan & batasan](#2-tujuan--batasan)
3. [Model distribusi (pemahaman benar)](#3-model-distribusi-pemahaman-benar)
4. [Kondisi saat ini (audit codebase)](#4-kondisi-saat-ini-audit-codebase)
5. [Target akhir](#5-target-akhir)
6. [Arsitektur & artefak rilis](#6-arsitektur--artefak-rilis)
7. [Fase implementasi](#7-fase-implementasi)
8. [Perubahan kode (checklist file)](#8-perubahan-kode-checklist-file)
9. [Konfigurasi electron-builder](#9-konfigurasi-electron-builder)
10. [Pipeline build & CI/CD](#10-pipeline-build--cicd)
11. [Signing, notarization, kepercayaan OS](#11-signing-notarization-kepercayaan-os)
12. [Proses rilis multi-platform](#12-proses-rilis-multi-platform)
13. [QA & validasi](#13-qa--validasi)
14. [Rollout ke tim operasional](#14-rollout-ke-tim-operasional)
15. [Risiko & mitigasi](#15-risiko--mitigasi)
16. [Estimasi effort](#16-estimasi-effort)
17. [Keputusan terbuka](#17-keputusan-terbuka)
18. [Lampiran — referensi file](#18-lampiran--referensi-file)

---

## 1. Ringkasan eksekutif

Resource Management hari ini **hanya didistribusikan sebagai installer Windows** (`.exe` NSIS). Tim operasional di Mac atau Linux **belum punya installer resmi**, meskipun stack Electron pada prinsipnya mendukung desktop multi-platform.

**Tujuan proyek ini:** menyiapkan **installer native per OS** sehingga:

- Operator di **PC Windows** → install `.exe` (tetap seperti sekarang)
- Operator di **PC Mac** → install `.dmg` (atau `.pkg`)
- Operator di **PC Linux** → install `.AppImage` / `.deb` (format final ditetapkan di Fase 0)

Semua platform memakai **backend Supabase yang sama**, fitur **paritas penuh** (UI + login WA/TG + sync/scrape + ticket + auto-update), dengan sesi device disimpan **lokal di PC masing-masing**.

**Bukan tujuan:** satu file installer universal untuk ketiga OS (tidak ada praktik standar di industri desktop).

**Effort dominan:** bundling Chrome Puppeteer + sidecar Telegram **per OS**, pipeline build **matrix CI**, signing Mac, dan **QA WA/TG di setiap platform** — bukan rewrite UI React.

---

## 2. Tujuan & batasan

### 2.1 Tujuan (in scope)

| # | Tujuan | Ukuran selesai |
|---|--------|----------------|
| G1 | Operator Mac/Linux punya installer resmi dari IT | File rilis + panduan install per OS |
| G2 | Paritas fitur dengan Windows 1.0.4+ | Login WA/TG, sync, scrape, ticket, export, auto-update |
| G3 | Satu versi semver, multi-artefak di GitHub Release | v1.0.x berisi artefak Win + Mac + Linux |
| G4 | Auto-update memilih artefak yang benar per OS | `electron-updater` unduh file sesuai platform |
| G5 | Validator & dokumentasi IT selaras | `validate:*` dan runbook build per OS |

### 2.2 Non-tujuan (out of scope — fase ini)

| Item | Alasan |
|------|--------|
| Web app / browser-only | Produk tetap desktop Electron |
| Satu installer untuk semua OS | Tidak feasible; bukan expectation user desktop |
| Dukung Windows ARM64 | Prioritas x64 dulu; ARM Windows opsional later |
| Hapus dependency Puppeteer/sidecar | WA/TG tetap butuh komponen native |
| Public store (Microsoft Store / Mac App Store) | Distribusi internal GitHub Release cukup |
| Monitoring-only Mac/Linux tanpa WA/TG | Target = paritas penuh, bukan tier terbatas |

### 2.3 Asumsi

- Tim IT punya atau bisa menyewa **runner macOS** (GitHub Actions `macos-latest` atau Mac fisik).
- Operator Mac/Linux punya hak install aplikasi di PC kerja (bukan MDM yang memblok semua binary unsigned).
- `.env` organisasi tetap **terbundel saat build** (model 1.0.4), bukan diisi user.
- Supabase, skema DB, dan kontrak ticket **tidak berubah** karena multi-platform.

---

## 3. Model distribusi (pemahaman benar)

```
                    GitHub Release v1.0.x (PUBLIC)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  Setup.exe (NSIS)      Setup.dmg (Mac)      AppImage / .deb
        │                     │                     │
        ▼                     ▼                     ▼
   PC Windows            PC macOS              PC Linux
   (operator A)          (operator B)          (operator C)
        │                     │                     │
        └─────────────────────┴─────────────────────┘
                              │
                              ▼
                    Supabase (cloud, shared)
```

**Poin penting:**

- Setiap operator install **hanya di PC-nya sendiri** — tidak ada requirement multi-OS di satu mesin.
- **Sesi WA/TG** (folder `wa-sessions`, session Telethon) **tidak** pindah antar OS; login ulang jika ganti device/OS.
- **Data bisnis** (brand, akun, grup, ticket) tetap di Supabase — sama di semua platform.

---

## 4. Kondisi saat ini (audit codebase)

### 4.1 Build & packaging — Windows only

| Area | Kondisi | File |
|------|---------|------|
| Target electron-builder | Hanya `win` + `nsis` | `package.json` → `build.win` |
| Script installer | PowerShell end-to-end | `scripts/build-installer.ps1` |
| Chrome WA | `puppeteer browsers install` → cari `chrome.exe` | `scripts/build-puppeteer-chrome.ps1` |
| Sidecar TG | PyInstaller → `rm-telegram-sidecar.exe` | `scripts/build-telegram-sidecar.ps1` |
| extraResources | `.exe` + chrome folder Windows | `package.json` → `build.extraResources` |
| Publish | `--win --publish always` | `scripts/publish-release.ps1` |
| Dokumentasi | Windows only | `PROJECT.md`, `INSTALL-WINDOWS.md` |

### 4.2 Runtime Electron — sebagian sudah OS-aware

| Area | Windows | macOS / Linux | File |
|------|---------|---------------|------|
| Binary Chrome WA | `chrome.exe` | Sudah cari `chrome` | `electron/main/platformLogin/waPuppeteerChrome.ts` |
| Dev sidecar | `py -3` | Sudah `python3` | `electron/main/platformLogin/telegramSidecar.ts` |
| Kill port 8765 | PowerShell | Sudah `lsof` | `telegramSidecar.ts` |
| Packaged sidecar | **Hardcode `.exe`** | **Belum** | `bundledSidecarExe()` |
| userData / `.env` | `app.getPath('userData')` | Sama (Electron) | `electron/main/appEnv.ts` |
| App lifecycle Mac | — | `darwin` activate | `electron/main/index.ts` |
| WA Puppeteer args | `--no-sandbox` | Sama (perlu uji Linux) | `electron/main/platformLogin/whatsapp.ts` |

### 4.3 Validator — asumsi Windows artefak

| Validator | Asumsi Windows |
|-----------|----------------|
| `validate-installer-package.mjs` | Wajib `rm-telegram-sidecar.exe` |
| `validate-puppeteer-chrome.mjs` | Pesan error sebut `chrome.exe` |
| `validate-telegram-login-flow.mjs` | Assert string `.exe` di source |

### 4.4 Gap summary

```
[UI React + Supabase IPC]     ████████████  ~95% portable
[Electron main generic]       ████████░░░░  ~70% (sidecar path, build)
[Build pipeline]              ██░░░░░░░░░░  ~15% (Win only)
[QA multi-platform]           ░░░░░░░░░░░░   0%
[Dokumentasi operator]        ██░░░░░░░░░░  Win only
```

---

## 5. Target akhir

### 5.1 Artefak rilis per versi (contoh v1.1.0)

| Platform | Format utama | Format alternatif | Auto-update metadata |
|----------|--------------|-------------------|----------------------|
| Windows x64 | NSIS `.exe` | — | `latest.yml` |
| macOS | `.dmg` | `.zip` (opsional updater) | `latest-mac.yml` |
| Linux x64 | `.AppImage` | `.deb` (Ubuntu/Debian) | `latest-linux.yml` |

**Keputusan format Linux** ditetapkan di Fase 0 (lihat §17).

### 5.2 Mac — arsitektur CPU

| Opsi | Pro | Kontra |
|------|-----|--------|
| **A. Universal (arm64 + x64)** | Satu `.dmg` untuk Intel & Apple Silicon | Build lebih lama; ukuran file besar |
| **B. Dua artefak terpisah** | Lebih kecil per file | IT harus pilih yang benar |
| **Rekomendasi awal** | **Universal** jika CI Mac mendukung; else **arm64 + x64** dua file dengan penamaan jelas |

### 5.3 Perilaku operator (sama di semua OS)

1. Terima installer dari IT (file sesuai OS)
2. Install sekali
3. Buka app → login dashboard
4. Sync WA/TG di device itu
5. Update kode → auto-update + Restart (`.env` & sesi lokal tetap)

### 5.4 Path data lokal per OS

| Data | Windows | macOS | Linux |
|------|---------|-------|-------|
| userData | `%APPDATA%\Resource Management` | `~/Library/Application Support/Resource Management` | `~/.config/Resource Management` |
| WA sessions | `{userData}/wa-sessions` | sama | sama |
| `.env` user copy | `{userData}/.env` | sama | sama |

---

## 6. Arsitektur & artefak rilis

### 6.1 Diagram komponen terbundel (per platform)

```
┌─────────────────────────────────────────────────────────────┐
│  Resource Management.app / .exe / AppImage                   │
│  ├── dist/ + dist-electron/ (UI + main)                      │
│  ├── resources/org-default.env                               │
│  ├── resources/puppeteer-chrome/   ← Chrome OS-specific      │
│  └── resources/sidecar/            ← sidecar OS-specific     │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   Puppeteer (WA)                 HTTP :8765 (TG)
   whatsapp-web.js                Telethon sidecar
```

### 6.2 Penamaan sidecar (proposal)

| OS | Nama file bundled | Catatan |
|----|-------------------|---------|
| Windows | `rm-telegram-sidecar.exe` | Tetap (backward compatible) |
| macOS | `rm-telegram-sidecar` | Executable, `chmod +x` |
| Linux | `rm-telegram-sidecar` | Executable |

Resolver di runtime:

```typescript
// Pseudocode — implementasi di telegramSidecar.ts
function bundledSidecarPath(): string {
  const base = path.join(process.resourcesPath, 'sidecar');
  if (process.platform === 'win32') {
    return path.join(base, 'rm-telegram-sidecar.exe');
  }
  return path.join(base, 'rm-telegram-sidecar');
}
```

### 6.3 Chrome Puppeteer per OS

Build **harus** dijalankan **di OS target** (atau CI runner OS tersebut):

```bash
PUPPETEER_CACHE_DIR=resources/puppeteer-cache npx puppeteer browsers install chrome
```

Hasil cache berbeda struktur folder (`chrome-win64`, `chrome-mac-*`, `chrome-linux-*`). Kode `findChromeExeUnder()` sudah mencari `chrome.exe` vs `chrome` — **cukup** asalkan folder yang benar masuk `extraResources`.

---

## 7. Fase implementasi

### Fase 0 — Keputusan & persiapan (1–3 hari)

**Deliverable:** keputusan tertulis + akses CI.

| Task | Owner | Output |
|------|-------|--------|
| Tentukan format Linux (AppImage vs deb vs keduanya) | IT + dev | Keputusan §17 dicentang |
| Tentukan strategi Mac (universal vs dual) | IT | Entry di `package.json` mac |
| Siapkan Apple Developer ID (jika Mac production) | IT | Sertifikat + notarization credentials |
| Buat GitHub Actions secrets | IT | `GH_TOKEN`, `CSC_*`, `APPLE_*` |
| Inventaris operator: berapa % Win / Mac / Linux | Ops | Spreadsheet atau tabel di doc ini |

**Exit criteria:** format rilis & akses build Mac/Linux confirmed.

---

### Fase 1 — Refactor runtime (3–5 hari)

**Goal:** kode main process tidak hardcode Windows saat `app.isPackaged`.

| Task | File | Prioritas |
|------|------|-----------|
| `bundledSidecarPath()` multi-platform | `telegramSidecar.ts` | P0 |
| Pastikan sidecar executable bit Linux/Mac | post-build script atau electron-builder | P0 |
| Review WA puppeteer args Linux (`--no-sandbox`, `--disable-dev-shm-usage`) | `whatsapp.ts` | P1 |
| Preload `platform` sudah expose — verifikasi UI tidak assume win32 | `preload/index.ts` | P2 |
| Update komentar `supabaseConfig.ts` (bukan hanya `.exe`) | `src/lib/supabaseConfig.ts` | P3 |

**Exit criteria:** `npm run dev` + sidecar python3 jalan di Mac/Linux dev machine; packaged path logic unit-testable / manual checklist.

---

### Fase 2 — Skrip build per OS (5–8 hari)

**Goal:** setiap OS bisa menghasilkan installer lokal (tanpa CI dulu).

| Task | Windows | macOS | Linux |
|------|---------|-------|-------|
| Skrip build chrome | refactor PS1 → atau `build-puppeteer-chrome.mjs` cross-platform | same mjs | same mjs |
| Skrip build sidecar | refactor PS1 → `build-telegram-sidecar.mjs` | PyInstaller native | PyInstaller native |
| Skrip build installer | `build-installer.ps1` tetap | `build-installer.sh` | `build-installer.sh` |
| Copy org-default.env | sama | sama | sama |
| npm scripts | `build:installer:win` | `build:installer:mac` | `build:installer:linux` |

**Rekomendasi:** migrasi logika dari PowerShell ke **Node `.mjs`** untuk chrome + sidecar agar satu source of truth; PowerShell/bash hanya orchestrator tipis.

**Exit criteria:** installer keluar di `release/` per OS di mesin native masing-masing.

---

### Fase 3 — electron-builder config (2–3 hari)

**Goal:** `package.json` `build` section mendukung mac + linux + extraResources kondisional.

Lihat detail §9.

**Exit criteria:** `electron-builder --mac` / `--linux` sukses dengan extraResources benar.

---

### Fase 4 — CI matrix GitHub Actions (3–5 hari)

**Goal:** push tag / manual workflow → tiga artefak + publish.

Lihat detail §10.

**Exit criteria:** Release draft otomatis berisi minimal Win + Mac + Linux; Windows tetap regression green.

---

### Fase 5 — Validator & pre-release gate (2–3 hari)

| Task | Detail |
|------|--------|
| `validate-installer-package.mjs` | Cek sidecar + chrome sesuai `process.platform` saat build |
| `validate-telegram-login-flow.mjs` | Assert `bundledSidecarPath` logic, bukan string `.exe` saja |
| `validate-puppeteer-chrome.mjs` | Pesan error netral per OS |
| Baru: `validate-cross-platform-build.mjs` | Assert `package.json` punya target mac/linux |
| `validate:pre-release` | Include validator baru |

**Exit criteria:** `npm run validate:pre-release` lulus di runner Win; validator mac/linux jalan di CI matrix.

---

### Fase 6 — QA manual & pilot (1–2 minggu)

Matrix lengkap di §13.

**Pilot:** 1 operator Mac + 1 operator Linux (production-like akun), min 1 akun WA + 1 TG, sync ≥100 grup.

**Exit criteria:** checklist QA P0 semua hijau; tidak ada blocker P0 terbuka.

---

### Fase 7 — Dokumentasi & rollout (2–3 hari)

| Dokumen | Aksi |
|---------|------|
| `INSTALL-WINDOWS.md` | Tetap; referensi sibling docs |
| `INSTALL-MACOS.md` | **Baru** |
| `INSTALL-LINUX.md` | **Baru** |
| `PROJECT.md` | Update §1, §4, distribusi multi-platform |
| User handbook EN/ZH | Section "Supported platforms" + screenshot install |
| `docs/guides/_source/HANDBOOK-*.md` | Rebuild PDF setelah edit |

**Exit criteria:** IT bisa deploy tanpa oral tradition; operator punya PDF per OS.

---

## 8. Perubahan kode (checklist file)

### 8.1 Wajib ubah (P0)

| File | Perubahan |
|------|-----------|
| `electron/main/platformLogin/telegramSidecar.ts` | `bundledSidecarPath()` per platform |
| `package.json` | `build.mac`, `build.linux`, scripts npm, extraResources |
| `scripts/build-puppeteer-chrome.ps1` | → cross-platform mjs atau duplicate sh |
| `scripts/build-telegram-sidecar.ps1` | → cross-platform mjs |
| `scripts/build-installer.ps1` | Pecah / tambah `build-installer.sh` |
| `scripts/validate-installer-package.mjs` | Sidecar + chrome per OS |
| `scripts/publish-release.ps1` | Multi-artefak atau ganti workflow GHA |

### 8.2 Perlu review (P1)

| File | Perubahan |
|------|-----------|
| `electron/main/platformLogin/whatsapp.ts` | Linux chromium flags, timeout smoke test |
| `electron/main/platformLogin/waBrowserPool.ts` | Memory limits Mac vs Win |
| `electron/main/autoUpdate.ts` | Komentar; pastikan electron-updater config multi-platform |
| `scripts/validate-telegram-login-flow.mjs` | Assertion path sidecar |
| `scripts/validate-puppeteer-chrome.mjs` | Binary name |

### 8.3 Dokumentasi (P1)

| File | Perubahan |
|------|-----------|
| `PROJECT.md` | Status produksi multi-platform |
| `README.md` | Build instructions per OS |
| `INSTALL-MACOS.md`, `INSTALL-LINUX.md` | Baru |

### 8.4 Opsional / later (P2)

| File | Perubahan |
|------|-----------|
| `scripts/build-operator-installer.ps1` | Folder distribusi multi-OS |
| Admin UI | Tampilkan `process.platform` + path userData untuk support |
| `.github/workflows/release.yml` | Notifikasi Slack/Teams post-release |

---

## 9. Konfigurasi electron-builder

### 9.1 Cuplikan `package.json` (target — belum apply)

```json
{
  "scripts": {
    "build:chrome": "node scripts/build-puppeteer-chrome.mjs",
    "build:sidecar": "node scripts/build-telegram-sidecar.mjs",
    "build:app:win": "node scripts/validate-puppeteer-chrome.mjs && vite build && electron-builder --win",
    "build:app:mac": "node scripts/validate-puppeteer-chrome.mjs && vite build && electron-builder --mac",
    "build:app:linux": "node scripts/validate-puppeteer-chrome.mjs && vite build && electron-builder --linux",
    "build:installer:win": "powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1",
    "build:installer:mac": "bash scripts/build-installer.sh mac",
    "build:installer:linux": "bash scripts/build-installer.sh linux"
  },
  "build": {
    "mac": {
      "target": ["dmg"],
      "category": "public.app-category.business",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "Office",
      "executableName": "resource-management"
    },
    "extraResources": [
      { "from": "resources/env-template.env", "to": "env-template.env" },
      { "from": "resources/org-default.env", "to": "org-default.env" },
      { "from": "resources/puppeteer-cache/chrome", "to": "puppeteer-chrome/chrome" },
      { "from": "resources/sidecar/${sidecarBinary}", "to": "sidecar/${sidecarBinary}" }
    ]
  }
}
```

**Catatan:** `extraResources` dengan variabel `${sidecarBinary}` butuh hook `electron-builder` (`onBeforePack`) atau tiga profil build — desain final di Fase 3.

### 9.2 File pendukung baru

| File | Fungsi |
|------|--------|
| `build/entitlements.mac.plist` | Izin Chromium child process |
| `build/icon.icns` | Icon Mac (convert dari icon Win jika ada) |
| `build/icon.png` | Linux 512×512 |

---

## 10. Pipeline build & CI/CD

### 10.1 Prinsip

| OS | Runner build | Bisa cross-compile dari Windows? |
|----|--------------|----------------------------------|
| Windows | `windows-latest` | — |
| macOS | `macos-latest` | **Tidak** (praktis) |
| Linux | `ubuntu-latest` | **Tidak** untuk sidecar + chrome bundle |

### 10.2 Workflow proposal (`.github/workflows/release-multiplatform.yml`)

```yaml
# Pseudocode — implementasi di Fase 4
name: Release multi-platform
on:
  workflow_dispatch:
    inputs:
      version:
        required: true
jobs:
  build-win:
    runs-on: windows-latest
    steps:
      - checkout
      - setup node + python
      - inject org-default.env from secret
      - npm ci && npm run build:installer:win
      - upload artifact: release/*.exe, latest.yml

  build-mac:
    runs-on: macos-latest
    steps:
      - same pattern → .dmg, latest-mac.yml
      - codesign + notarize

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - same pattern → .AppImage, .deb, latest-linux.yml

  publish:
    needs: [build-win, build-mac, build-linux]
    runs-on: ubuntu-latest
    steps:
      - download all artifacts
      - gh release create / upload
```

### 10.3 Secret & env CI

| Secret | Dipakai untuk |
|--------|---------------|
| `GH_TOKEN` | Publish GitHub Release |
| `ORG_ENV_FILE` | Base64 isi `.env` organisasi (sama seperti build lokal) |
| `CSC_LINK` + `CSC_KEY_PASSWORD` | Windows code signing (opsional) |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Mac notarization |
| `CSC_LINK` (mac) | Developer ID Application |

**Keamanan:** `.env` organisasi **tidak** commit ke git; inject saat CI dari secret (sama seperti praktik build Windows hari ini).

### 10.4 Branch strategy

| Opsi | Rekomendasi |
|------|-------------|
| Feature branch `feat/cross-platform` | Develop Fase 1–5 |
| Merge ke `main` | Setelah QA pilot Fase 6 |
| Version bump | **Minor** `1.1.0` (fitur distribusi baru, bukan patch) |

---

## 11. Signing, notarization, kepercayaan OS

### 11.1 Windows

| Item | Status sekarang | Target |
|------|-----------------|--------|
| Code signing | `signAndEditExecutable: false` | Opsional tapi kurangi SmartScreen warning |
| Cost | — | Cert OV/EV (~$200–400/tahun) |

Tanpa signing: app tetap jalan; user klik "Run anyway" — **sama seperti banyak internal tools**.

### 11.2 macOS

| Item | Tanpa notarize | Dengan notarize |
|------|----------------|-----------------|
| Buka app | Gatekeeper block / klik kanan Open | Buka normal |
| Effort | Rendah (dev internal) | Apple Dev $99/tahun + setup |
| **Rekomendasi production** | Pilot internal OK | **Wajib** jika >5 Mac operator |

Entitlements Chromium: `com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation` — template standar Electron + Puppeteer.

### 11.3 Linux

| Item | Catatan |
|------|---------|
| Signing AppImage | Opsional (`gpg`) |
| `.deb` | `dpkg -i` cukup untuk internal |
| Dependencies | AppImage bundled; `.deb` may need `libgtk-3`, `libnotify` |

---

## 12. Proses rilis multi-platform

### 12.1 Checklist rilis v1.1.0 (contoh)

```
[ ] Semua PR Fase 1–5 merged
[ ] version package.json = 1.1.0
[ ] npm run validate:pre-release (Windows CI green)
[ ] Manual QA matrix §13 — P0 pass
[ ] Trigger workflow release-multiplatform
[ ] GitHub Release PUBLIC berisi:
      - Resource Management Setup 1.1.0.exe
      - Resource Management-1.1.0.dmg
      - Resource Management-1.1.0.AppImage
      - Resource Management_1.1.0_amd64.deb (jika dipilih)
      - latest.yml, latest-mac.yml, latest-linux.yml
[ ] Smoke auto-update: 1 PC per OS dari versi 1.0.4 → 1.1.0
[ ] Email/Slack IT: link release + INSTALL-*.md
[ ] Update handbook PDF
```

### 12.2 Rollback

| Skenario | Aksi |
|----------|------|
| Bug P0 di Mac only | Unpublish artefak Mac; Win/Linux tetap |
| Bug P0 semua platform | GitHub Release prior version; hotfix `1.1.1` |
| Auto-update broken | Operator install manual dari Release page |

---

## 13. QA & validasi

### 13.1 Matrix QA manual (P0 — wajib sebelum rollout)

| # | Skenario | Win | Mac | Linux |
|---|----------|-----|-----|-------|
| 1 | Install fresh | ☐ | ☐ | ☐ |
| 2 | Login dashboard | ☐ | ☐ | ☐ |
| 3 | Login WA QR | ☐ | ☐ | ☐ |
| 4 | Login TG QR | ☐ | ☐ | ☐ |
| 5 | Sync / count groups (≥100) | ☐ | ☐ | ☐ |
| 6 | Scrape RUN | ☐ | ☐ | ☐ |
| 7 | Ticket muncul + reconcile | ☐ | ☐ | ☐ |
| 8 | Export Excel | ☐ | ☐ | ☐ |
| 9 | Auto-update dari versi sebelumnya | ☐ | ☐ | ☐ |
| 10 | Restart — sesi WA/TG tetap | ☐ | ☐ | ☐ |
| 11 | Remove account + purge disk | ☐ | ☐ | ☐ |
| 12 | Buka folder config (Admin) | ☐ | ☐ | ☐ |

### 13.2 Matrix QA (P1 — post-pilot)

| # | Skenario | Win | Mac | Linux |
|---|----------|-----|-----|-------|
| 13 | Multi-akun WA (≥3 paralel) | ☐ | ☐ | ☐ |
| 14 | Akun scale ~2000 grup WA | ☐ | ☐ | ☐ |
| 15 | TG phone login + 2FA | ☐ | ☐ | ☐ |
| 16 | Sleep/resume laptop | ☐ | ☐ | ☐ |
| 17 | Disk penuh / permission denied | ☐ | ☐ | ☐ |

### 13.3 Automated gates (tetap jalan)

```bash
npm run validate:pre-release
npm run typecheck
npm run build:web
```

Per platform saat build installer:

```bash
node scripts/validate-installer-package.mjs
node scripts/validate-puppeteer-chrome.mjs
```

---

## 14. Rollout ke tim operasional

### 14.1 Strategi

| Tahap | Audience | Durasi |
|-------|----------|--------|
| **Pilot** | 1 Mac + 1 Linux power user + IT | 1 minggu |
| **Soft launch** | Semua Mac/Linux operator | 2 minggu parallel Win |
| **Full** | Mac/Linux default channel auto-update | Setelah soft launch stabil |

Windows operator **tidak terpengaruh** selama regression Win tetap green di setiap rilis.

### 14.2 Materi distribusi IT

| OS | File ke operator | Panduan |
|----|------------------|---------|
| Windows | `Resource Management Setup x.x.x.exe` | `INSTALL-WINDOWS.md` |
| macOS | `Resource Management-x.x.x.dmg` | `INSTALL-MACOS.md` |
| Linux | `.AppImage` atau `.deb` | `INSTALL-LINUX.md` |

**Peringatan IT:** jangan kirim `.exe` ke user Mac — bukan bug aplikasi, salah artefak.

### 14.3 Support tier

| Issue | First response |
|-------|----------------|
| Salah installer | Kirim ulang file sesuai OS |
| Mac "app damaged" | Notarize / klik kanan Open (sementara) |
| Linux AppImage tidak jalan | `chmod +x`; cek fuse2 |
| WA timeout | Sama runbook Windows; cek Chrome bundled |
| TG sidecar error | Cek port 8765; restart app |

---

## 15. Risiko & mitigasi

| Risiko | Probabilitas | Dampak | Mitigasi |
|--------|--------------|--------|----------|
| Chrome WA tidak jalan di Linux headless | Sedang | Tinggi | Uji early Fase 6; flags `--disable-dev-shm-usage` |
| Sidecar PyInstaller besar / AV false positive | Sedang | Sedang | Sign binary; whitelist AV internal |
| Mac notarize gagal | Sedang | Tinggi | Pilot unsigned + doc "Open anyway"; budget Apple Dev |
| Build Mac tidak punya runner | Tinggi | Blocker | GitHub Actions macos atau Mac mini IT |
| QA 3× memperlambat release | Tinggi | Sedang | Matrix P0 vs P1; Win tetap fast path |
| Operator install artefak salah OS | Sedian | Rendah | Penamaan file jelas + email template IT |
| whatsapp-web.js break di Chromium Mac | Rendah | Tinggi | Pilot WA sebelum rollout penuh |
| Ukuran download besar (Chrome×3) | Pasti | Sedang | CDN GitHub; komunikasi ke IT |
| Regresi auto-update Win | Rendah | Tinggi | Win build first in CI; smoke test wajib |

---

## 16. Estimasi effort

| Fase | Dev (hari) | IT/ops (hari) | Keterangan |
|------|------------|---------------|------------|
| 0 Keputusan | 0.5 | 1–2 | Apple account, format Linux |
| 1 Runtime refactor | 3–5 | 0 | |
| 2 Build scripts | 5–8 | 1 | Akses mesin Mac/Linux |
| 3 electron-builder | 2–3 | 0 | |
| 4 CI matrix | 3–5 | 2 | Secrets, trial release |
| 5 Validators | 2–3 | 0 | |
| 6 QA pilot | 3–5 | 5–10 | Operator real |
| 7 Docs rollout | 2–3 | 2 | Handbook rebuild |
| **Total** | **~20–32 hari dev** | **~11–17 hari IT** | Parallel partial |

**Timeline kalender realistis:** 6–10 minggu dengan 1 dev + IT part-time, termasuk pilot.

---

## 17. Keputusan terbuka

Centang sebelum Fase 1 dimulai:

| # | Keputusan | Opsi | Rekomendasi | Diputuskan |
|---|-----------|------|-------------|------------|
| D1 | Format Linux utama | AppImage / deb / keduanya | **AppImage** (portable) + deb opsional Ubuntu | ☐ |
| D2 | Mac CPU | Universal / arm64+x64 terpisah | Universal jika CI kuat | ☐ |
| D3 | Mac notarize fase 1 | Ya / pilot unsigned dulu | Notarize jika >3 Mac prod | ☐ |
| D4 | Windows code signing | Ya / tidak | Opsional fase 1 | ☐ |
| D5 | Version first multi-platform | 1.1.0 / 1.0.5 | **1.1.0** (minor feature) | ☐ |
| D6 | CI platform | GitHub Actions / self-hosted | GHA matrix | ☐ |
| D7 | Paritas fitur fase 1 | Full / monitoring-only dulu | **Full** (sesuai requirement) | ☐ |

---

## 18. Lampiran — referensi file

| Path | Peran saat ini |
|------|----------------|
| `package.json` | Versi, electron-builder win-only |
| `scripts/build-installer.ps1` | Orchestrator build Windows |
| `scripts/build-puppeteer-chrome.ps1` | Download Chrome win64 |
| `scripts/build-telegram-sidecar.ps1` | PyInstaller `.exe` |
| `scripts/publish-release.ps1` | Publish win only |
| `scripts/validate-installer-package.mjs` | Gate artefak installer |
| `electron/main/platformLogin/telegramSidecar.ts` | Sidecar spawn (hardcode exe) |
| `electron/main/platformLogin/waPuppeteerChrome.ts` | Resolve Chrome (partial OS-aware) |
| `electron/main/platformLogin/whatsapp.ts` | WA Puppeteer client |
| `electron/main/appEnv.ts` | userData + org-default.env |
| `electron/main/autoUpdate.ts` | electron-updater |
| `electron/main/index.ts` | Lifecycle darwin |
| `python-sidecar/main.py` | Telethon HTTP sidecar |
| `PROJECT.md` | Dokumen resmi (Win only) |
| `INSTALL-WINDOWS.md` | Panduan operator Windows |

---

## Changelog dokumen

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 1.0 | 2026-06-03 | Draft awal — perencanaan lengkap Fase 0–7 |
| 1.1 | 2026-06-03 | Eksekusi Fase 1–5: runtime sidecar, skrip `.mjs`, `package.json` mac/linux, validator, GHA workflow |

---

*Setelah implementasi dimulai, update status header ke "In progress" dan centang task per fase di issue tracker / project board.*
