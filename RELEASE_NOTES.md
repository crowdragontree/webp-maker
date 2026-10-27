# JuicyChat Creator Tool v1.2.1

## New Features
- **Crash log.** If the tool crashes, freezes or shows an error, it now writes what happened to a text file called `creator-tool-crash.log`. **The file is in the same folder as the program** (next to `JuicyChat Creator Tool.exe` on Windows), so it can be found even when the app will not open. Send that file to the developer.
  - If the app crashes while it is starting, a message shows the error and where the file is.
  - If the window crashes, a message offers **Show the crash log**, which opens the folder with the file selected. If the app is cut off without a normal exit, the next start notes that in the log and offers the same button. The **Crash log** button in the top bar does the same at any time.
  - It records the app version, Windows/Linux version and how much memory the computer has, then any crash, freeze, error or failed conversion, with the time.
  - While a WebP is converting it also notes how much memory the tool uses, which helps find crashes caused by running out of memory.
  - The file stays on your computer until you send it. Nothing is uploaded. It holds technical details only (no pictures, videos or Introduction text), but error lines can contain a file name or the program's folder, which may include your Windows user name.
  - If the program's folder cannot be written to (for example under Program Files), the file is in the app's data folder instead, for example `%APPDATA%\Juicy Chat Creator Tools\logs`.
  - Installing an update replaces the program's folder, so the log starts fresh after an update.

## Changes
- Nothing else changes. WebP Maker, the Introduction Editor and the updater work as in v1.2.0.

## Compatibility
- Windows 64-bit and Linux 64-bit
- Your saved designs and templates keep working.
- All video processing stays local. No uploads.

## Updating
From v1.1.1 on, **Check for updates → Update & Restart** installs this version automatically. If you are on an older version, update once by hand: close the app, unzip the new download into a new folder, open **JuicyChat Creator Tool.exe** (Windows) or **JuicyChat Creator Tool** (Linux), then delete the old folder.

## Questions or Problems?
HMU on PG's server.
