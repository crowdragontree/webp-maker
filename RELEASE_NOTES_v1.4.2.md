# JuicyChat Creator Tool v1.4.2

## New
- **Harper, built in.** Automattic's free, open-source grammar checker ships inside the app and is on by default: spelling, capitalization, a / an, repeated words, agreement and other common slips, instantly, with nothing to install. Inside quoted dialogue it only checks spelling. It can be switched off in Settings > Grammar engine.
- **The local AI, a third Grammar engine.** Settings > Grammar engine now offers **Install the local AI** next to LanguageTool and GECToR. It is an open model (Qwen3.5 9B, free) running on your computer through llama.cpp: no credits, no account, nothing sent anywhere.
  - It reads whole sentences and rewrites the broken or awkward ones ("You dated Sabine for five years and married for two of them"), fixes verbs in the wrong tense, and follows your Past / Present choice.
  - Every rewrite is a suggestion with Fix and Ignore. A rewrite that would change dialogue, a {{marker}}, a link or a picture is dropped.
  - About 5.8 GB to download once; a broken-off download continues where it stopped. Uses the graphics card when there is one. Needs about 8 GB of free memory while it runs. Answers are kept, so an unchanged passage is never checked twice.
- **Edit a suggestion before it goes in.** A local AI rewrite sits in its own editable box, a word fix in a small editable field. Editing ticks it, Apply puts in your edited version, and an edited rewrite is checked again as you type.
- **Write your own version of a sentence.** In Spelling & Grammar, every sentence with a finding has a box to rewrite it yourself. Your version is checked as you type (the built-in check, Harper, then the Grammar engine), and what they find is listed under the box with a **Use** button. Apply puts your version in.
- **Only one Grammar engine at a time.** Installing one removes the others once it has installed and passed a test.

## Unchanged
- Everything else works as in v1.4.1.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
