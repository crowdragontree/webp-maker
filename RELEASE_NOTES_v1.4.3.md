# JuicyChat Creator Tool v1.4.3

## Fixes
- **Harper works again.** v1.4.2 was built without Harper's files, so Settings > Grammar engine said "Harper is missing from the app folder" and Harper never checked anything. They are back in the app (the vendor/harper folder).
- **Harper can't go missing again.** If a build ever leaves out Harper's files, the app downloads them once (harper.js 2.13.0, about 30 MB, from the npm registry) the first time a check runs, or when you press **Get Harper now** in Settings > Grammar engine, instead of showing a dead end.

## Unchanged
- Everything else works as in v1.4.2.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
