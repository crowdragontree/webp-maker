# WebP Maker: Windows and Linux

Standalone MP4 to animated WebP app. Import two or more MP4 clips, drag to reorder them, and save one infinitely looping animated WebP **under 9.99 MB (9,990,000 bytes)**. All video conversion happens on the user's computer.

## Download the app

Open **Releases** on the [WebP Maker GitHub repository](https://github.com/crowdragontree/webp-maker/releases) and choose:

- **Windows 64-bit:** `WebP-Maker-Windows-x64.zip` → extract → launch `WebP-Maker.exe`. ImageMagick can be prepared automatically on first use (requires internet once).
- **Linux 64-bit (x86_64):** `WebP-Maker-Linux-x64.zip` → extract → run `WebP-Maker`. This ZIP **includes portable ImageMagick**, with no additional install and no internet needed for video conversion. Keep the entire extracted application folder together. Depending on your file manager, right-click the executable and choose **Allow executing as program**, or run `chmod +x WebP-Maker` in that folder.

No macOS download is provided. Linux support targets standard x86_64 desktop distributions. ARM devices aren't included.

*The first GitHub Actions build makes temporary downloadable artifacts. A repository owner must publish the ZIPs under Releases before the links above work.*

## What's included

- Electron's HTML5 MP4 decoder. **No separate FFmpeg executable.**
- ImageMagick encoding of independent full frames, with adaptive quality allocation between clips to reduce block artifacts.
- Default **24 FPS** and **quality 80**. Output size starts at the original first MP4 dimensions and **never resizes automatically**. Minimum output width **480 px**.
- Automatic optimization within the selected FPS/quality protection limits, hard 9.99 MB cap, no audio, and infinite looping.
- Cached decoded PNG frames for retries; local WebP preview and Save button.
- No accounts, API keys, telemetry, uploaded videos, or Studio-related code.

## Build both downloadable apps on GitHub

1. Upload the source files to the **root** of the repository (the folder holding `package.json`). The workflow also supports an existing `WebP-Maker` subfolder if files are already there.
2. In the repository, edit `.github/workflows/windows-build.yml` to match the supplied file. This workflow builds both Windows and Linux automatically whenever changes are committed to `main`. It can also be launched manually from the **Actions** tab as **Build WebP Maker for Windows and Linux**.
3. When both jobs finish, open the workflow run and download the two files under **Artifacts**.
4. Create a GitHub **Release** and attach the Windows and Linux ZIPs so people can download them easily.

The workflow downloads the [official ImageMagick 7.1.2-34 Linux AppImage](https://github.com/ImageMagick/ImageMagick/releases/tag/7.1.2-34), checks its SHA-256, tests its extracted launcher, and bundles it in the Linux app. ImageMagick is extracted to a private user-data folder once at runtime to avoid requiring FUSE or an administrator password. All encoding remains local.

## Run from source

**Windows:** Double-click `START_WEBP_MAKER.bat`. The first run can download private runtime components. Or use `npm install` then `npm start` if Node.js is available.

**Linux:** Install Node.js 22+, then run `npm install && npm start` in this source folder. For source development, ImageMagick must be on your PATH (or set `JBS_WEBP_MAGICK` to its executable); the **GitHub-built Linux download already includes it**.

## Security and license

Only the standalone WebP Maker source is included. The Linux build includes the official ImageMagick AppImage and its upstream licensing; see [ImageMagick's license](https://imagemagick.org/script/license.php). You can choose your own appropriate license for the WebP Maker source. Linux and Windows builds are unsigned and may show operating-system security warnings.

## Notes

- Some videos cannot meet 9.99 MB without lowering quality or FPS. In that situation the app stops and asks for manual changes rather than silently resizing.
- The built-in ImageMagick Linux binary is **x86_64 only**. macOS, Linux ARM, and mobile devices are not currently supported.
- The Windows portable ImageMagick bootstrap still uses the pinned official release URL in `resources/webpmaker/setup-webpmaker.ps1`.
