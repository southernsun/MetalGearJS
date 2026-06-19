# Desert scorpions + the flag door locks

## Why

The desert (208-217, now exported) and room 102 ship their ROM wildlife: scorpions whose
sting POISONS Snake — a system (Poisoned + the antidote) that existed only as a menu stub.
The desert routes also hang on two flag-driven door locks (12: building 2's entrance,
13: the compass room) whose flags later slices set.

## What Changes

- ScorpionLogic ported (logic/actors/scorpion.asm): random diagonal wander bursts
  (ScorpionSpeedDat ±1px/iteration), the 0x51-distance charge (CalcShot toward the
  player), the room-margin turns (ChkScorpionLimits), the 0x14 rest. Life 2, bullet box
  shape 2 (0,8,0,8), explosion box shape 1 (the standard ±0x14).
- The sting (ChkScorpion, touchenemy.asm:115-121): NO direct damage — Poisoned=1 + the
  damage SFX; poison drains 1 life every 0x40 iterations (GS_Playing) until the ANTIDOTE
  is used (ChkUseAntidote: clears the flag, the item is NOT consumed). Restart clears it.
- Locks 12/13 (ChkDesertDoorBuild2/ChkCompassDoor): one-shot flag gates — room 73 opens
  southward from inside; outside, the desert guards' uniform event (DoorBuild2LockedF)
  and Jennifer's radio event (JeniOpenDoorF) set the flags (those events land in their
  own slices; the doors stay faithfully locked until then).
- scorpion.png exported (the SprScorpion OR-pairs, 8 diagonal frames) via the NEW generic
  `--export-actor <SprLabel> <out.png> [#A #B #overlap]` SpriteMover flag; actors.json
  grew a scorpions array.

## Capabilities

### New Capabilities

- `browser-scorpions`: the desert wildlife + the poison system.

## Impact

- web/game.js (scorpions, poison, locks 12/13), Tools (the generic actor exporter,
  export-actors.mjs scorpions), web/assets (scorpion.png/json, actors.json);
  desert.headless.mjs (17 checks).
