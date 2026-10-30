# JuicyChat Creator Tool v1.3.3

## Fixes
- **Save as .json includes the Interaction Examples.** Opening a built bot used to drop its Interaction Examples, so a bot you opened and then saved as .json had an empty example_dialogue. Opening a bot now reads them:
  - from a .txt bot: Conversations (User / Character) and Triggered Interactions (Trigger / Response)
  - from a .json bot: example_dialogue

  They show in the Interaction Examples section, and Copy, Save as .txt and Save as .json include them. In a .txt they are no longer stuck onto the end of the Scene Breakdown.
- **The .json layout is unchanged:** the same five fields JuicyChat accepts (char_name, char_persona, world_scenario, char_greeting, example_dialogue). It has one examples field, so a .json opened again lists every example under Conversations.

## Unchanged
- Everything else works as in v1.3.2. Saved bots, designs and templates keep working.
- Everything stays on your computer. No uploads.

## Compatibility
- Windows 64-bit and Linux 64-bit

## Updating
**Check for updates → Update & Restart** installs this version.

## Questions or Problems?
HMU on PG's server.
