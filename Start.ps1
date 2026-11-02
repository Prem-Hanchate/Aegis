$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$nodeModulesPath = Join-Path $projectRoot "node_modules"
if (-not (Test-Path -LiteralPath $nodeModulesPath)) {
    throw "Dependencies are not installed. Run .\Setup.ps1 first."
}

function Start-ProjectProcess {
    param(
        [string]$WorkingDirectory,
        [string]$Command
    )

    $escapedWorkingDirectory = $WorkingDirectory.Replace("'", "''")
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $WorkingDirectory -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location -LiteralPath '$escapedWorkingDirectory'; $Command"
    )
}

function Test-MongoDbPort {
    return Test-NetConnection -ComputerName "127.0.0.1" -Port 27017 -InformationLevel Quiet
}

$mongoAvailable = Test-MongoDbPort
if (-not $mongoAvailable -and (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "Starting MongoDB with Docker..."
    docker compose up -d mongo
    if ($LASTEXITCODE -eq 0) {
        for ($attempt = 1; $attempt -le 15; $attempt++) {
            Start-Sleep -Seconds 1
            if (Test-MongoDbPort) {
                $mongoAvailable = $true
                break
            }
        }
    } else {
        Write-Warning "Docker Compose could not start MongoDB. Continuing to use an existing local MongoDB if available."
    }
}

if (-not $mongoAvailable) {
    $mongoAvailable = Test-MongoDbPort
}

if ($mongoAvailable) {
    Write-Host "MongoDB is available at mongodb://127.0.0.1:27017."
} else {
    Write-Warning "MongoDB is not available on port 27017. The backend may not start until MongoDB is running."
}

$contractsPath = Join-Path $projectRoot "contracts"
$backendPath = Join-Path $projectRoot "backend"
$frontendPath = Join-Path $projectRoot "frontend"
$lanAddress = Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp |
    Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" } |
    Select-Object -First 1 -ExpandProperty IPAddress
if (-not $lanAddress) {
    $lanAddress = "localhost"
}
$browserOrigin = "http://${lanAddress}:5173"

Write-Host "Starting local Hardhat node, backend, and frontend..."
Start-ProjectProcess -WorkingDirectory $contractsPath -Command "npx hardhat node"
Start-ProjectProcess -WorkingDirectory $backendPath -Command "`$env:FRONTEND_ORIGIN='$browserOrigin'; `$env:AUTH_DOMAIN='${lanAddress}:5173'; npm run dev"
Start-ProjectProcess -WorkingDirectory $frontendPath -Command "npm run dev"

Write-Host ""
Write-Host "Services started in separate PowerShell windows:"
Write-Host "  Hardhat: http://127.0.0.1:8545"
Write-Host "  Backend: http://${lanAddress}:4000"
Write-Host "  Frontend: ${browserOrigin}"
Write-Host "  Bootstrap admin wallet: 0xfe2400b9A20f2A3C824D8D46c68046b0264c6253"
