# Portable Windows updater. Runs from userData OUTSIDE the installed application.
# The old WebP Maker process must exit before its executable can be moved.
param(
  [Parameter(Mandatory=$true)][int]$ParentPid,
  [Parameter(Mandatory=$true)][string]$Target,
  [Parameter(Mandatory=$true)][string]$Stage,
  [Parameter(Mandatory=$true)][string]$Backup,
  [Parameter(Mandatory=$true)][string]$Executable,
  [Parameter(Mandatory=$true)][string]$LogFile
)
$ErrorActionPreference = 'Stop'
function Log([string]$message) {
  Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format o) $message"
}
try {
  Log "Waiting for WebP Maker process $ParentPid to close"
  for ($i=0; $i -lt 120; $i++) {
    $old = Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
    if ($null -eq $old) { break }
    Start-Sleep -Milliseconds 500
  }
  if ($null -ne (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) {
    throw 'The existing WebP Maker process did not close. Files have not been changed.'
  }
  if (!(Test-Path -LiteralPath $Stage -PathType Container)) { throw 'Verified update staging folder is missing.' }
  if (!(Test-Path -LiteralPath (Join-Path $Stage $Executable) -PathType Leaf)) { throw 'Updated application executable is missing.' }
  if (!(Test-Path -LiteralPath $Target -PathType Container)) { throw 'Existing application folder is missing.' }
  if (Test-Path -LiteralPath $Backup) { throw 'A backup folder already exists.' }
  $renamed = $false
  for ($i=0; $i -lt 80; $i++) {
    try {
      Move-Item -LiteralPath $Target -Destination $Backup -ErrorAction Stop
      $renamed = $true
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (!$renamed) { throw 'Windows would not unlock the previous application folder. No files were replaced.' }
  try {
    Move-Item -LiteralPath $Stage -Destination $Target -ErrorAction Stop
  } catch {
    if (!(Test-Path -LiteralPath $Target) -and (Test-Path -LiteralPath $Backup)) {
      Move-Item -LiteralPath $Backup -Destination $Target -ErrorAction Stop
    }
    throw 'Could not install the downloaded update. Previous version restored.'
  }
  Log 'Update installed; launching new version'
  Start-Process -FilePath (Join-Path $Target $Executable) -WorkingDirectory $Target
  Log 'New version started. Previous version is retained as a backup until the next launch.'
  exit 0
} catch {
  Log "UPDATE FAILED: $_"
  exit 1
}
