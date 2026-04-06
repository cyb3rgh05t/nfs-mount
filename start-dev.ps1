#!/usr/bin/env pwsh
# NFS-MergerFS Manager - Local Development Startup
# Startet Backend (FastAPI) und Frontend (Vite) lokal

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  NFS-MergerFS Manager - Dev Mode" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Python venv ──
$venvPath = Join-Path $ROOT "venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$venvPip = Join-Path $venvPath "Scripts\pip.exe"
$venvUvicorn = Join-Path $venvPath "Scripts\uvicorn.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "[SETUP] Erstelle Python venv..." -ForegroundColor Yellow
    python -m venv $venvPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Python venv konnte nicht erstellt werden!" -ForegroundColor Red
        exit 1
    }
}

# Upgrade pip first to ensure latest wheel support
Write-Host "[SETUP] Upgrade pip..." -ForegroundColor DarkGray
& $venvPython -m pip install --upgrade pip -q 2>$null

Write-Host "[SETUP] Installiere Python Dependencies..." -ForegroundColor Yellow
& $venvPip install -q -r (Join-Path $ROOT "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] pip install fehlgeschlagen!" -ForegroundColor Red
    exit 1
}

# ── Node modules ──
$frontendDir = Join-Path $ROOT "frontend"
$nodeModules = Join-Path $frontendDir "node_modules"

if (-not (Test-Path $nodeModules)) {
    Write-Host "[SETUP] Installiere Frontend Dependencies..." -ForegroundColor Yellow
    Push-Location $frontendDir
    npm install
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "[ERROR] npm install fehlgeschlagen!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
} else {
    Write-Host "[SETUP] node_modules vorhanden, ueberspringe npm install" -ForegroundColor DarkGray
}

# ── Datenbank-Ordner ──
$dataDir = Join-Path $ROOT "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

# ── Environment ──
$env:DATABASE_URL = "sqlite+aiosqlite:///$dataDir/nfs-manager.db"
$env:JWT_SECRET = "dev-secret-do-not-use-in-production"

Write-Host ""
Write-Host "[START] Backend  -> http://localhost:8080" -ForegroundColor Green
Write-Host "[START] Frontend -> http://localhost:3000" -ForegroundColor Green
Write-Host "[INFO]  API Docs -> http://localhost:8080/docs" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Druecke Ctrl+C um beide Prozesse zu beenden." -ForegroundColor DarkGray
Write-Host ""

# ── Starte Backend als Job ──
$backendJob = Start-Job -ScriptBlock {
    param($uvicorn, $root, $dbUrl, $jwtSecret)
    $env:DATABASE_URL = $dbUrl
    $env:JWT_SECRET = $jwtSecret
    Set-Location $root
    & $uvicorn "backend.app.main:app" --host 0.0.0.0 --port 8080 --reload
} -ArgumentList $venvUvicorn, $ROOT, $env:DATABASE_URL, $env:JWT_SECRET

# ── Starte Frontend als Job ──
$frontendJob = Start-Job -ScriptBlock {
    param($frontendDir)
    Set-Location $frontendDir
    npm run dev
} -ArgumentList $frontendDir

# ── Warte und zeige Output ──
try {
    while ($true) {
        # Backend Output
        $backendOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
        if ($backendOutput) {
            $backendOutput | ForEach-Object {
                Write-Host "[API] $_" -ForegroundColor Blue
            }
        }

        # Frontend Output
        $frontendOutput = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
        if ($frontendOutput) {
            $frontendOutput | ForEach-Object {
                Write-Host "[UI]  $_" -ForegroundColor Magenta
            }
        }

        # Check ob Jobs noch laufen
        if ($backendJob.State -eq "Failed") {
            Write-Host "[ERROR] Backend abgestuerzt!" -ForegroundColor Red
            Receive-Job -Job $backendJob -ErrorAction SilentlyContinue | Write-Host -ForegroundColor Red
            break
        }
        if ($frontendJob.State -eq "Failed") {
            Write-Host "[ERROR] Frontend abgestuerzt!" -ForegroundColor Red
            Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue | Write-Host -ForegroundColor Red
            break
        }

        Start-Sleep -Milliseconds 500
    }
}
finally {
    Write-Host ""
    Write-Host "[STOP] Beende Prozesse..." -ForegroundColor Yellow
    Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
    Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
    Remove-Job -Job $frontendJob -Force -ErrorAction SilentlyContinue
    Write-Host "[DONE] Alle Prozesse beendet." -ForegroundColor Green
}
