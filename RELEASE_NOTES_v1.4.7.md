# JuicyChat Creator Tool v1.4.7

## New
- **WebP Maker tries other encoding methods when a WebP can't get under 9.99 MB.** When a method reaches its lowest FPS and quality and the file is still too big, a pop-up names the next method and **Proceed** starts it right away: Standard encoding → Grain reduction (frames smoothed with ImageMagick `-enhance` before encoding) → Motion-timed frames (up to a third of each clip's frames skipped where the picture barely changes, never two in a row; the length stays the same) → Lower quality (quality may go down to 40 instead of 75). Each method after the first starts over at 24 FPS / Q80 (or the decoded frame rate, if lower) and runs the same steps on the frames already decoded from your videos, so nothing is decoded again. Cancel keeps the closest too-big file to preview or save, as before.

## Unchanged
- Everything else works as in v1.4.6.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
