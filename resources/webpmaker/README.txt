WebP Maker (ImageMagick-only encoding, entirely local)

- MP4 frames are decoded by the Electron/Chromium HTML5 video decoder.
- PNG frames are encoded by portable ImageMagick, not FFmpeg.
- No video uploads, no server-side conversion.
- First use may download a private portable copy of ImageMagick only; no installer needed.
- The output always has an infinite loop (ImageMagick -loop 0). No loop control is available.
- Output resolution uses the first MP4's dimensions unless the user explicitly chooses a different size, and a confirmation is shown before resizing.
- Frame rate is selected explicitly (1-60 FPS). No automatic frame-rate changes.
- User chooses starting ImageMagick quality (50-99). If over 9,990,000 bytes, quality is reduced in steps of 5 to 50. Size and FPS are never changed.
- If it still cannot fit at quality 50, WebP Maker reports the failure and lets the user adjust the settings manually.
- Save to a .webp file anywhere on your local system.
