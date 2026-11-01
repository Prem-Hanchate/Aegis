$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
Set-Location -LiteralPath $projectRoot

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found. Install it and run Setup.ps1 again."
    }
}

Require-Command "node"
Require-Command "npm"

$nodeVersion = (node --version).TrimStart("v")
$nodeMajor = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Detected Node.js $nodeVersion."
}

Write-Host "Installing workspace dependencies..."
npm install

$environmentFiles = @(
    @{ Template = ".env.example"; Target = ".env" },
    @{ Template = "backend\.env.example"; Target = "backend\.env" },
    @{ Template = "contracts\.env.example"; Target = "contracts\.env" },
    @{ Template = "frontend\.env.example"; Target = "frontend\.env" }
)

foreach ($environmentFile in $environmentFiles) {
    $templatePath = Join-Path $projectRoot $environmentFile.Template
    $targetPath = Join-Path $projectRoot $environmentFile.Target

    if ((Test-Path -LiteralPath $templatePath) -and -not (Test-Path -LiteralPath $targetPath)) {
        Copy-Item -LiteralPath $templatePath -Destination $targetPath
        Write-Host "Created $($environmentFile.Target) from its example file."
    }
}

Write-Host ""
Write-Host "Setup complete. Review the generated .env files, then run .\Start.ps1."
