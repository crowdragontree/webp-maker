# JuicyChat Creator Tool v1.5.3

## Fixes
- **The local AI grammar check now fixes wrong word forms and missing hyphens.** It was told never to swap one word for another, so it left alone mistakes that are one wrong form of the right word, the kind Grammarly catches: "and prepare to read" (prepares), "took what sheltered you could find" (shelter), "holding you closed" (close), "her wraps wrapped itself", and "pale furred ears" (pale-furred). It now must fix the form of a word when grammar needs it: verb agreement, a verb in the wrong tense for the narration, a noun or adjective wrongly turned into a verb, a doubled or missing word, and a hyphen in a compound adjective before a noun. It still never replaces your word with a different word (no synonyms), and body words still stay exactly as written.
- **It reads more closely.** Long text is now checked in pieces of about 1,400 characters instead of 2,200, so the model goes through every sentence instead of skimming.
- Answers saved under the old rule are not reused, so text you checked before is checked again with the new rule.

## Unchanged
- Everything else works as in v1.5.2. Every fix is still a suggestion (Fix / Ignore); nothing changes on its own.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
