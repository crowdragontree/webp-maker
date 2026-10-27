# JuicyChat Creator Tool v1.2.0

## New Features

### WebP Maker: merge WebP files, pictures and cross-fade
- **Merge animated WebP files.** Add two (or more) WebP files and merge them into one, or mix them with MP4 and WebM videos in any order.
- **Turn pictures into a WebP.** Add PNG or JPG pictures and they become frames of one animated WebP. When there is a picture in the list, a **Seconds per image** setting appears, so you choose how long each picture stays on screen (default 2 seconds). A WebP that is not animated counts as a picture.
- **Cross-fade between clips.** Tick **Cross-fade between clips** and a **Cross-fade length** setting appears; the shortest allowed is **0.25 seconds**. The clips overlap during the fade, so the total length is shorter by the overlaps, and the panel shows the total. A clip that is too short for the fade is named in the message.

### Introduction Designer: simpler and faster to use (new since 1.1.1)
- **Simple mode** is now the default and shows only the everyday controls. The **Advanced** switch in the top bar brings back everything: Paste HTML, free placement, layered borders and per-item CSS. Your choice is remembered, and nothing in your design is deleted when you switch.
- **Pick a look**: 9 ready-made styles (Void Violet, Royal Violet, Midnight Blue, Crimson Noir, Forest Glow, Rose Gold, Neon Night, Old Parchment and Clean Light). Your text stays, and **Ctrl+Z** undoes it.
- **Character meter** under the counter: amber near 12,000 characters and red over JuicyChat's 15,000 limit. The styling code counts too, not just your words.
- **Removed-code warning**: a note lists the CSS styles or HTML tags that JuicyChat's rules removed, both when you paste HTML and when you edit an item's CSS.
- **Quick-start tips**: a 3-step strip on your first visit. The **?** button brings it back.

## Changes
- **WebP Maker: a file that is too big now says how big.** The error reads, for example, "The WebP still exceeds 9.99 MB: the file is 10.10 MB at 20 FPS and quality 60, 0.11 MB over the limit." The too-big file is no longer deleted: it is kept and shown in the preview, so you can look at it and save it. **Right-click the preview > Save image as** now works on every finished WebP (the Save button is unchanged).
- New designs start in the **Stack** layout, so items line up without dragging. Free placement is still available and is labeled "advanced".
- Plain labels, for example **Card width**, **Space inside the card**, **Rounded corners**, **Second background color** and **Blend direction**.
- The preview is **748 px** wide, like JuicyChat's own. 480 px and 360 px (phone) are still available.
- The Introduction Designer now uses the same files as the web page and Juicy Blueprint Studio, so all three stay identical.

## Compatibility
- Windows 64-bit and Linux 64-bit
- Your saved designs and templates keep working. Stacked designs stay stacked, and free-placement designs stay free.
- Single MP4 conversion, cropping, custom dimensions, quality optimization, VP9/WebM support and self-installing updates work as before. Merging re-encodes the clips, so quality is set again by the Quality setting, and the 9.99 MB limit still applies.
- All video processing stays local. No uploads.

## Updating
From v1.1.1 on, **Check for updates → Update & Restart** installs this version automatically. If you are on an older version, update once by hand: close the app, unzip the new download into a new folder, open **JuicyChat Creator Tool.exe** (Windows) or **JuicyChat Creator Tool** (Linux), then delete the old folder.

## Questions or Problems?
HMU on PG's server.
