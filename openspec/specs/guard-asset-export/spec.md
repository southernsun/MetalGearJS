# guard-asset-export Specification

## Purpose
TBD - created by syncing change browser-guard. Update Purpose after archive.
## Requirements
### Requirement: Export guard sprite frames

The export step SHALL emit a guard spritesheet (PNG) and a JSON atlas covering the guard's
four facing directions and walk frames, composited with the guard's true colours, in the same
fixed-cell/anchor format used for Snake so the browser can draw a frame at a logical position.

#### Scenario: Guard spritesheet and atlas are generated

- **WHEN** the export step runs
- **THEN** it writes `web/assets/guard.png` and `web/assets/guard.json` to `web/assets/`
- **AND** the atlas has entries for each direction (down/up/left/right) and walk state, with
  a frame size and anchor the game can use to position the guard

#### Scenario: Guard frames use the guard's colours

- **WHEN** a guard frame is decoded
- **THEN** it is composited with the actor sprite/colour tables so the guard appears in its
  in-game colours, not a flat silhouette

### Requirement: Export the alert icon

The export step SHALL emit the alert "!" icon (`gfx/alerticon.asm`) as a transparent PNG.

#### Scenario: Alert icon is generated

- **WHEN** the export step runs
- **THEN** it writes `web/assets/alert-icon.png`, a small transparent PNG of the "!" sign that
  the game can draw above a guard

### Requirement: Export the alert music

The export step SHALL render the ROM's Alert music to an audio file the browser can play.

#### Scenario: Alert music is generated

- **WHEN** the alert-music export runs
- **THEN** it writes an alert-music audio file (e.g. `web/assets/alert.wav`/`.ogg`) to
  `web/assets/`, reproducing the Alert track via the same PSG/driver reproduction used for the
  SFX exports
