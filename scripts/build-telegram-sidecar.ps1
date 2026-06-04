# Bundel sidecar Telegram jadi .exe (tanpa Python di PC user)
# Dipanggil dari: npm run build:sidecar

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sidecarDir = Join-Path $root "python-sidecar"
$outDir = Join-Path $root "resources\sidecar"
$exeName = "rm-telegram-sidecar.exe"

Write-Host "==> pip install (sidecar + PyInstaller)" -ForegroundColor Cyan
py -3 -m pip install -q -r (Join-Path $sidecarDir "requirements.txt") pyinstaller

$distPath = Join-Path $root "resources\sidecar-dist"
$workPath = Join-Path $root "resources\sidecar-build"
Remove-Item -Recurse -Force $distPath, $workPath, $outDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "==> PyInstaller (onefile)" -ForegroundColor Cyan
Push-Location $sidecarDir
py -3 -m PyInstaller --noconfirm --clean --onefile `
  --name rm-telegram-sidecar `
  --distpath $distPath `
  --workpath $workPath `
  --specpath $workPath `
  --collect-all uvicorn `
  --collect-all fastapi `
  --hidden-import=telethon `
  --hidden-import=qrcode `
  main.py
Pop-Location

$built = Join-Path $distPath $exeName
if (-not (Test-Path $built)) {
  throw "PyInstaller gagal: $built tidak ada"
}

Copy-Item -Force $built (Join-Path $outDir $exeName)
Write-Host "OK: $outDir\$exeName" -ForegroundColor Green

Remove-Item -Recurse -Force $distPath, $workPath -ErrorAction SilentlyContinue
Write-Host "OK: bersihkan resources/sidecar-build dan sidecar-dist" -ForegroundColor Green
