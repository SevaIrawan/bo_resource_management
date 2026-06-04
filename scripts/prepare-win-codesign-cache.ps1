# electron-builder #8149: winCodeSign-2.6.0.7z gagal extract symlink darwin/*.dylib di Windows.
# Workaround: 7za extract dengan -xr!darwin (skip folder macOS di dalam paket Windows).
# https://github.com/electron-userland/electron-builder/issues/8149

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign'
$target = Join-Path $cacheRoot 'winCodeSign-2.6.0'

function Test-WinCodeSignCacheOk {
  param([string]$Dir)
  return (
    (Test-Path (Join-Path $Dir 'windows-10\x64\signtool.exe')) -or
    (Test-Path (Join-Path $Dir 'windows\10\amd64\signtool.exe'))
  )
}

if (Test-WinCodeSignCacheOk $target) {
  Write-Host "OK: winCodeSign cache sudah ada di $target"
  exit 0
}

$7za = Join-Path $root 'node_modules\7zip-bin\win\x64\7za.exe'
if (-not (Test-Path $7za)) {
  Write-Error "7za tidak ada ($7za). Jalankan npm ci dulu."
}

Write-Host "==> Siapkan winCodeSign cache (7za -xr!darwin)..."
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

$archiveUrl = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z'
$archiveFile = Join-Path $cacheRoot 'winCodeSign-2.6.0.7z'
if (-not (Test-Path $archiveFile)) {
  Invoke-WebRequest -Uri $archiveUrl -OutFile $archiveFile -UseBasicParsing
}

if (Test-Path $target) { Remove-Item -Recurse -Force $target }
New-Item -ItemType Directory -Force -Path $target | Out-Null

& $7za x -bd "-o$target" '-xr!darwin' $archiveFile | Out-Host
if ($LASTEXITCODE -ne 0) {
  Write-Error "7za extract winCodeSign gagal (exit $LASTEXITCODE)"
}

if (-not (Test-WinCodeSignCacheOk $target)) {
  Write-Error "Cache tidak valid setelah extract: $target"
}

Write-Host "OK: winCodeSign cache -> $target"
