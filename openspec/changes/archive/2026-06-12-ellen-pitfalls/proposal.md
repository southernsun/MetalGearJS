# Ellen's cell: the bomb wall, the pitfall, and the HELP-ME voice

## Why

The plastic bomb shipped with its wall hook dormant — and the survey found the nearest
live bomb wall right next to the exported prison pocket: door id 106 between rooms 166
and 167 is `ChkBasementWall`'s wall (lock 16 — the weapons slice had keyed the hook on
14, actually the Big Boss door; fixed here), and 167 is ELLEN's cell. Room 166 is the
ROM's trap room: Ellen cries "HELP ME!" through the wall (`ChkSayHelpMe`) over a lethal
PITFALL (`PitfallLogic`/`ChkPitfall`). Four rooms (55/56/166/167) connect it all to the
basement chain.

## What Changes

- **Rooms 55/56/166/167 exported**: 54 → 55 → 56 walk; 55's CARD6 door enters 166
  (the card itself lives in a later zone — noted); the lock-16 bomb wall 166 ⇄ 167.
- **The lock fix**: ChkOpenDoor's dispatch maps lock 14 = ChkBigBossDoor, 15 =
  ChkPrisonWalls, **16 = ChkBasementWall** — chkBombWalls now keys on 16, and punching a
  bomb wall plays the breakable SFX without effect (`ChkPunchBaseWall` — "punching them
  sounds funny").
- **Pitfalls** (`ID_PITFALL`, exported per room in actors.json): closed until Snake comes
  within ±40px of the centre (`ChkTriggerPitfall`), then the hole opens 2px/iteration to
  64px (SFX 7 "Pitfall opens"), and standing inside is INSTANT DEATH (`ChkPitfall`:
  DecrementLife with all life, no i-frames). The hole art is a shaded black square
  (GfxPitfall's tile art approximated; geometry/growth exact).
- **The HELP-ME voice** (`ID_HELPME_VOICE`): text 128, unskippable, on entry and every
  0xC0 iterations while in room 166.
- **Ellen**: her real actor (ID_ELLEN at (0x80,0x60)), her own sprite sheet (SprElen in
  ActorSprColors14's tan + dark-red dress), her real rescue text (129, already special-
  cased). The export-actors tool also fixed her ID spelling and grew pitfall/helpme
  output.

## Capabilities

### Modified Capabilities

- `browser-doors`: the bomb-wall lock corrected to 16 + the punch-SFX-only behaviour.
- `browser-rank-progression`: Ellen live with her sheet/text.

### New Capabilities

- `browser-pitfalls`: trigger/opening/lethality + the help-me cry.

## Impact

- game.js (pitfalls/helpme systems, the lock fix, Ellen's sheet), export-actors.mjs,
  ellen.png + pitfall.wav exports, rooms +4 (85 total); capture suite grows the trap-room
  route (41 checks; 395 total).
