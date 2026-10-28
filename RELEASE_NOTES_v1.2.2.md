# JuicyChat Creator Tool v1.2.2

## Fixes
- **The program no longer cuts itself off a few seconds after starting on some Windows 10 computers.** On those computers v1.2.0 and v1.2.1 closed hard about 3 to 6 seconds after every start, before anything could be converted. The one thing the program did in those first seconds that could do this was a clean-up step that rewrote old WebP-Maker shortcuts. That step is gone. If an old `WebP-Maker.exe` is still in the program's folder it is left where it is (it only hands over to this program), and shortcuts that point at it keep working.
- **The crash log now records each startup step** (app ready, window created, page loaded, clean-up, update check), one line each. If the program is ever cut off again, the last line in `creator-tool-crash.log` shows exactly where. Send that file to the developer.

## Changes
- Nothing else changes. WebP Maker, the Introduction Editor and the updater work as in v1.2.1.

## Compatibility
- Windows 64-bit and Linux 64-bit
- Your saved designs and templates keep working.
- All video processing stays local. No uploads.

## Updating
From v1.1.1 on, **Check for updates → Update & Restart** installs this version automatically. If the program closes by itself right after starting and you cannot reach the update button, update once by hand: close the app, unzip the new download into a new folder, open **JuicyChat Creator Tool.exe** (Windows) or **JuicyChat Creator Tool** (Linux), then delete the old folder.

## Questions or Problems?
HMU on PG's server.
