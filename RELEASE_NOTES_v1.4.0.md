# JuicyChat Creator Tool v1.4.0

## New
- **Two grammar engines to choose from.** Settings > Grammar engine now has **Install LanguageTool** and **Install GECToR**.
  - **GECToR** is a small grammar-correction model that runs only on your computer (no credits, nothing sent anywhere). It finds wrong verb forms and tenses, agreement mistakes, missing or extra words, and wrong articles and prepositions.
  - It reads narration only: quoted dialogue, {{markers}} and picture links are never changed.
  - It follows the narration tense: when you press **Past** or **Present** for the Introduction or the Greeting, a suggestion that would turn a verb back into the other tense is dropped. Time words like "tonight" are never touched.
  - Download: about 90 MB for its engine (ONNX Runtime) and about 250 MB for the model (DeepQuill's GECToR for fiction). About 300 MB on disk.
- **Test it shows what the engine found.** The sample sentence, how many things it found, and each suggestion (what is written → what it suggests), for GECToR and LanguageTool.
- **Only one engine at a time.** Installing one asks first, then removes the other once the new one has installed and passed a test, so you never keep both large downloads and never end up with none.
- **"Spelling & wording" is now "Spelling & Grammar".** GECToR's suggestions appear there, to apply or ignore like the others.

- **Save as .json no longer includes the Interaction Examples.** JuicyChat does not import them, so example_dialogue is always left empty. The file keeps the same five fields JuicyChat accepts. Copy and Save as .txt still include the examples.

## Also in this version
- **Interaction Examples come along when you open a built bot** (from v1.3.3): read from a .txt or a .json bot, so they show in the Bot Builder, Copy and Save as .txt.

## Unchanged
- Everything else works as in v1.3.3. Saved bots, designs and templates keep working.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
