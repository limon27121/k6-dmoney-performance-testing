# Runs the full 2-minute k6 test with Customer transaction limits turned off,
# and always turns them back on afterwards (even on failure or Ctrl+C).
#
# Usage (from the project folder, in the VS Code terminal):
#   .\scripts\run-full-test.ps1              # run label "latest"
#   .\scripts\run-full-test.ps1 -Run run3    # reports/summary-run3.*, dashboard-run3.html

param(
    [string]$Run = "latest",
    [string]$ServerEnv = "F:\Road To Sdet\dmoney\dmoney-transaction-api\.env",
    [string]$Mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Read DB settings from the DMoney server's .env
$envVars = @{}
Get-Content $ServerEnv | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$' } | ForEach-Object {
    $envVars[$Matches[1]] = $Matches[2].Trim()
}
$env:MYSQL_PWD = $envVars["DB_PASSWORD"]

function Set-CustomerLimits([int]$active) {
    & $Mysql -h $envVars["DB_HOST"] -u $envVars["DB_USER"] $envVars["DB_NAME"] -e `
        "UPDATE transactionlimits SET is_active = $active WHERE role = 'Customer'; SELECT role, period, max_count, is_active FROM transactionlimits;"
    if ($LASTEXITCODE -ne 0) { throw "MySQL command failed" }
}

$exitCode = 1
try {
    Write-Host "`n[1/3] Turning Customer limits OFF" -ForegroundColor Yellow
    Set-CustomerLimits 0

    Write-Host "`n[2/3] Running k6 (run: $Run)" -ForegroundColor Yellow
    $env:K6_WEB_DASHBOARD = "true"
    $env:K6_WEB_DASHBOARD_EXPORT = "reports/dashboard-$Run.html"
    k6 run -e RUN=$Run tests/dmoney-load.js
    $exitCode = $LASTEXITCODE
}
finally {
    Write-Host "`n[3/3] Turning Customer limits back ON" -ForegroundColor Yellow
    Set-CustomerLimits 1
    Remove-Item Env:MYSQL_PWD, Env:K6_WEB_DASHBOARD, Env:K6_WEB_DASHBOARD_EXPORT -ErrorAction SilentlyContinue
}

if ($exitCode -eq 0) {
    Write-Host "`nAll thresholds passed. Reports: reports/summary-$Run.html, reports/dashboard-$Run.html" -ForegroundColor Green
} else {
    Write-Host "`nk6 exited with code $exitCode (99 = a threshold failed)." -ForegroundColor Red
}
exit $exitCode
