# WebP Maker first-run bootstrap: ImageMagick portable only. No FFmpeg.
# Extracts into the application's own private directory, no system installation.
param([Parameter(Mandatory=$true)][string]$ToolsDir)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Stage = Join-Path $ToolsDir '.imagemagick-download'
$Target = Join-Path $ToolsDir 'imagemagick'
New-Item -ItemType Directory -Path $Stage -Force | Out-Null
try {
  if (Test-Path (Join-Path $Target 'magick.exe')) { Write-Output 'ImageMagick is already available.'; exit 0 }
  # Official ImageMagick Windows portable Q16 build. No registry/PATH changes.
  $Url = 'https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-34/ImageMagick-7.1.2-34-portable-Q16-x64.7z'
  $Archive = Join-Path $Stage 'imagemagick-portable.7z'
  Invoke-WebRequest -Uri $Url -OutFile $Archive -UseBasicParsing -MaximumRedirection 10
  if (-not (Test-Path $Archive) -or (Get-Item $Archive).Length -lt 100000) { throw 'ImageMagick portable download was incomplete.' }
  $Out = Join-Path $Stage 'unpacked'
  # The archive is a .7z. Windows' own tar.exe can read it only when its build has the LZMA codec (some Windows 10 builds do not:
  # "LZMA codec is unsupported"). So: 7-Zip if it is installed, then tar.exe, then the small official 7zr.exe (one file, used only
  # here, kept in the temporary folder that is deleted afterwards).
  function Invoke-Native([string]$Exe, [string[]]$ArgList) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $Exe @ArgList *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false } finally { $ErrorActionPreference = $prev }
  }
  function Reset-Dir([string]$Dir) {
    if (Test-Path -LiteralPath $Dir) { Remove-Item -LiteralPath $Dir -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $Dir -Force | Out-Null
  }
  $Unpacked = $false
  $SevenZip = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  if ($SevenZip) { Reset-Dir $Out; $Unpacked = Invoke-Native $SevenZip @('x', '-y', "-o$Out", $Archive) }
  if (-not $Unpacked) { Reset-Dir $Out; $Unpacked = Invoke-Native 'tar.exe' @('-xf', $Archive, '-C', $Out) }
  if (-not $Unpacked) {
    $Z = Join-Path $Stage '7zr.exe'
    $Sources = @(
      @{ Url = 'https://github.com/ip7z/7zip/releases/download/25.01/7zr.exe'; Hash = '27CBE3D5804AD09E90BBCAA916DA0D5C3B0BE9462D0E0FB6CB54BE5ED9030875' },
      @{ Url = 'https://www.7-zip.org/a/7zr.exe'; Hash = '' }
    )
    foreach ($Src in $Sources) {
      try {
        Invoke-WebRequest -Uri $Src.Url -OutFile $Z -UseBasicParsing -MaximumRedirection 10
        if (-not (Test-Path -LiteralPath $Z) -or (Get-Item -LiteralPath $Z).Length -lt 300000) { continue }
        if ($Src.Hash -and ((Get-FileHash -LiteralPath $Z -Algorithm SHA256).Hash -ne $Src.Hash)) { continue }
        Reset-Dir $Out
        if (Invoke-Native $Z @('x', '-y', "-o$Out", $Archive)) { $Unpacked = $true; break }
      } catch { }
    }
  }
  if (-not $Unpacked) { throw 'Unable to unpack ImageMagick portable archive (tried 7-Zip, tar.exe and 7zr.exe). Check your connection and retry.' }
  $Magick = Get-ChildItem -LiteralPath $Out -Recurse -File -Filter 'magick.exe' | Select-Object -First 1
  if (-not $Magick) { throw 'ImageMagick portable archive did not contain magick.exe.' }
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
  Copy-Item -Path (Join-Path $Magick.Directory.FullName '*') -Destination $Target -Recurse -Force
  if (-not (Test-Path (Join-Path $Target 'magick.exe'))) {throw 'ImageMagick copy failed.'}
  Write-Output 'ImageMagick ready. MP4s are decoded by Electron and never uploaded.'
} finally { Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue }
