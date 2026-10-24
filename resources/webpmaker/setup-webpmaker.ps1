# WebP Maker first-run bootstrap: ImageMagick portable only. No FFmpeg.
# Extracts into the application's own private directory, no system installation.
param(
  [Parameter(Mandatory=$true)][string]$ToolsDir,
  [Parameter(Mandatory=$true)][string]$SevenZipPath
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# Windows tar.exe does not reliably support LZMA-compressed .7z archives.
# The bundled 7zip-bin extractor works with the official ImageMagick .7z.
if (-not (Test-Path -LiteralPath $SevenZipPath -PathType Leaf)) {
  throw 'WebP Maker is missing its built-in 7-Zip extractor. Download the complete app ZIP again.'
}
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
  New-Item -ItemType Directory -Path $Out -Force | Out-Null
  # The -o switch needs one argument, even when the path includes spaces.
  & $SevenZipPath 'x' $Archive ("-o" + $Out) '-y' '-bd'
  if ($LASTEXITCODE -ne 0) { throw 'Unable to unpack ImageMagick portable archive using the bundled 7-Zip extractor.' }
  $Magick = Get-ChildItem -LiteralPath $Out -Recurse -File -Filter 'magick.exe' | Select-Object -First 1
  if (-not $Magick) { throw 'ImageMagick portable archive did not contain magick.exe.' }
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
  Copy-Item -Path (Join-Path $Magick.Directory.FullName '*') -Destination $Target -Recurse -Force
  if (-not (Test-Path (Join-Path $Target 'magick.exe'))) {throw 'ImageMagick copy failed.'}
  Write-Output 'ImageMagick ready. MP4s are decoded by Electron and never uploaded.'
} finally { Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue }
