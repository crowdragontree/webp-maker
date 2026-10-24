$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'install-portable-update.ps1'
if (!(Test-Path -LiteralPath $scriptPath)) { throw 'Portable installer helper is missing.' }
$root = Join-Path $env:RUNNER_TEMP ('webp-updater-test-' + [Guid]::NewGuid().ToString('n'))
$target = Join-Path $root 'WebP Maker Old'
$stage = Join-Path $root 'WebP Maker New'
$backup = Join-Path $root 'WebP Maker Backup'
$log = Join-Path $root 'updater.log'
New-Item -ItemType Directory -Path $target,$stage -Force | Out-Null
Set-Content -LiteralPath (Join-Path $target 'previous-build.txt') -Value 'old'
# A real, signed Windows executable is used to test restarting the swapped folder.
Copy-Item -LiteralPath $env:ComSpec -Destination (Join-Path $stage 'WebP-Maker.exe')
try {
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $scriptPath `
    -ParentPid 999999999 -Target $target -Stage $stage -Backup $backup `
    -Executable 'WebP-Maker.exe' -LogFile $log
  if ($LASTEXITCODE -ne 0) { throw "Portable Windows installer returned $LASTEXITCODE" }
  if (!(Test-Path -LiteralPath (Join-Path $target 'WebP-Maker.exe'))) { throw 'New Windows app did not replace old folder.' }
  if (!(Test-Path -LiteralPath (Join-Path $backup 'previous-build.txt'))) { throw 'Old Windows app was not kept as backup.' }
  Write-Host 'PASS: Windows out-of-process portable updater replaced the application folder and kept the old version as backup.'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
