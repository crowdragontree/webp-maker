# JuicyChat Creator Tool v1.4.6

## Fixes
- **The local AI now catches punctuation and more.** It was told to list only grammar mistakes and to treat everything else as style, so it skipped the commas, serial commas, semicolons, wrong words (its / it's) and wrong prepositions that Grammarly flags. It is now told that punctuation counts (a missing comma before and / but when two full clauses are joined, the serial comma, a comma after an introductory phrase, comma splices, semicolons, a comma that does not belong), plus wrong words, wrong prepositions and subject-verb agreement. It goes through the whole text sentence by sentence and may return up to 40 fixes (was 12).
- **A long answer is no longer thrown away.** Long texts are sent in smaller pieces (2,200 characters, was 3,500) and the answer has more room to finish (3,500 tokens, was 2,000). Before, an answer that ran out of room was discarded whole, so a text with many problems could come back with none. A cut-off answer now keeps every fix that did arrive.
- **The local AI never swaps a body word.** A rewrite that changes "lips" or "lip" to "mouth" (or drops or adds any body word: mouth, tongue, throat, neck, breasts and so on) is thrown away, and the model is told lips stay lips. Dialogue in quotation marks is still never changed, and every fix is still only a suggestion (Fix / Ignore).

## Unchanged
- Everything else works as in v1.4.5.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
