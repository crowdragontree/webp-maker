# JuicyChat Creator Tool v1.5.5

## New
- **WebP Maker overlay: Undo, Lock and Esc.** In Overlay Settings, **Undo last move** steps back through your drags, corner jumps, arrow-key nudges and size changes. **Lock position and size** freezes the overlay (the size slider, corner buttons and Undo are greyed out, and dragging does nothing); the lock is remembered after a restart. Pressing **Esc while dragging** puts the overlay back where it started.

## Fixed
- **WebP Maker overlay: the margin lock now matches the window you are previewing.** The overlay used to be held well inside the narrowest window's edge in every view, which left a visible gap in the wide window. In the **Wide window** view it can now go right up to that window's edge (about 2 px of margin), and the margin is smaller in the other views too. The narrow window and Whole image views still keep it inside the narrow window's edge, so nothing is cut off there. If you placed the overlay before, click Bottom left (or drag it) again in the Wide window view.
- **WebP Maker's first-time ImageMagick setup no longer fails with "LZMA codec is unsupported".** On some Windows 10 builds the built-in `tar.exe` cannot open the `.7z` ImageMagick download. Setup now uses 7-Zip if it is installed, then `tar.exe`, then the small official `7zr.exe` (downloaded once into the setup's temporary folder and deleted afterwards).

## Unchanged
- Batches, the overlay itself and everything else work as in v1.5.4.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
