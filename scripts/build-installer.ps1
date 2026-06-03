# Build installer Windows lengkap (WA + TG + UI + sidecar)
# Jalankan di PC build (Node + Python 3): npm run build:installer

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> Chrome untuk WhatsApp (Puppeteer)" -ForegroundColor Cyan
npm run build:chrome
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Validasi pre-release (desktop + typecheck)" -ForegroundColor Cyan
npm run validate:pre-release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Validasi .env organisasi" -ForegroundColor Cyan
node scripts/validate-org-env.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Sidecar Telegram (.exe)" -ForegroundColor Cyan
npm run build:sidecar
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$orgDefault = Join-Path $root "resources\org-default.env"
if (-not (Test-Path ".env")) {
  Write-Host "ERROR: .env tidak ada. Build dibatalkan." -ForegroundColor Red
  exit 1
}
Copy-Item -Force ".env" $orgDefault
Write-Host "OK: org-default.env dari .env" -ForegroundColor Green

Write-Host "==> Vite + Electron installer" -ForegroundColor Cyan
npm run build:app
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Selesai. Installer: release\" -ForegroundColor Green
Write-Host "Tim internal: install sekali, login saja. Update berikutnya otomatis (Restart)."
