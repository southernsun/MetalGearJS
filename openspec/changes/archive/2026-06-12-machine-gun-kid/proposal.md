# Machine Gun Kid — the first boss

## Why

Room 20 sits on the now-live route, empty. The disassembly specifies the boss completely
(`MachGunKidLogic`, logic/actors/machinegunkid.asm): a 5-state fight — the once-only intro
speech (text 79, unskippable, `MachGunStatus` bit 1), boss music ("Mercenary", SetBossMusic),
the slide-shoot-hide cycle along the top corridor over the pillar arena, the downward
bullet fan (`InitMGunKidShot`: speedY 5, X fan ±0.5/iteration, SFX 5), 20 life
(idxActorLife), 8-damage bullets (ActorTouchDamage), and the permanent death latch
(`MachGunStatus` bit 0 via DismissActor7).

## What Changes

- **The boss** in room 20 (ActorsRoom020: (0xE0, 0x34)): intro (2 iterations → text 79
  once → Mercenary loop) → think (waits 0x2D ONLY while Snake hides in his ±16px column —
  `MG_ChkSameWall`; breaks cover and he moves at once) → walk 8 iterations at ±4 within
  X 0x20-0xE0 → shoot 0x28 iterations while Snake is within ±0x30 (a bullet every 4th
  iteration cycling the 0..4..0 fan, recoil frame per shot) → hide → repeat.
- **His bullets** ride the existing guard-bullet system with a per-bullet damage field
  (8 vs the guards' 2) — the pillar tile-collision gives the cover game for free.
- **Damage to him**: the per-weapon tables apply (handgun/SMG 2, grenade 5, rocket 0x0A,
  bomb/mine/missile 5) through the shared shotTarget path; his explosion impact shape is
  the ROM's 0x1B (±0x14 Y, ±0x10 X). At 0 life: the enemy-dead SFX, the music stops, and
  `mgkDead` latches — he NEVER respawns.
- **Exports**: mgk.png (4 frames — fire, recoil, walk1/2 — SprMGunKid OR-pairs in
  SprsetPal11 brown/tan), mercenary.wav (the catalog's "Mercenary (Boss)" via a new
  music fallback in `--export-sfx`), bullet-shot.wav (SFX 5) — which ALSO replaces the
  guard-shot synth stand-in (the catalog mapping is now confirmed by InitMGunKidShot).

## Capabilities

### New Capabilities

- `browser-bosses`: Machine Gun Kid's fight (the pattern, the bullets, the life/damage
  tables, the speech/music/death latches).

## Impact

- web/game.js (the boss block + per-bullet damage + shotTarget grows the boss), the
  three asset exports, web/mgk.headless.mjs (18 checks); SESSION-STATE, coverage.
