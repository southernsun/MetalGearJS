# browser-intro-scene Specification

## Purpose
TBD - created by archiving change intro-scene. Update Purpose after archive.
## Requirements
### Requirement: Starting the game plays the intro swim

Starting from the title SHALL run `IntroSceneLogic` (logic/introscene.asm; init Banks0123.asm:8422-8438) before play: Snake appears in room 121 at (0xC0,0xB8) in the deep-water animation and swims on his own — left 0x40 counts, surfacing for 0x30, submerging left for 0x50, north for 0x20, surfacing facing right — through the room's REAL collision (the scripted moves feed the normal collision-checked movement). Player input is ignored throughout (CONTROL_INTRO).

#### Scenario: The swim is autonomous

- **WHEN** Fire is pressed on the finished title
- **THEN** Snake dives toward the shore through both scripted legs with no player control

### Requirement: Big Boss calls mid-scene

During the surfaced wait, the CALL sign SHALL ring at count 0x20 (RadioCallFlag = 1 with DrawCallTimer's blink and mod-16 SFX 0x22 cadence); when the wait elapses the transceiver opens over the scene (DrawRadio: ring stopped, LED delay 0x10, noise on), the 12 LEDs climb at the RadioSignalUp pacing, and text 2 — "THIS IS BIG BOSS... OPERATION INTRUDE N313" — prints OVER the radio UI. Dismissing the last page exits the radio (ExitRadio) and the scene continues.

#### Scenario: The briefing

- **WHEN** the intro wait reaches its call
- **THEN** the CALL ring leads into the radio screen, the LEDs fill, and Big Boss delivers
  text 2 before the radio closes

### Requirement: The fence climb is scripted snaps

After the radio, Snake SHALL swim right (2px steps, 0x28 counts) and up (0x30), then snap to Y 0x88 in the ladder animation, climb for 0x1C counts (1.5px — the ROM's 0x0188 speed — crossing room 121's solid fence band), snap to Y 0x66 in the normal animation, and hop down through the `BounceOffsets` table on the odd counts of a 0x0C countdown.

#### Scenario: Over the fence

- **WHEN** the swim reaches the fence
- **THEN** Snake climbs it with the ladder animation between the ROM's Y snaps (0x88, 0x66)
  and bounces down the far side

### Requirement: The landing is the death checkpoint

When the hop ends, control SHALL pass to the player (control mode 0) and the landing spot SHALL be saved as the respawn point (`ChkSaveGameStatus`): a later death restarts Snake at that spot in room 121, not at any other spawn. The dev hooks (`?room`, `#auto`, `?capture`) SHALL keep bypassing the title and the intro entirely.

#### Scenario: Respawn at the fence

- **WHEN** Snake dies after the intro has run
- **THEN** the restart places him at the intro landing spot in room 121

