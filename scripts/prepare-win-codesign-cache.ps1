# electron-builder #8149: winCodeSign-2.6.0.7z gagal extract symlink di Windows tanpa admin.
# Workaround resmi komunitas: cache dari source .zip (tanpa symlink), bukan .7z otomatis.
# https://github.com/electron-userland/electron-builder/issues/8149

$ErrorActionPreference = 'Stop'
$cacheRoot = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign'
$target = Join-Path $cacheRoot 'winCodeSign-2.6.0'

if (Test-Path (Join-Path $target 'windows\10\amd64')) {
  Write-Host "OK: winCodeSign cache sudah ada di $target"
  exit 0
}

Write-Host "==> Siapkan winCodeSign cache (tanpa symlink)..."
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

$zipUrl = 'https://github.com/electron-userland/electron-builder-binaries/archive/refs/tags/winCodeSign-2.6.0.zip'
$zipFile = Join-Path $cacheRoot 'winCodeSign-2.6.0-src.zip'
Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing

$extractTemp = Join-Path $cacheRoot '_extract'
if (Test-Path $extractTemp) { Remove-Item -Recurse -Force $extractTemp }
Expand-Archive -Path $zipFile -DestinationPath $extractTemp -Force

$inner = Get-ChildItem -Path $extractTemp -Directory | Select-Object -First 1
if (-not $inner) {
  Write-Error 'Extract winCodeSign zip gagal: folder kosong'
}

if (Test-Path $target) { Remove-Item -Recurse -Force $target }
Move-Item -Path $inner.FullName -Destination $target

Remove-Item -Force $zipFile -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $extractTemp -ErrorAction SilentlyContinue

Write-Host "OK: winCodeSign cache -> $target"
