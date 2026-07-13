#Requires -RunAsAdministrator
# PCC-ERP Windows 11 Server Setup & Installer Script
# Script to automate deployment of PCC-ERP on Windows 11.

$ErrorActionPreference = "Stop"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     PCC-ERP Auto-Installer for Windows 11 Server" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Winget Availability
Write-Host "[1/6] Checking for Windows Package Manager (winget)..." -ForegroundColor Yellow
if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "winget is available." -ForegroundColor Green
} else {
    Write-Host "winget is not found! Please make sure you are running Windows 11 and App Installer is updated." -ForegroundColor Red
    exit
}

# 2. Install Git
Write-Host "[2/6] Checking/Installing Git..." -ForegroundColor Yellow
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host "Git is already installed." -ForegroundColor Green
} else {
    Write-Host "Installing Git via winget..." -ForegroundColor Blue
    winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements
    Write-Host "Git installed successfully. (Please restart script or reload env to use)" -ForegroundColor Green
}

# 3. Install Node.js LTS
Write-Host "[3/6] Checking/Installing Node.js LTS..." -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "Node.js is already installed. Version: $(node -v)" -ForegroundColor Green
} else {
    Write-Host "Installing Node.js LTS via winget..." -ForegroundColor Blue
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
    Write-Host "Node.js LTS installed successfully." -ForegroundColor Green
    
    # Reload environment path variable so we can use npm immediately
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 4. Install PM2 (Process Manager) & PM2 Service
Write-Host "[4/6] Setting up PM2 Process Manager..." -ForegroundColor Yellow
try {
    # Check if npm is available
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        # Fallback if PATH wasn't refreshed in this session
        $env:Path += ";C:\Program Files\nodejs"
    }
    
    Write-Host "Installing PM2 globally..." -ForegroundColor Blue
    npm install pm2 -g
    
    Write-Host "Installing PM2 Windows Service wrapper..." -ForegroundColor Blue
    npm install pm2-windows-service -g
    
    Write-Host "PM2 Setup Completed." -ForegroundColor Green
} catch {
    Write-Host "Error installing PM2. Make sure Node.js is active on PATH. You may need to restart PowerShell." -ForegroundColor Red
}

# 5. Configure Windows Firewall for Port 3000
Write-Host "[5/6] Opening Windows Firewall Port 3000..." -ForegroundColor Yellow
$RuleName = "PCC-ERP NextJS Port 3000"
$RuleExists = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($RuleExists) {
    Write-Host "Firewall rule '$RuleName' already exists." -ForegroundColor Green
} else {
    New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Description "Allow inbound traffic to PCC-ERP Next.js App"
    Write-Host "Firewall rule created successfully for Port 3000." -ForegroundColor Green
}

# 6. Deployment Helper
Write-Host "[6/6] App deployment steps:" -ForegroundColor Yellow
Write-Host "To complete the setup:" -ForegroundColor Cyan
Write-Host " 1. Copy the project folder to: C:\pcc-erp" -ForegroundColor White
Write-Host " 2. Open PowerShell in C:\pcc-erp and run:" -ForegroundColor White
Write-Host "    npm install" -ForegroundColor Green
Write-Host "    npm run build" -ForegroundColor Green
Write-Host "    pm2 start npm --name 'pcc-erp' -- start" -ForegroundColor Green
Write-Host "    pm2 save" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "Setup Script Completed! Please restart your terminal/PC to apply PATH changes." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
