# Builds JuicyChat-Creator-Tool-Setup.exe-equivalent: a single self-contained
# PowerShell installer (.ps1 wrapped as a .exe at the end) that moves users on old
# copies (v1.0.2-v1.1.0, whose in-app updater cannot install updates on Windows) to
# v1.1.1 with one double-click. From v1.1.1 on, updates install automatically.
param(
  [Parameter(Mandatory=$true)][string]$AppDir,   # dist/Juicy Chat Creator Tools-win32-x64
  [Parameter(Mandatory=$true)][string]$OutDir    # where to write the setup files
)
$ErrorActionPreference = 'Stop'
$AppDir  = (Resolve-Path $AppDir).Path
$exeName = 'JuicyChat Creator Tool.exe'
if (!(Test-Path (Join-Path $AppDir $exeName))) { throw "The app folder is missing $exeName." }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# 1. Payload: the full v1.1.1 app, zipped and embedded in the installer as base64.
$work = Join-Path $env:RUNNER_TEMP ("setup-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$payloadDir = Join-Path $work 'app'
New-Item -ItemType Directory -Path $payloadDir -Force | Out-Null
# Copy the CONTENTS of the app folder into payloadDir (the trailing \* avoids nesting the source folder itself).
Copy-Item -Path (Join-Path $AppDir '*') -Destination $payloadDir -Recurse -Force
Remove-Item -LiteralPath (Join-Path $payloadDir 'WebP-Maker.exe') -Force -ErrorAction SilentlyContinue
if (!(Test-Path (Join-Path $payloadDir $exeName))) { throw "Payload staging failed: $exeName not at payload root." }
$zip = Join-Path $work 'payload.zip'
Compress-Archive -Path $payloadDir -DestinationPath $zip -Force
# Verify the zip really contains the program before embedding it, so a bad zip fails the build.
$verify = Join-Path $work 'verify'
Expand-Archive -LiteralPath $zip -DestinationPath $verify -Force
$check = Get-ChildItem -LiteralPath $verify -Filter $exeName -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $check) { throw "Payload zip is broken: $exeName not found after re-extracting $zip." }
Write-Host ("Payload verified: {0}" -f $check.FullName.Substring($verify.Length))
Remove-Item -LiteralPath $verify -Recurse -Force
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($zip))

# 2. The installer script. {{PAYLOAD}} is replaced with the base64 zip.
$installer = @'
param([string]$Target,[switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$exeName='JuicyChat Creator Tool.exe'; $legacy='WebP-Maker.exe'
function Info($m){ Write-Host $m }
try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

  # Unpack the embedded v1.1.1 to a temp folder.
  $tmp=Join-Path $env:TEMP ('jcct-setup-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $zip=Join-Path $tmp 'payload.zip'
  [IO.File]::WriteAllBytes($zip,[Convert]::FromBase64String($PAYLOAD))
  $unpack=Join-Path $tmp 'unpack'
  New-Item -ItemType Directory -Path $unpack -Force | Out-Null
  Expand-Archive -LiteralPath $zip -DestinationPath $unpack -Force
  # Find wherever the program landed, no matter how Compress-Archive nested it.
  $exeItem=Get-ChildItem -LiteralPath $unpack -Filter $exeName -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if(-not $exeItem){ throw "Payload did not unpack: $exeName not found under $unpack." }
  $src=$exeItem.DirectoryName

  # Close any running copy so its folder can be swapped.
  foreach($n in 'WebP-Maker','JuicyChat Creator Tool'){
    Get-Process -Name $n -ErrorAction SilentlyContinue | ForEach-Object { try{$_.CloseMainWindow()|Out-Null}catch{} }
  }
  Start-Sleep 2
  foreach($n in 'WebP-Maker','JuicyChat Creator Tool'){
    Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep 1

  # Locate the existing install folder (contains resources\app\package.json).
  $target=$Target
  if(-not $target){
    $fromArg=$args | Where-Object { $_ -like '--target=*' } | Select-Object -First 1
    if($fromArg){ $target=$fromArg.Substring('--target='.Length) }
  }
  if(-not $target){
    $c=@()
    foreach($exe in @($legacy,$exeName)){
      $c+=Get-ChildItem -Path "$env:USERPROFILE\Downloads","$env:USERPROFILE\Desktop","$env:LOCALAPPDATA","$env:APPDATA","$env:USERPROFILE" `
        -Filter $exe -Recurse -ErrorAction SilentlyContinue -Depth 6 |
        Where-Object { Test-Path (Join-Path $_.DirectoryName 'resources\app\package.json') }
    }
    $target=$c | Select-Object -ExpandProperty DirectoryName -Unique | Select-Object -First 1
  }
  if((-not $target) -and ([System.Windows.Forms.Application]::MessageLoop -ne $null)){
    $fb=New-Object System.Windows.Forms.FolderBrowserDialog
    $fb.Description='Select your existing WebP-Maker / Juicy Chat Creator Tool folder'
    if($fb.ShowDialog() -eq 'OK'){ $target=$fb.SelectedPath }
  }
  if(-not $target){ throw 'Could not find the existing installation. Setup cancelled.' }

  Info "Installing Juicy Chat Creator Tool v1.1.1 into: $target"
  $backup=Join-Path (Split-Path $target -Parent) ('.jcct-setup-backup-'+[guid]::NewGuid().ToString('N').Substring(0,8))
  Move-Item -LiteralPath $target -Destination $backup
  try {
    New-Item -ItemType Directory -Path $target | Out-Null
    Copy-Item -LiteralPath (Join-Path $src '*') -Destination $target -Recurse -Force
    if(!(Test-Path (Join-Path $target $exeName))){ throw 'New program missing after copy.' }
    Remove-Item -LiteralPath (Join-Path $target $legacy) -Force -ErrorAction SilentlyContinue
  } catch {
    Info "Install failed, restoring previous version: $_"
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $backup -Destination $target
    throw
  }

  # Re-point shortcuts that opened WebP-Maker.exe.
  $newExe=Join-Path $target $exeName; $oldExe=Join-Path $target $legacy
  $sh=New-Object -ComObject WScript.Shell
  foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'),
    (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'),
    (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\StartMenu'))){
    if(-not (Test-Path $d)){ continue }
    Get-ChildItem -Path $d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      try { $l=$sh.CreateShortcut($_.FullName)
        if($l.TargetPath -and ($l.TargetPath.ToLower() -eq $oldExe.ToLower())){ $l.TargetPath=$newExe; $l.WorkingDirectory=$target; $l.Save() }
      } catch {}
    }
  }

  if(-not ($NoLaunch -or ($args -contains '--no-launch'))){ Start-Process -FilePath $newExe -WorkingDirectory $target }
  Start-Sleep 3
  Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Info 'Done. Juicy Chat Creator Tool v1.1.1 is installed and running.'
  if([System.Windows.Forms.Application]::MessageLoop -ne $null){ [void][System.Windows.Forms.MessageBox]::Show('Juicy Chat Creator Tool has been updated to v1.1.1.','Setup complete') }
} catch {
  Write-Host "SETUP FAILED: $_"
  try { [void][System.Windows.Forms.MessageBox]::Show("Setup could not finish:`n$_",'Setup failed') } catch {}
  exit 1
}
'@
$installer = $installer -replace '\$PAYLOAD', ('"' + $b64 + '"')
$ps1 = Join-Path $OutDir 'JuicyChat-Creator-Tool-Setup.ps1'
Set-Content -LiteralPath $ps1 -Value $installer -Encoding utf8

# 3. Wrap the .ps1 as a double-clickable .exe via PS2EXE if available; always keep a
#    .cmd launcher as a dependency-free fallback.
$cmd = Join-Path $OutDir 'JuicyChat-Creator-Tool-Setup.cmd'
Set-Content -LiteralPath $cmd -Value @"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0JuicyChat-Creator-Tool-Setup.ps1" %*
"@ -Encoding ascii

$madeExe=$false
try {
  if(-not (Get-Module -ListAvailable -Name ps2exe)){ Install-Module ps2exe -Scope CurrentUser -Force -ErrorAction Stop }
  Import-Module ps2exe -ErrorAction Stop
  Invoke-PS2EXE -InputFile $ps1 -OutputFile (Join-Path $OutDir 'JuicyChat-Creator-Tool-Setup.exe') -noConsole -title 'Juicy Chat Creator Tool Setup' -product 'Juicy Chat Creator Tool' -version '1.1.1.0'
  $madeExe=$true
} catch { Write-Host "PS2EXE unavailable ($_); shipping .cmd launcher instead." }

Write-Host ("Setup built. exe={0}" -f $madeExe)
