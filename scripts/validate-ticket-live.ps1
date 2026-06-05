# Validasi 100% ticket vs bookmark — tanpa deploy, baca DB langsung.
# Usage: powershell -File scripts/validate-ticket-live.ps1
#        powershell -File scripts/validate-ticket-live.ps1 -Brand SBMY

param(
    [string]$Brand = "SBMY"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== [1/4] Unit logika ticket (offline) ===" -ForegroundColor Cyan
npm run validate:ticket-logic
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== [2/4] Kontrak reconcile (offline) ===" -ForegroundColor Cyan
npm run validate:ticket-reconcile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== [3/4] Typecheck ===" -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== [4/4] LIVE DB — brand $Brand ===" -ForegroundColor Cyan
if ($Brand) {
    node scripts/validate-ticket-live.mjs --brand $Brand
} else {
    node scripts/validate-ticket-live.mjs
}
exit $LASTEXITCODE
