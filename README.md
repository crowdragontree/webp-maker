# Juicy Chat Creator Tools v1.1.0

**Quick start:** Extract the source ZIP, run the existing build workflow to create the desktop app, then open **WebP Maker**. A single MP4 now enables **Convert to WebP**. Add more videos only when you want to merge them. The Introduction Editor is the second tab. Its **Fit content** button shrinks the background to the actual content. No coding knowledge is needed for designing an introduction.

The ZIP contains **source files**, not a prebuilt installer. Automatic updates for people running older versions require a published, correctly named GitHub Release build.

---

# Directional Drag-and-Drop Reordering

Drag-and-drop now behaves like a vertical insertion/reorder, rather than pushing every collided element downward.

- Drag an element DOWN: crossed elements shift UP into its previous slots.
- Drag an element UP: crossed elements shift DOWN to fill its previous slot.
- The currently dragged element alone follows the pointer until mouse release.
- Original vertical gaps and element sizes are preserved. Uncrossed elements and independent side-by-side columns stay in place.
- Rows containing multiple side-by-side elements move together when a full-width element is reordered.
- Auto reorder is enabled by default; uncheck it for intentionally overlapping layers.
- Reordering can be reversed without accumulated displacement. The revised position survives autosave, templates, and formatted HTML export.
- Existing crop, URL image previews, divider controls, eight resize handles, custom HTML import, syntax highlighting, and WebP Maker are unchanged.

Tested with real Chromium mouse events moving the Scene Name down across Character Name and Divider, then dragging Scene Name back up to restore the exact original arrangement. Also tested repeated operations, side-by-side columns, row groups, empty gaps, explicit overlap opt-out, saved layout, and HTML output.

Native Windows and Linux desktop executables still require platform-specific GitHub build verification.

---

## Earlier release notes (historical)
# Introduction Editor: Auto Make Room on Drop

Fixed the drag-and-drop overlap shown in the reported screenshots.

- **Auto make room is ON by default**, including when opening older saved drafts without this setting.
- **While dragging:** the selected item follows the pointer; no neighboring item moves.
- **On release:** the selected item stays where it was dropped; overlapping items are pushed downward, and any additional collisions are resolved in sequence. Unaffected items keep their exact positions. Side-by-side elements stay untouched.
- You can turn off Auto make room when you intentionally want layered elements to overlap. This does not affect Crop mode, which pans images within their crop frame.
- Supports drag from the element palette, existing layers, and on-canvas manipulation. All eight resize handles, alignment guides, divider image URLs, styled-border import, crop tools, and syntax-highlighted HTML remain available.
- Exact positions are preserved in reusable templates, autosaved drafts, the formatted Introduction HTML, and Studio's Save and Return flow. The 15,000-character check continues to use the full exported HTML.

### Verified
- Browser pointer-drag tests: collision-free motion until release, selected item preserved, collision cascades, opt-out overlap, autosave and formatted HTML export.
- Pure collision engine tests: cascading displacement, independent columns, unchanged untouched layers, safe failure at the maximum canvas height.
- Existing Introduction Designer, WebP Maker, and Blueprint Studio checks must still pass. Windows/Linux desktop executables require platform-native GitHub Actions build verification.

# Visual Introduction Editor - Image Cropping and Canvas Controls

- CROP IMAGES ON THE CANVAS: Select an image or an image-backed divider, then click Crop image in the Element inspector. Move the picture inside the crop frame with the mouse; zoom with the mouse wheel or an editable Zoom slider. Focus sliders and number fields provide precise control.
- Use all eight existing resize handles to adjust the visible crop area, including from any edge or corner. The original HTTPS image URL stays unchanged and Reset image removes the crop.
- Crop, image focus, zoom, and selected element position persist in local drafts and saved templates. Copy Introduction and Save and Return export static HTML with inline styles, no editor overlays or scripts. The 15,000-character limit still counts the actual formatted export.
- REPAIRED CANVAS DRAGGING: Moving or resizing an element affects only that element. Existing elements are not displaced, even when crossing or overlapping them. The optional Prevent overlap checkbox is off by default.
- Smart alignment guides consider left/center/right and top/middle/bottom positions for the canvas and nearby elements instead of only the left edge. Hold Alt during drag to bypass snapping.
- Existing visual editor features remain: nested border frames, divider image URLs, natural source image proportions when not cropped, HTML import with inline styles, color-coded HTML, generic placeholders, eight resize handles, and typeable numeric sliders.

The browser designer works offline after opening its HTML file. Direct HTTPS image URLs are requested from their image hosts when used. Desktop executables still require platform build validation.

# Introduction Editor: Visual Canvas & HTML Import Fixes

- Resize any selected element using all eight handles: corners and sides. The opposite side stays anchored.
- Drag-and-drop moves only the selected element. Other elements never get pushed or reordered; collisions are rejected, and snap guides help alignment.
- Select an element and press Delete/Backspace or use its separate, unobtrusive on-canvas Delete control.
- Dividers now support a decorative HTTPS image URL, immediate preview, optional placement between two lines, and adjustable image width.
- Images default to their original aspect ratio, not a forced 3:4 crop. URL edits refresh the image preview automatically.
- Import nested HTML into editable visual layers with the original author-supplied inline styles intact, preserving colored border frames, corner radii, backgrounds, inset shadows, typography, glows and image URLs.
- Imported artwork is immediately converted to a freely movable canvas with positions captured after images load.
- HTML source editing and generated code previews are syntax-highlighted, with distinct tag, attribute and value colors.
- All slider values are typeable, and exported Introduction HTML remains neatly formatted with a 15,000-character ceiling.
- Generic default content: Scene Name, Character Name, Introduction, Extra Text.

All processing is local except loading any HTTPS image URLs that the user chooses to paste. No scripts enter the exported Introduction HTML.


# Juicy Chat Creator Tools v1.1.2

**WebP Maker + Introduction Editor in a single Windows/Linux desktop app.**

## What's included

### WebP Maker
- Merge and reorder MP4 or WebM/VP9 clips into one animated WebP under 9.99 MB.
- ImageMagick-based quality optimization, 24 FPS/quality 80 defaults and automatic size refinement.
- Cropping presets: 16:9, 9:16, 3:4, 4:3 and 1:1, plus individually adjustable freeform crops.
- Fully local video processing, animation preview, and Save WebP.

### Introduction Editor
- Fully visual drag-and-drop editor with **smart snapping and non-overlapping layouts**. Dragging or resizing changes **only the selected element**; it snaps to available space without moving the others.
- Live **direct HTTPS image URL** preview with loading/failed-link messages. Image-specific URL fields appear only for image elements.
- Four generic text fields: Scene Name, Character Name, Introduction, Extra Text.
- Reusable templates, nested border frames, gradients, glows, individually typeable slider values, and formatted HTML.
- 15,000-character HTML + text limit; Copy Introduction to paste in JuicyChat.
- Standalone Introduction Editor in this app does not return to Juicy Blueprint Studio. Studio has its own Save and Return integration.

## Building Windows / Linux releases

1. Upload this **extracted source folder's contents** to the `crowdragontree/webp-maker` GitHub repository, including `.github`.
2. Select **Actions → Build Juicy Chat Creator Tools (Windows and Linux)**.
3. Both Windows and Linux jobs must pass all required source and actual MP4-to-WebP conversion tests.
4. Download the generated artifacts. Extract the outer GitHub artifact ZIP and obtain `WebP-Maker-Windows-x64.zip` and `WebP-Maker-Linux-x64.zip`.
5. Publish a **v1.1.2** release with those two inner ZIPs as release assets, using their existing filenames.

**Compatibility:** The packaged executable remains `WebP-Maker.exe` / `WebP-Maker` solely to support existing WebP Maker installations using the GitHub automatic updater. The application window/title/taskbar name is **Juicy Chat Creator Tools**. Version 1.1.2 is higher than the previous WebP Maker 1.0.3. Do not rename the release asset ZIPs or the executable inside the build folders.

The Windows and Linux workflows download and SHA-256-verify the official ImageMagick 7.1.2-34 binaries and bundle them with the portable app. No extra ImageMagick install is required, and videos stay local.

## Local source use

From this source folder, run `npm install` and `npm start` with Node.js 22.12+ installed. The published Windows/Linux ZIPs do **not** require Node or npm.

This project contains no private files, character profiles, or user video data.


Introduction Editor canvas fixes (October 25, 2026):
- Click an element in the preview and press Delete or Backspace, or use its on-canvas × button. Text inputs are unaffected.
- Free-position dragging and resizing move only the selected block; neighboring elements retain their positions. The selected block snaps into available space rather than pushing everything else.
- Dividers have their own symbol, line color, thickness, and gap controls. Text typography controls are hidden when editing a divider.
- New images retain their original aspect ratio by default (auto / contain), rather than 3:4.
- The 15,000-character check and exported inline HTML remain unchanged; editor-only controls never enter the copied code.
