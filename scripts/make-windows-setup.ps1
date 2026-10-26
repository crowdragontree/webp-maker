# Builds the one-click Setup that moves users on old copies (v1.0.2-v1.1.0, whose
# in-app updater cannot install updates on Windows) to v1.1.1 with a double-click.
# Output: an installer .exe plus a payload .zip it reads from the same folder.
# (The payload is kept as a side-by-side .zip, not embedded, so nothing can corrupt
# a multi-megabyte base64 blob inside the script.)
param(
  [Parameter(Mandatory=$true)][string]$AppDir,   # dist/Juicy Chat Creator Tools-win32-x64
  [Parameter(Mandatory=$true)][string]$OutDir    # where to write the setup files
)
$ErrorActionPreference = 'Stop'
$AppDir  = (Resolve-Path $AppDir).Path
$exeName = 'JuicyChat Creator Tool.exe'
if (!(Test-Path (Join-Path $AppDir $exeName))) { throw "The app folder is missing $exeName." }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# 1. Payload zip, written straight into OutDir beside the installer.
$payloadName = 'JuicyChat-Creator-Tool-v1.1.1-payload.zip'
$payloadZip  = Join-Path $OutDir $payloadName
if (Test-Path $payloadZip) { Remove-Item -LiteralPath $payloadZip -Force }
# Zip the CONTENTS of the app folder so entries sit at the zip root (no wrapper folder).
Compress-Archive -Path (Join-Path $AppDir '*') -DestinationPath $payloadZip -Force
# Verify the zip actually holds the program, and that WebP-Maker.exe is dropped on install (not from the zip).
$verify = Join-Path ([IO.Path]::GetTempPath()) ('verify-' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $payloadZip -DestinationPath $verify -Force
$check = Get-ChildItem -LiteralPath $verify -Filter $exeName -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $check) { throw "Payload zip is broken: $exeName not found after re-extracting $payloadZip." }
Write-Host ("Payload verified: {0} (root: {1})" -f $payloadName, $check.FullName.Substring($verify.Length))
Remove-Item -LiteralPath $verify -Recurse -Force

# 2. Installer script. Reads the payload zip sitting next to it.
$installer = @"
param([string]`$Target,[switch]`$NoLaunch)
`$ErrorActionPreference = 'Stop'
`$exeName='JuicyChat Creator Tool.exe'; `$legacy='WebP-Maker.exe'
`$payloadName='$payloadName'
function Info(`$m){ Write-Host `$m }
try {
  `$interactive = (-not `$NoLaunch) -and (-not `$Target)
  if (`$interactive) { Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue }

  # The payload zip lives next to this script (or next to the .exe when compiled).
  `$here = if (`$PSScriptRoot) { `$PSScriptRoot } elseif (`$PSCommandPath) { Split-Path `$PSCommandPath -Parent } else { Split-Path ([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName) -Parent }
  `$zip = Join-Path `$here `$payloadName
  if (!(Test-Path `$zip)) { throw "Payload '`$payloadName' must sit in the same folder as Setup." }

  `$tmp = Join-Path `$env:TEMP ('jcct-setup-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path `$tmp | Out-Null
  `$src = Join-Path `$tmp 'app'
  New-Item -ItemType Directory -Path `$src -Force | Out-Null
  Expand-Archive -LiteralPath `$zip -DestinationPath `$src -Force
  `$exeItem = Get-ChildItem -LiteralPath `$src -Filter `$exeName -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not `$exeItem) { throw "Payload did not unpack: `$exeName not found under `$src." }
  `$src = `$exeItem.DirectoryName

  # Close any running copy so its folder can be swapped.
  foreach(`$n in 'WebP-Maker','JuicyChat Creator Tool'){
    Get-Process -Name `$n -ErrorAction SilentlyContinue | ForEach-Object { try{`$_.CloseMainWindow()|Out-Null}catch{} }
  }
  Start-Sleep 2
  foreach(`$n in 'WebP-Maker','JuicyChat Creator Tool'){
    Get-Process -Name `$n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep 1

  # Find the existing install folder (contains resources\app\package.json).
  `$target = `$Target
  if (-not `$target) {
    `$c = @()
    foreach(`$exe in @(`$legacy,`$exeName)){
      `$c += Get-ChildItem -Path "`$env:USERPROFILE\Downloads","`$env:USERPROFILE\Desktop","`$env:LOCALAPPDATA","`$env:APPDATA","`$env:USERPROFILE" ``
        -Filter `$exe -Recurse -ErrorAction SilentlyContinue -Depth 6 |
        Where-Object { Test-Path (Join-Path `$_.DirectoryName 'resources\app\package.json') }
    }
    `$target = `$c | Select-Object -ExpandProperty DirectoryName -Unique | Select-Object -First 1
  }
  if ((-not `$target) -and `$interactive) {
    `$fb = New-Object System.Windows.Forms.FolderBrowserDialog
    `$fb.Description = 'Select your existing WebP-Maker / Juicy Chat Creator Tool folder'
    if (`$fb.ShowDialog() -eq 'OK') { `$target = `$fb.SelectedPath }
  }
  if (-not `$target) { throw 'Could not find the existing installation. Setup cancelled.' }

  Info "Installing Juicy Chat Creator Tool v1.1.1 into: `$target"
  `$backup = Join-Path (Split-Path `$target -Parent) ('.jcct-setup-backup-'+[guid]::NewGuid().ToString('N').Substring(0,8))
  Move-Item -LiteralPath `$target -Destination `$backup
  try {
    New-Item -ItemType Directory -Path `$target | Out-Null
    Copy-Item -Path (Join-Path `$src '*') -Destination `$target -Recurse -Force
    if (!(Test-Path (Join-Path `$target `$exeName))) { throw 'New program missing after copy.' }
    Remove-Item -LiteralPath (Join-Path `$target `$legacy) -Force -ErrorAction SilentlyContinue
  } catch {
    Info "Install failed, restoring previous version: `$_"
    Remove-Item -LiteralPath `$target -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath `$backup -Destination `$target
    throw
  }

  # Re-point shortcuts that opened WebP-Maker.exe.
  `$newExe = Join-Path `$target `$exeName; `$oldExe = Join-Path `$target `$legacy
  `$sh = New-Object -ComObject WScript.Shell
  foreach(`$d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'),
    (Join-Path `$env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'),
    (Join-Path `$env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\StartMenu'))){
    if (-not (Test-Path `$d)) { continue }
    Get-ChildItem -Path `$d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      try { `$l = `$sh.CreateShortcut(`$_.FullName)
        if (`$l.TargetPath -and (`$l.TargetPath.ToLower() -eq `$oldExe.ToLower())) { `$l.TargetPath=`$newExe; `$l.WorkingDirectory=`$target; `$l.Save() }
      } catch {}
    }
  }

  if (`$NoLaunch) {
    Info 'Done. Juicy Chat Creator Tool v1.1.1 is installed (not launched: -NoLaunch).'
  } else {
    Start-Process -FilePath `$newExe -WorkingDirectory `$target
    Info 'Done. Juicy Chat Creator Tool v1.1.1 is installed and running.'
  }
  if (-not `$NoLaunch) { Start-Sleep 3 }
  Remove-Item -LiteralPath `$backup -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath `$tmp -Recurse -Force -ErrorAction SilentlyContinue
  if (`$interactive) { [void][System.Windows.Forms.MessageBox]::Show('Juicy Chat Creator Tool has been updated to v1.1.1.','Setup complete') }
} catch {
  Write-Host "SETUP FAILED: `$_"
  if (`$interactive) { try { [void][System.Windows.Forms.MessageBox]::Show("Setup could not finish:`n`$_",'Setup failed') } catch {} }
  exit 1
}
"@
$ps1 = Join-Path $OutDir 'JuicyChat-Creator-Tool-Setup.ps1'
Set-Content -LiteralPath $ps1 -Value $installer -Encoding utf8

# 3. A dependency-free .cmd launcher, plus an .exe via PS2EXE when available.
$cmd = Join-Path $OutDir 'JuicyChat-Creator-Tool-Setup.cmd'
Set-Content -LiteralPath $cmd -Value @"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0JuicyChat-Creator-Tool-Setup.ps1" %*
"@ -Encoding ascii

$madeExe = $false
try {
  if (-not (Get-Module -ListAvailable -Name ps2exe)) { Install-Module ps2exe -Scope CurrentUser -Force -ErrorAction Stop }
  Import-Module ps2exe -ErrorAction Stop
  Invoke-PS2EXE -InputFile $ps1 -OutputFile (Join-Path $OutDir 'JuicyChat-Creator-Tool-Setup.exe') -noConsole -title 'Juicy Chat Creator Tool Setup' -product 'Juicy Chat Creator Tool' -version '1.1.1.0'
  $madeExe = $true
} catch { Write-Host "PS2EXE unavailable ($_); shipping .cmd launcher instead." }

Write-Host ("Setup built. exe={0}; payload={1}" -f $madeExe, $payloadName)
