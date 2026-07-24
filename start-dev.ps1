# Dev stack for Shiye (Windows / PowerShell).
# UI port: $env:SHIYE_UI_PORT (default 5174). API health port: $env:API_PORT (default 3000).
# Requires: Docker Desktop, Node.js 20+, npm/pnpm deps installed in vane-api and vane-ui.
# Usage: .\start-dev.ps1   (from repo root, or any path)

$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
Set-Location $Root

if (-not $env:SHIYE_UI_PORT) { $env:SHIYE_UI_PORT = '5174' }
if (-not $env:API_PORT) { $env:API_PORT = '3000' }

$ApiPort = [int]$env:API_PORT
$UiPort = [int]$env:SHIYE_UI_PORT

$script:ApiProcess = $null
$script:UiProcess = $null

function Free-TcpPort {
    param([int]$Port)

    try {
        $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    } catch {
        $listeners = @()
    }

    $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }
    foreach ($procId in $pids) {
        Write-Host "Port $Port in use — stopping PID $procId ..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    if ($pids) {
        Start-Sleep -Milliseconds 400
    }
}

function Start-NpmDev {
    param([string]$WorkingDirectory)

    $npm = (Get-Command npm -ErrorAction Stop).Source
    return Start-Process -FilePath $npm -ArgumentList @('run', 'dev') `
        -WorkingDirectory $WorkingDirectory -PassThru -NoNewWindow
}

function Test-ApiHealth {
    param([int]$Port)

    try {
        $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" `
            -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

function Invoke-Cleanup {
    if ($script:ApiProcess -and -not $script:ApiProcess.HasExited) {
        Stop-Process -Id $script:ApiProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($script:UiProcess -and -not $script:UiProcess.HasExited) {
        Stop-Process -Id $script:UiProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Free-TcpPort -Port $UiPort
    try {
        docker compose stop searxng 2>$null | Out-Null
    } catch {
        # ignore
    }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error 'Docker not found. Install Docker Desktop and ensure docker is on PATH.'
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error 'npm not found. Install Node.js 20+ and ensure npm is on PATH.'
    exit 1
}

try {
    Write-Host 'Starting SearXNG...'
    docker compose up searxng -d
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up searxng failed (exit $LASTEXITCODE)"
    }

    Free-TcpPort -Port $ApiPort

    Write-Host 'Starting vane-api...'
    $env:PORT = "$ApiPort"
    $script:ApiProcess = Start-NpmDev -WorkingDirectory (Join-Path $Root 'vane-api')

    Write-Host "Waiting for vane-api on http://127.0.0.1:$ApiPort/health ..."
    $apiUp = $false
    for ($i = 0; $i -lt 90; $i++) {
        if (Test-ApiHealth -Port $ApiPort) {
            Write-Host 'vane-api is up.'
            $apiUp = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $apiUp) {
        Write-Host 'Timed out waiting for vane-api; starting UI anyway.'
    }

    Free-TcpPort -Port $UiPort

    Write-Host "Starting vane-ui on http://127.0.0.1:$UiPort ..."
    Write-Host "  → Bookmark: http://localhost:$UiPort"
    $script:UiProcess = Start-NpmDev -WorkingDirectory (Join-Path $Root 'vane-ui')

    Write-Host ''
    Write-Host 'Press Ctrl+C to stop vane-api, vane-ui, and SearXNG.'
    Wait-Process -Id @($script:ApiProcess.Id, $script:UiProcess.Id)
} catch {
    Write-Error $_
    exit 1
} finally {
    Invoke-Cleanup
}
