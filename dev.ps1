# Chế độ phát triển: Flask (API, cổng 5000) ở cửa sổ riêng + Vite hot-reload (cổng 5173).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot'; py app.py"
Set-Location frontend
if (-not (Test-Path node_modules)) { npm install }
npm run dev
