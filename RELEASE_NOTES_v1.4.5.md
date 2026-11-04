# JuicyChat Creator Tool v1.4.5

## Fixes
- **WebP Maker counts megabytes the way Windows and ezgif do.** The 9.99 MB limit was measured as 9,990,000 bytes, but a "MB" in Windows Explorer and ezgif is 1,048,576 bytes. A file that ezgif and Windows call 9.81 MB came out of WebP Maker as 10.49 MB and was refused, even at the lowest settings. The limit is now 9.99 MB counted the Windows way (10,475,274 bytes), and every size in WebP Maker and the Image Compressor uses the same count.
- **Smaller WebP frames.** The encoder now uses its slowest, tightest mode (method 6), which makes each frame about 4% smaller at the same FPS and quality. Encoding takes a little longer.

## Unchanged
- Everything else works as in v1.4.4.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
