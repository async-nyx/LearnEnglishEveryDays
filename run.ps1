# Chạy Subloop: build giao diện (nếu chưa có) rồi mở máy chủ Flask ở cổng 5000.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path "frontend/node_modules")) { Push-Location frontend; npm install; Pop-Location }
if (-not (Test-Path "frontend/dist/index.html")) { Push-Location frontend; npm run build; Pop-Location }
py -m pip install -q -r requirements.txt
py app.py
