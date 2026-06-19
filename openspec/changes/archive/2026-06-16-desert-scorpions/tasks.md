# Tasks — desert scorpions

## 1. ROM survey

- [x] 1.1 scorpion.asm read end-to-end (3 states, the diagonal speed table, the limits);
      the poison path in touchenemy.asm:115-121 + GS_Playing's 0x40-iteration drain +
      ChkUseAntidote (clears, not consumed); locks 12/13 in opendoor.asm:213-256
- [x] 1.2 Tables: life 2 (idxActorLife), touch shape 8 (0,8,0,12), bullet shape 2
      (0,8,0,8), explosion shape 1 (±0x14); sprites SprScorpion = 8 OR-pairs (UL/LD/RU/DR
      x2 anim, pattern ids 0x60-0x9C in actorspriteattr.asm)

## 2. Implementation

- [x] 2.1 The generic `--export-actor` SpriteMover flag (any sprites.asm label as OR-pair
      frames); scorpion.png/json; export-actors.mjs scorpions array
- [x] 2.2 game.js: buildScorpions/scorpionTick (iteration-gated, literal ROM values)/
      drawScorpions; shotTarget includes scorpions with per-actor shot shapes; the poison
      flag + drain + antidote wiring + restart clear; locks 12/13 one-shot gates

## 3. Checks

- [x] 3.1 desert.headless.mjs: 17 checks (spawn, diagonal bursts, the charge + rest, the
      margin flip, the no-damage sting, the drain cadence, the antidote, bullet kill +
      logic-tick removal, both flag locks one-shot, restart) — all suites green
- [ ] 3.2 User batch playtest (end of run)

## 4. Playtest fixes (2026-06-12)

- [x] 4.1 Colors: scorpion.png re-exported with the ROM sprite palette — spriteset 4 ->
      SprsetPal4 (data/palettes.asm): color 2 = R4,G0,B0 (#920000), color 0xD = R7,G0,B0
      (#FF0000), OR-overlap color 0xF = black (PalMenuWeapon) — was the exporter's
      gray/tan defaults
- [x] 4.2 The charge is CalcShot's CONSTANT-magnitude dash (ShotSpeed 0x80 ->
      SCORPION_DASH ~4.4px/iteration), aimed once; at zero distance it degenerates to a
      full-speed dash right (CalcQuadrantDegree) — the old normalized 1px vector went to
      ZERO on contact and parked the scorpion on Snake
- [x] 4.3 The sprite frame updates only at the SetScorpionSprId call sites (init / new
      dir / turn), not as a free-running animation
- [x] 4.4 ?arsenal now grants the antidote (its real pickup is room 138), the bomb suit,
      and the parachute for the desert/roof tests; suite now 18 checks
