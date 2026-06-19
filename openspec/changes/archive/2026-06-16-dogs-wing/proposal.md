# The dogs wing — dogs, the shooter ambushes, Coward Duck

## Why

The wing behind the courtyard (192-207) holds the ROM's remaining basic-actor cast: the
guard dogs, the always-alert shooter ambushes, and Coward Duck — CARD8's keeper and the
gate to Jennifer's brother (room 193, whose rescue special already shipped).

## What Changes

- DOGS (DogLogic, room 207): sleep (random 0x20-0x38 iterations, lying) -> listen
  (random 20-32, sitting) -> a coin flip back to sleep or the CHARGE: single-axis runs at
  3px/iteration toward the player, re-aiming with the BARK (SFX 3) every random 20-32
  iterations and flipping axis on wall contact. Life 2, bite 2 + the alarm. dog.png
  (18 pair-frames; the tall/long run frames compose two pairs).
- SHOOTER AMBUSHES (InitShooter, rooms 88/90/91/206): the shooters spawn IN ALERT and
  entering the room forces the alarm with a deep reinforcement timer; the strafe pattern
  is approximated by the alert-guard AI (documented).
- COWARD DUCK (CowardDuckLogic, room 193): gated on CARD8 (reappears until it's taken);
  the unskippable intro text 139 once + boss music; the sidestep-throw-return loop (8
  iterations at 2px, the elliptical BOOMERANG — sine-table flight, clockwise by side,
  random short range, returning and vanishing; 8 damage), life 0x14; his death drops
  CARD8 at (0x38,0x70) (DismissActor4). cowardduck.png; the boomerang draws as a spinning
  marker (its pattern lives in the room spriteset — documented approximation).

## Capabilities

### New Capabilities

- `browser-dogs-wing`: dogs, shooter ambushes, Coward Duck + CARD8.

## Impact

- web/game.js; Tools/export-actors.mjs (dogs/duck/shooters); web/assets (dog/cowardduck
  pngs, bark/boomerang wavs); dogs.headless.mjs (15 checks).
