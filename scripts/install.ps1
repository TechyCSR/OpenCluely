# OpenCluely v2 - Native Windows PowerShell Installer
# Run: irm https://opencluely.techycsr.dev/install.ps1 | iex

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Installing OpenCluely v2 for Windows " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$Repo = "TechyCSR/OpenCluely"
$TempInstaller = "$env:TEMP\OpenCluely-Setup.exe"

try {
    Write-Host "[1/3] Fetching latest release metadata..." -ForegroundColor Yellow
    $ApiUrl = "https://api.github.com/repos/$Repo/releases/latest"
    $Release = Invoke-RestMethod -Uri $ApiUrl -Headers @{ "User-Agent" = "OpenCluely-Installer" }
    
    $Asset = $Release.assets | Where-Object { $_.name -like "*Setup*.exe" -or $_.name -like "*.exe" } | Select-Object -First 1
    if (-not $Asset) {
        throw "Could not find a valid Windows executable asset in the latest release."
    }

    $DownloadUrl = $Asset.browser_download_url
    Write-Host "[2/3] Downloading OpenCluely v2 ($($Asset.name))..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempInstaller -UseBasicParsing

    Write-Host "[3/3] Launching OpenCluely v2..." -ForegroundColor Green
    Start-Process -FilePath $TempInstaller

    Write-Host "Installation initiated successfully!" -ForegroundColor Green
}
catch {
    Write-Host "Installation failed: $($_.Exception.Message)" -ForegroundColor Red
    Exit 1
}
