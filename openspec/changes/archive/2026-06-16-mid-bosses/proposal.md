# The mid-bosses — Tank, Bulldozer, the Arnolds, Fire Trooper

## Why

Four exported rooms shipped without their ROM bosses: the Tank guarding the courtyard
crossing (67), the Bulldozer blocking the water route (71), the two Arnolds keeping CARD7
(83), and the Fire Trooper with his flame jet on building 2's basement floor (95).

## What Changes

- TANK (tank.asm, room 67, life 0x37, BossTank_KO): up/down drift at 0.5px/iteration with
  idle beats; the CANNON shells Snake's column (±4; the shell falls and BURSTS for 0x20
  in a ±20 box); the MACHINE GUNS burst 0x2D iterations every 0x1E from alternating sides
  — a bullet every 8 with the cycling 0-4 fan, 8 damage. Touch = crush (all life).
- BULLDOZER (bulldozer.asm, room 71, life 0x28, Bulldozer_KO): pushes DOWN in accelerating
  phases (0x60/0x80/0xC0/0xE0 per 256) with 0x10-iteration stops, halting at Y 160.
  Touch = crush.
- ARNOLDS x2 (arnold.asm, room 83, life 0x28 each, gated on Card7Taken): watch flipping
  randomly; Snake crossing their ±0x10 row triggers the 3px/iteration dash; touch 8. The
  SECOND death drops CARD7 at (0x30,0x30) (DismissActor3); with CARD7 taken they never
  return.
- FIRE TROOPER (firetropper.asm, room 95, life 0x1E, FireTrooper_KO): the unskippable
  intro text 108 once; stalks horizontally (X 0x60-0x80) sweeping his EIGHT flames out
  and back toward Snake (flame touch 8, the FlamesLogic jet approximated as the sweeping
  arc); touch 4; his death extinguishes the flames.
- All four start the Mercenary boss music and return the area music on death; all are
  permanent-KO latches; bosses join shotTarget with their own hit boxes.

## Capabilities

### New Capabilities

- `browser-mid-bosses`: the four fights.

## Impact

- web/game.js, web/assets (tank/bulldozer/arnold/firetrooper sheets);
  midbosses.headless.mjs (19 checks). Sprite COMPOSITION is approximate (the multi-pair
  layouts assembled best-effort, pending the visual pass — behaviour is the ported part).
