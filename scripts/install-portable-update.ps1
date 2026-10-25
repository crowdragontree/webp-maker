param(
  [Parameter(Mandatory=$true)][int]$ParentPid,
  [Parameter(Mandatory=$true)][string]$Target,
  [Parameter(Mandatory=$true)][string]$Stage,
  [Parameter(Mandatory=$true)][string]$Backup,
  [Parameter(Mandatory=$true)][string]$Executable,
  [Parameter(Mandatory=$true)][string]$LogFile
)
$ErrorActionPreference = 'Stop'
function Log([string]$message) { Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format o) $message" }
try {
  Log "Waiting for application process $ParentPid"
  for($i=0;$i -lt 240;$i++){
    if(-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)){break}
    Start-Sleep -Milliseconds 500
  }
  if(Get-Process -Id $ParentPid -ErrorAction SilentlyContinue){throw 'App did not close; nothing was changed.'}
  if(!(Test-Path -LiteralPath (Join-Path $Stage $Executable) -PathType Leaf)){throw 'Verified update staging is missing.'}
  if(!(Test-Path -LiteralPath $Target -PathType Container)){throw 'Installed application folder missing.'}
  if(Test-Path -LiteralPath $Backup){throw 'Update backup already exists.'}
  $moved=$false
  for($i=0;$i -lt 80;$i++){
    try { Move-Item -LiteralPath $Target -Destination $Backup -ErrorAction Stop; $moved=$true; break }
    catch { Start-Sleep -Milliseconds 500 }
  }
  if(!$moved){throw 'Old application folder is still locked. No files replaced.'}
  try {Move-Item -LiteralPath $Stage -Destination $Target -ErrorAction Stop}
  catch {
    if(!(Test-Path -LiteralPath $Target) -and (Test-Path -LiteralPath $Backup)){
      Move-Item -LiteralPath $Backup -Destination $Target -ErrorAction Stop
    }
    throw 'Failed to install verified update. Previous version restored.'
  }
  Log 'Installed new files; launching Juicy Chat Creator Tools'
  Start-Process -FilePath (Join-Path $Target $Executable) -WorkingDirectory $Target
  Log 'New app launched. Previous version remains backed up.'
  exit 0
} catch {Log "UPDATE FAILED: $_";exit 1}
