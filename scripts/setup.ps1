# One-shot setup — Node + Python dependencies
# Usage (Windows): npm run setup

Write-Host "==> npm install" -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Python sidecar (Telethon, FastAPI, openpyxl…)" -ForegroundColor Cyan
py -3 -m pip install -r python-sidecar/requirements.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "  1. Copy .env.example -> .env and fill Supabase + Telegram keys"
Write-Host "  2. Supabase SQL: baca SUPABASE_RUNBOOK.md (003->017->020->023 ATAU 018->020->023)"
Write-Host "  3. npm run dev"
