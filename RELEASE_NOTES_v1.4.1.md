# JuicyChat Creator Tool v1.4.1

## Fixes
- **GECToR no longer pushes past narration into the present.** It stopped suggesting changes like "read" → "reads" or "came" → "comes" when the narration is past (and the other way round for present). A verb is judged by every form it can be ("read" can be past), and a sentence is never half-converted while it is checked, so the real slip is still found.
- **GECToR catches a present verb in past narration** right after "she / he / they / you / then": "then deletes the thread" → "deleted", "she is" → "she was". Nouns are left alone ("the threads").
- **Ignore button on grammar suggestions.** In Spelling & Grammar, a grammar suggestion you know is wrong now has **Ignore**. It is not shown again for that sentence; the same word elsewhere is still checked. Before, the only button was Add to dictionary, which is for spelling.
- **The Spelling & Grammar window says who found the things:** the app's own checker, plus GECToR or LanguageTool when one is installed. It no longer says "no AI" when GECToR found them.
- **GECToR uses the narration tense to find verbs in the wrong tense** even when the model is unsure ("then deletes" → "deleted"), and **Test it** shows the sample sentence, the count and each suggestion.

## Unchanged
- Everything else works as in v1.4.0.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
