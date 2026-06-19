# The moving lorries (GameMode 5) + the desert lorry ambush

## Why

Six lorry interiors (199/217/219/213/215/173) are the ROM's "fast travel" trap — boarding
one starts a ride you can't stop; and the desert convoy (104) hides a four-shooter ambush.

## What Changes

- THE RIDE (ChkLorryMov/LorryMoving, logic/lorry.asm): entering a MovingLorries interior
  starts GameMode 5 — 0x90 iterations of dead controls, the screen shaking through the
  VertScrollOffset wobble, the engine SFX looping, and (once per game, LorryMovTextF)
  text 91: "I GOOFED. THE LORRY STARTED TO MOVE". The ride ends back in play; the lorry's
  exit door then opens where it drove to.
- THE AMBUSH (room 104): the four ID_LORRY_SHOOTERs spawn alerted with the forced alarm,
  like the shooter rooms. (The exporter also fixed a comment-stripping bug that had
  dropped room 104's actor list entirely.)

## Capabilities

### New Capabilities

- `browser-lorry-ride`: the ride + the ambush.

## Impact

- web/game.js, Tools/export-actors.mjs, web/assets (lorry-moving.wav);
  lorry.headless.mjs (7 checks).
