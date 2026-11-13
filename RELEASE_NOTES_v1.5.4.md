# JuicyChat Creator Tool v1.5.4

## New
- **WebP Maker: organise your files into batches and export each batch as its own WebP.** Until now every file you added was merged into one animation. Now:
  - **+ New batch** starts another batch. Every batch becomes its own WebP file. New files go into the batch you last clicked (the line under "Clips" says which one).
  - **Move clips between batches** with the Batch picker on each clip, or drag a clip onto another batch (or onto a clip of another batch). ↑ ↓ and drag still reorder clips inside a batch.
  - **One batch per file** puts every clip in a batch of its own, named after the file, for when you want one WebP per file. **Merge into one** puts everything back into a single batch.
  - **Rename a batch** by typing in its name box. The name is the file name of its WebP.
  - **Convert N batches to WebP** converts every batch one after the other, each with its own frames, size check and fallback methods. **Convert this batch** converts only that batch and leaves the finished ones alone.
  - **Preview and save each one.** Every finished batch gets a button above the preview to look at it. **Save this WebP** saves the one shown; **Save all N WebP files…** saves every one into a folder you choose, named after its batch. A file that already exists in the folder is never overwritten (it becomes "Name (2).webp").
  - If one batch cannot get under 9.99 MB, the others still finish. The list of problems names the batch, and the failed batch is marked.
  - Changing a batch (adding, removing or moving a clip in it) discards only that batch's finished WebP. Changing a setting (size, crop, FPS, quality, cross-fade, seconds per image) discards all of them, as before.
- Up to 60 clips in total, up to 30 in one batch.

## Fixed
- **Bot Builder: the Spelling & Grammar list now matches the underlines in the Greeting.** The Greeting editor shows one markdown text and draws the red (spelling) and blue (grammar) underlines on that whole text, but the Spelling & Grammar window used to read each passage separately, so the local AI listed different things than it underlined, sometimes nothing at all. The window now reads the same text the editor shows, and a fix applied from the list goes into that text. When the Greeting is typed directly (or edited in the passage boxes) nothing changes.
- **WebP Maker no longer fails when only part of an update is installed.** If the new WebP Maker screen is installed but `preload.js` or `main.js` is still an older version (for example when the files were uploaded to GitHub in separate commits), converting used to stop with "api.webpStash is not a function". Now one batch converts, previews and saves the way it did before batches. Converting several batches in that state stops with a plain message saying that part of the update is missing and to upload all files of the update in one commit.
- Nothing changes when the whole update is installed.

## Unchanged
- With one batch (the default) WebP Maker works exactly as in v1.5.3: one list, one Convert button, one WebP, saved as "<first clip>_Animated.webp".
- The output settings (size, crop, frame rate, quality, cross-fade) are shared by all batches. The cross-fade joins the clips inside each batch only.
- Everything else (Image Compressor, Bot Builder, Introduction Editor, grammar checks) works as in v1.5.3.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
