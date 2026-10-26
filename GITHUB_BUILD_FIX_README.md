# GitHub Actions repair (October 25, 2026)

Your failing workflow displays `npm error Missing script: "package:win"` on Windows and `npm error Missing script: "package:linux"` on Linux. This source package adds both scripts to package.json without changing the application version.

## Correct upload to crowdragontree/webp-maker
1. Extract this ZIP. Upload the CONTENTS of the extracted folder to the repository's ROOT, not the ZIP itself and not a subfolder. The GitHub root must show package.json, main.js, renderer/, introduction-designer/, scripts/, resources/, assets/, and .github/workflows/build-creator-tools.yml.
2. Remove the obsolete GitHub workflow under .github/workflows/ that runs `Locate WebP Maker files` and `Build portable Windows app`. On GitHub's Code tab open that workflow YAML and use the three-dot menu > Delete file > Commit changes. The old workflow is for a different folder layout and may still fail or publish the wrong application. Do not delete build-creator-tools.yml.
3. Go to Actions and run `Build Juicy Chat Creator Tools (Windows and Linux)` (or commit on main and watch it run automatically). Wait for BOTH required platform build-and-conversion tests to pass.
4. Download the two artifacts. The extracted inner release ZIPs must be `WebP-Maker-Windows-x64.zip` and `WebP-Maker-Linux-x64.zip` for compatibility with the existing portable updater.

The new workflow bundles official ImageMagick binaries and tests a packaged conversion; simply defining missing scripts alone does not verify that the old legacy workflow will pass its end-to-end checks.

No application version number was changed. package.json remains version 1.1.0.
