# Tasks — the dogs wing

## 1. ROM survey

- [x] 1.1 dog.asm (3 states, single-axis 3px charges, the bark SFX 3, the axis flip),
      shooter.asm (the forced alarm + relocations), cowardduck.asm (the loop, the
      sine-table boomerang, text 139, the Card8Taken gate), DismissActor4 (the CARD8 drop)

## 2. Implementation

- [x] 2.1 export-actors.mjs: dogs/duck/shooters(alert); dog.png + cowardduck.png;
      bark.wav + boomerang.wav
- [x] 2.2 game.js: the dogs system, Coward Duck + boomerangs (+ the CARD8 drop and gate),
      the ambush-room alarm force; shotTarget includes dogs/duck/jetpacks

## 3. Checks

- [x] 3.1 dogs.headless.mjs: 15 checks — all suites green
- [ ] 3.2 User batch playtest (end of run)

## 4. Playtest fixes (2026-06-12)

- [x] 4.1 dog.png re-exported with the ROM colors: SprSetDog -> SprsetPal6, layer A =
      slot 0x0D (73h,4) #FF926D, layer B = slot 0x0F black, and the overlap keeps LAYER
      A (no CC bit on the dog's color bytes — priority, not an OR mix) — was the
      gray/tan defaults with a black overlap
- [x] 4.2 The tall (up/down) dog frames draw at the ROM offsets (SprOffsets15:
      y-16 / y+0) — they were 8px too high; left/right (SprOffsets16) were already right
- [x] 4.3 Coward Duck colors: cowardduck.png re-exported with ActorSprColors13 (2, CC
      4Dh) under SprsetPal17 — dark olive #494900 + tan #B6926D, black overlap (was the
      exporter defaults); the walk now alternates its two ROM poses (Anim2FramesActor)
- [x] 4.4 The boomerang reaches the player: the Y sweep was double-scaled (cos already
      x127, then /2 again -> half depth); the ROM is GetSinCos 0-255 then /2 = a 127px
      dive (63 short-range). The X quarter (+-63) was right. Suite asserts the depth
- [x] 4.5 The boomerang draws its REAL 3 spin frames (SprBoomenrang singles, color 0x0E
      white, advancing every 2 iterations) — was a flickering rectangle stand-in
- [x] 4.6 NOT changed: CARD8's drop spot is FIXED in the ROM (DismissActor4: DE=3870h ->
      x 0x38, y 0x70) regardless of where the duck dies — the "drops where he stood"
      memory doesn't match the disassembly
