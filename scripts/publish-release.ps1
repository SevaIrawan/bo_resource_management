# Upload installer ke GitHub Releases (auto-update di PC user)
# Prasyarat: naikkan version di package.json, GH_TOKEN dengan scope repo
#
#   $env:GH_TOKEN = "ghp_xxxx"
#   npm run publish:github

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:GH_TOKEN) {
  Write-Host "ERROR: Set GH_TOKEN dulu (GitHub Personal Access Token, scope repo)." -ForegroundColor Red
  Write-Host '  $env:GH_TOKEN = "ghp_..."' -ForegroundColor Yellow
  exit 1
}

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "==> Build installer v$version" -ForegroundColor Cyan
npm run build:installer
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$unpacked = Join-Path $root "release\win-unpacked"
if (-not (Test-Path $unpacked)) {
  throw "Folder release\win-unpacked tidak ada. Build gagal?"
}

Write-Host "==> Upload ke GitHub Releases" -ForegroundColor Cyan
npx electron-builder --win --publish always --prepackaged $unpacked
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Selesai. PC user yang sudah install akan dapat update otomatis (cek ~12 detik setelah buka app)." -ForegroundColor Green
Write-Host "Pastikan GitHub Release v$version PUBLIC (bukan draft)." -ForegroundColor Green
