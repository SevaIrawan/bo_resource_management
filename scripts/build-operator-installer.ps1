# Installer untuk operator — TANPA GitHub Release.
# Jalankan di PC IT (Node + Python 3):
#   powershell -ExecutionPolicy Bypass -File scripts/build-operator-installer.ps1
#
# Hasil: folder scripts\dist-operator\ berisi .exe siap copy ke PC operator.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

npm run build:installer
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$releaseDir = Join-Path $root "release"
$setup = Get-ChildItem -Path $releaseDir -Filter "Resource Management Setup $version.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $setup) {
  $setup = Get-ChildItem -Path $releaseDir -Filter "*.exe" | Where-Object { $_.Name -match 'Setup' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $setup) {
  Write-Host "ERROR: Tidak ada Setup .exe di release\" -ForegroundColor Red
  exit 1
}

$outDir = Join-Path $PSScriptRoot "dist-operator"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$dest = Join-Path $outDir $setup.Name
Copy-Item -Force $setup.FullName $dest

Write-Host ""
Write-Host "OK v$version" -ForegroundColor Green
Write-Host "Copy ke PC operator:" -ForegroundColor Cyan
Write-Host "  $dest"
Write-Host ""
Write-Host "Operator: install .exe ini (bukan versi lama). GitHub/auto-update opsional." -ForegroundColor Yellow
