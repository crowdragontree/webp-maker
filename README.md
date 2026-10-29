# Juicy Chat Creator Tools v1.3.2

**WebP Maker, Image Compressor, Bot Builder, Introduction Editor and Settings in a single Windows/Linux desktop app.**

## What's included

### WebP Maker
- Merge and reorder MP4 or WebM/VP9 clips into one animated WebP under 9.99 MB; pictures in every common format.
- Cropping presets and freeform crops, fully local processing, animation preview, Save WebP.

### Image Compressor
- Compresses pictures one at a time; each result is saved next to the original as `<name>_compressed.png`.

### Bot Builder
- Write a bot from your own templates (any `.txt` style) or the Blank bot, with character limits, format checks, spelling, Interaction Examples, past/present tense (Undo and Restore original), you/your ↔ {{user}} for the Greeting, saved bots, and export as `.txt` or `.json`.
- Brings in the Introduction made in the Introduction Editor.

### Introduction Editor
- Fully visual drag-and-drop editor with smart snapping, live HTTPS image preview, reusable templates, nested borders, gradients and formatted HTML.
- 15,000-character limit; Copy Introduction to paste in JuicyChat, or Save and Return to the Bot Builder.

### Settings
- Install or remove the Grammar Engine (LanguageTool).

## Building Windows / Linux releases

1. Upload this **extracted source folder's contents** to the `crowdragontree/webp-maker` GitHub repository, including `.github`.
2. Select **Actions → Build Juicy Chat Creator Tools (Windows and Linux)**.
3. Both Windows and Linux jobs must pass all required source and actual MP4-to-WebP conversion tests.
4. Download the generated artifacts. Extract the outer GitHub artifact ZIP and obtain `WebP-Maker-Windows-x64.zip` and `WebP-Maker-Linux-x64.zip`.
5. Publish a **v1.3.2** release with those two inner ZIPs as release assets, using their existing filenames.

**Compatibility:** The packaged executable remains `WebP-Maker.exe` / `WebP-Maker` solely to support existing WebP Maker installations using the GitHub automatic updater. The application window/title/taskbar name is **Juicy Chat Creator Tools**. Version 1.3.1 is higher than every earlier release. Do not rename the release asset ZIPs or the executable inside the build folders.

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
