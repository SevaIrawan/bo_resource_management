# Unduh Chromium untuk WhatsApp (Puppeteer) dan siapkan untuk electron-builder extraResources
# Dipanggil dari: npm run build:chrome / build-installer

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$cacheDir = Join-Path $root "resources\puppeteer-cache"
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

$env:PUPPETEER_CACHE_DIR = $cacheDir

Write-Host "==> Puppeteer: install Chrome (cache: resources\puppeteer-cache)" -ForegroundColor Cyan
npx puppeteer browsers install chrome
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$chromeRoot = Join-Path $cacheDir "chrome"
if (-not (Test-Path $chromeRoot)) {
  throw "Chrome tidak ada di $chromeRoot setelah install."
}

$exe = Get-ChildItem -Path $chromeRoot -Recurse -Filter "chrome.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) {
  throw "chrome.exe tidak ditemukan di bawah $chromeRoot"
}

Write-Host "OK: $($exe.FullName)" -ForegroundColor Green
