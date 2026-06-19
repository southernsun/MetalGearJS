# The intro: Konami logo + Metal Gear title screen

## Why

The game currently boots straight into play behind a placeholder "press any key" gate. The
original boots through a title sequence the disassembly fully specifies: the Konami logo on
white, revealed line by line (`DrawKonamiLogo`, logic/konamilogo.asm — one pixel line every
two iterations); then the METAL GEAR logo swooping up from the bottom of a black screen in
16px steps with its own SFX (`MenuLogoLogic`/`LogoScroll`, logic/mainmenu.asm — leaving
smear trails that are then wiped); then "© KONAMI 1987" and "PUSH SPACE KEY"
(`txtPushSpace`); and the start gating (`ChkAnykeyStart`, Banks0123.asm:10617 — any key
skips the logo to the title; Fire 1/Fire 2 on the title starts the game).

## What Changes

- **Boot state machine** replacing the placeholder gate: `konami` (white screen,
  `KonamiLogoPal`, the 168×49 logo wiped in top-down at 1 line per 2 ROM iterations, then a
  0x20-iteration hold) → `title` (black screen; SFX 0x47 "logo moving"; the logo drawn at
  `MGLogoYpos` steps 0xC0→0x20 every iteration of `MenuCnt` 12 WITHOUT clearing — the ROM's
  smear trail — then `EraseLogoRests` clears and parks it; 12 more iterations then the
  texts print) → waiting for start.
- **Start gating per `ChkAnykeyStart`**: any control during the Konami logo skips straight
  to the finished title (`GoToMenu`/`DrawMenuNow`: logo parked + SFX 0x4A "logo stops" +
  the texts); on the title, only Fire 1/Fire 2 (Space / M) starts the game.
- **New exports**: konami-logo.png (the three 1bpp tile blobs `gfxKonamiLogo/2`/`gfxKonami`
  composed via `KonamiLogoTiles` in the `KonamiLogoPal` colours), the METAL GEAR logo
  (gfxMetalGearLogo, 70 tiles, 3bpp via `MGLogoColors` + `MenuPalette` — "METAL" 104×32 and
  "GEAR" 72×32 blocks per `MetalTilesDat`/`GearTilesDat`), and the two logo SFX ("Menu logo
  moves up" 0x47, "Menu logo stops" 0x4A).
- **Out of scope**: the attract/demo loop (`GS_WaitMenu` → `GS_DemoPlay` replays recorded
  inputs — no demo system in the port; the title stays up instead, a documented
  divergence), the Japanese region lock, and the intro scene after starting (Snake's
  swim-in — a separate slice).

## Capabilities

### New Capabilities

- `browser-title`: the boot sequence — Konami logo reveal, the title swoop with trails and
  SFX, the title texts, and the ROM's two-tier start gating.

### Modified Capabilities

(none)

## Impact

- `web/game.js`: title state machine before 'play', boot path/`main()` rework, key gating;
  `web/index.html` gate text update (the canvas shows the sequence; first keypress also
  unlocks audio — until then the intro runs silent, a browser-policy note).
- `Tools/RoomViewer` (or SpriteMover): konami-logo.png + metal/gear logo exports;
  `Tools/ThemeOfTaraPlayer --export-sfx` ×2.
- New `web/title.headless.mjs`; SESSION-STATE, rom-coverage.
