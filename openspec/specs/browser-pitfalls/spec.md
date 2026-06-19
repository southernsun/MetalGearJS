# browser-pitfalls Specification

## Purpose
TBD - created by archiving change ellen-pitfalls. Update Purpose after archive.
## Requirements
### Requirement: Pitfalls trigger, open, and kill

A room's pitfalls (`ID_PITFALL` in the actor lists) SHALL start closed and invisible,
trigger when the player comes within ±40px of the centre (`ChkTriggerPitfall`), open at
2px per iteration to a 64px hole with SFX 7 (`PitfallLogic`), and from then on standing
inside the hole (±holeSize/2 of the centre, `ChkPitfall`) SHALL take ALL the player's
life immediately — no damage-delay i-frames (DecrementLife_B direct). The hole renders
as the shaded pit (the ROM's GfxPitfall art approximated; the geometry and growth exact).

#### Scenario: The trap springs

- **WHEN** Snake walks toward room 166's far side
- **THEN** the floor opens ahead of him, and stepping onto the hole kills him outright

### Requirement: Ellen cries for help through the wall

While in room 166, the HELP-ME voice (`ID_HELPME_VOICE` → `ChkSayHelpMe`) SHALL show
text 128 unskippably on arrival and again every 0xC0 iterations.

#### Scenario: The lure

- **WHEN** Snake lingers in room 166
- **THEN** "HELP ME!" keeps coming through the wall — bait over the pitfall

