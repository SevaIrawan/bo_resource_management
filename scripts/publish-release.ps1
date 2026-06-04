# Upload installer Windows ke GitHub Releases (auto-update di PC user)
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
Write-Host "==> Build + publish Windows v$version" -ForegroundColor Cyan
npm run build:installer:win
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node scripts/publish-release.mjs win
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Selesai. PC Windows yang sudah install akan dapat update otomatis." -ForegroundColor Green
Write-Host "Mac/Linux + upload Releases: jalankan workflow GitHub Actions 'Release multi-platform' (otomatis)." -ForegroundColor Yellow
