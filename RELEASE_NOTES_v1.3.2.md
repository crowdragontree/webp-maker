# JuicyChat Creator Tool v1.3.2

## Fixes
- **Save as .json makes a file JuicyChat can upload.** JuicyChat refused the old .json with "Unknown JSON Format Error". Its upload accepts the Pygmalion / Text generation layout, so the file now has exactly those fields:
  - char_name: the bot's name (Scene name)
  - char_persona: Personality
  - world_scenario: Scenario
  - char_greeting: Greeting
  - example_dialogue: Interaction Examples

  This layout has no place for the Introduction or the Tags, so paste those into JuicyChat as before. The .txt save still holds the whole bot.
- **Open a built bot also takes .json files:** the new layout, TavernAI cards, and .json files saved by earlier versions.

## Unchanged
- Everything else works as in v1.3.1. Saved bots, designs and templates keep working.
- Everything stays on your computer. No uploads.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
