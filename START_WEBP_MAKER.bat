@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title WebP Maker
set "NODE="
where node.exe >nul 2>nul
if not errorlevel 1 (
  node -e "process.exit(+process.versions.node.split('.')[0]>=18?0:1)" >nul 2>nul
  if not errorlevel 1 set "NODE=node"
)
if not defined NODE (
  if not exist ".runtime\node\node.exe" (
    echo Downloading a private Node.js runtime for WebP Maker ^(one time only^)...
    if not exist ".runtime" mkdir ".runtime"
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$u='https://nodejs.org/dist/v22.16.0/node-v22.16.0-win-x64.zip';Invoke-WebRequest $u -OutFile '.runtime\node.zip';Expand-Archive '.runtime\node.zip' '.runtime\unpacked' -Force;$src=Get-ChildItem '.runtime\unpacked' -Filter 'node.exe' -Recurse | Select-Object -First 1; if(!$src){throw 'Node executable missing'};New-Item '.runtime\node' -ItemType Directory -Force|Out-Null;Copy-Item ($src.DirectoryName+'\*') '.runtime\node' -Recurse -Force;Remove-Item '.runtime\node.zip','.runtime\unpacked' -Recurse -Force"
    if errorlevel 1 goto :fail
  )
  set "PATH=%CD%\.runtime\node;%PATH%"
  set "NODE=%CD%\.runtime\node\node.exe"
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing private Electron desktop runtime ^(one time only^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
)
echo Starting WebP Maker...
call "node_modules\.bin\electron.cmd" "."
exit /b 0
:fail
echo WebP Maker could not prepare its desktop runtime. Check your internet connection and try again.
pause
exit /b 1
