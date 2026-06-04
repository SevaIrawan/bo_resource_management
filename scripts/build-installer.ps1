# Build installer Windows lengkap (WA + TG + UI + sidecar)
# Jalankan di PC build (Node + Python 3): npm run build:installer

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

node scripts/build-installer.mjs win
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
