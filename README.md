# WebP Maker (Local)

A standalone, GitHub-ready Windows desktop app. It combines two or more MP4 clips (drag to reorder) into one **infinite-loop** animated WebP, compressed to **no more than 9,990,000 bytes (9.99 MB)**.

- MP4 decoding: Electron's local HTML5 video decoder. **No FFmpeg executable.**
- WebP encoding: portable **ImageMagick**, using individually encoded full frames and adaptive quality per clip to reduce block artifacts.
- Defaults: **24 FPS, quality 80**. Size uses the first MP4's original dimensions by default; manual changes require confirmation. Minimum width: **480 px**.
- When a candidate exceeds 9.99 MB, the app balances FPS and quality within the configured minimums and then optionally reallocates quality by scene. It **never** changes dimensions automatically.
- The extracted PNG frames are cached for manual quality/FPS retries. No uploading, accounts, API keys or telemetry.
- All original MP4s remain untouched.

## Download a Windows app from GitHub Actions

Upload the contents of this folder to a **new GitHub repository**. Open **Actions → Build portable WebP Maker for Windows → Run workflow**. After completion, open the workflow run and download `WebP-Maker-Windows-x64` from Artifacts. Unzip the nested ZIP and open `WebP-Maker.exe`.

The first conversion downloads ImageMagick portable into the app's user-data directory if ImageMagick is not already available. **No installer is required**; internet is only needed to prepare ImageMagick once. All MP4 processing and conversion are local.

## Run directly from source (Windows)

Double-click `START_WEBP_MAKER.bat`. It can obtain private copies of Node and Electron on first run. **No Python or FFmpeg.** You can also use `npm install` then `npm start` if Node.js is installed.

## Privacy and publishing

This standalone repository contains **only WebP Maker files**. It WILL not require you to disclose any private data.

## Notes

ImageMagick is downloaded from its official GitHub release link on Windows. The pinned download URL in `resources/webpmaker/setup-webpmaker.ps1` should be checked if a newer ImageMagick release replaces it. Since each frame is an independently encoded WebP, large or long videos may not fit in 9.99 MB at the chosen quality. The tool will ask you to adjust settings manually rather than silently resize your output.
