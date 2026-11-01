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

if (Get-Command "docker" -ErrorAction SilentlyContinue) {
    Write-Host "Starting MongoDB with Docker..."
    docker compose up -d mongo
    if ($LASTEXITCODE -ne 0) {
        throw "MongoDB could not be started with Docker Compose."
    }
} else {
    Write-Warning "Docker was not found. Ensure MongoDB is running before using the backend."
}

$contractsPath = Join-Path $projectRoot "contracts"
$backendPath = Join-Path $projectRoot "backend"
$frontendPath = Join-Path $projectRoot "frontend"

Write-Host "Starting local Hardhat node, backend, and frontend..."
Start-ProjectProcess -WorkingDirectory $contractsPath -Command "npx hardhat node"
Start-ProjectProcess -WorkingDirectory $backendPath -Command "npm run dev"
Start-ProjectProcess -WorkingDirectory $frontendPath -Command "npm run dev"

Write-Host ""
Write-Host "Services started in separate PowerShell windows:"
Write-Host "  Hardhat: http://127.0.0.1:8545"
Write-Host "  Backend: http://localhost:4000"
Write-Host "  Frontend: http://localhost:5173"
