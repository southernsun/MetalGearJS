## 1. Logo exports

- [x] 1.1 RoomViewer `--export-title`: konami-logo.png — the three 1bpp blobs composed via
      the `KonamiLogoTiles` walk (rows 8px apart, signed X offsets) in the `KonamiLogoPal`
      colours — DONE, visually verified (the orange/red wave + grey "KONAMI®");
      logic/konamilogo.asm + logic/mainmenu.asm added to GameData's parse list
- [x] 1.2 metal.png (13×4) + gear.png (9×4) from `gfxMetalGearLogo` via `MGLogoColors` +
      `MenuPalette` — DONE, visually verified (the chrome METAL GEAR wordmark)
- [x] 1.3 logo-move.wav (SFX 0x47) + logo-stop.wav (0x4A) exported and wired into loadSounds

## 2. The title state machine (game.js)

- [x] 2.1 `gameState 'title'` + `titlePhase` (konami-reveal → konami-hold → swoop → wipe →
      text-wait → ready), ROM-iteration paced with the exact counters (49×2 reveal, 0x20
      hold, MenuCnt 12 swoop over MGLogoYpos with SFX 0x47, wipe + park, 12 to the texts)
- [x] 2.2 Title render: white screen + the partial konami-logo clip for the reveal; the
      swoop accumulates on an offscreen canvas (the intentional ROM smear trail;
      EraseLogoRests wipes it); parked logo + "© KONAMI 1987" (the 0x3A © glyph) /
      "PUSH SPACE KEY" at the txtPushSpace coordinates in the game font
- [x] 2.3 ChkAnykeyStart gating: any key before ready skips to the parked title + SFX 0x4A;
      Space/M in ready starts; arrows inert on the title; boot lands in the title (the
      #gate overlay removed; the loop starts immediately and the first keypress unlocks
      audio — silent-until-gesture matches the ROM's muted logo phase); ?room=/#auto dev
      hooks skip the title

## 2b. Playtest fix (user-reported)

- [x] 2b.1 The Konami logo's components were misaligned on X — root cause: the shared
      AsmParser rejected NEGATIVE hex literals (`db -10h` in KonamiLogoTiles failed
      NumberStyles.HexNumber and was silently dropped, so the row-3 offset consumed tile 8
      and shifted every later row). TryParseNumber now handles a leading sign; konamilogo
      re-exported and visually verified (the interlocking double-wave + clean "KONAMI");
      no other parsed file uses negative literals, so no other export was affected

## 3. Checks + docs

- [x] 3.1 web/title.headless.mjs (12 checks): the reveal clip at (0x28,0x40) with cnt/2
      lines, 98-iteration timing, the 0x20 hold, SFX 0x47, 11 accumulated swoop steps with
      ZERO clears (0xC0 down to 0x20), the wipe + park coordinates, texts at rows
      0x60/0x88, the skip + SFX 0x4A, Fire-only start
- [x] 3.2 All suites pass — 275/275 across 12 suites; SESSION-STATE updated (boot flow,
      shipped entry, attract-demo divergence) and rom-coverage regenerated
