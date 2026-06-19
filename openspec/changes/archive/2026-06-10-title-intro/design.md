# Design — the intro / title screen

## Context

ROM behaviour, verified:

- **Konami logo** (logic/konamilogo.asm): `InitKonamiLogo` sets a WHITE backdrop and
  `KonamiLogoPal` (1/2 = the red logo tones, 3 = grey, 0x0F white), composes the 168×49
  logo into a page-1 buffer from three 1bpp tile blobs (`gfxKonamiLogo` colour 1,
  `gfxKonamiLogo2` colour 2, `gfxKonami` colour 3 — Banks0123.asm:3242) laid out by
  `KonamiLogoTiles` (tile rows separated by 0xFE + a signed X offset), and seeds two
  counters (0x3C, 0x31). `DrawKonamiLogo` copies one more pixel LINE of the logo to the
  screen every TWO iterations (49 lines ≈ 98 iterations — the top-down reveal the player
  reads as a fade-in), then sets the end flag; the boot state machine holds 0x20 iterations
  (`WaitCounter`) before switching.
- **Title** (logic/mainmenu.asm): `LoadIntroGfx` — black backdrop, `LoadFont`,
  `SetMetalGearLogo` (decode `gfxMetalGearLogo`, 70 tiles 3bpp through `MGLogoColors`
  {0,2,3,4,5,9,10,14}; "METAL" = 13×4 tiles, "GEAR" = 9×4 per `MetalTilesDat`/
  `GearTilesDat`), `MenuPalette`. `MenuLogoLogic` states: 0 `LogoSfx` (SFX 0x47, MenuCnt =
  12); 1 `LogoScroll` — each iteration draws METAL at (0x20, `MGLogoYpos[MenuCnt-1]`) and
  GEAR at (0x88, +8) WITHOUT erasing the previous draw (Y steps 0xC0,0xB0,…,0x20 — the
  upward swoop leaves a smear trail, authentic); 2 `EraseLogoRests` — clear the screen and
  draw the logo parked (METAL Y 0x20, GEAR Y 0x28); 3 `PrintPushSpace` — after 12 more
  iterations prints `txtPushSpace`: "©" at (0x4E,0x60), "KONAMI 1987" at (0x58,0x60),
  "PUSH SPACE KEY" at (0x48,0x88); 4 = done (the boot machine then waits and would start
  the attract demo).
- **Start gating** (`ChkAnykeyStart`, Banks0123.asm:10617): while booting (status ≠ menu),
  ANY control skips to `GoToMenu` — `LoadIntroGfx` + `DrawMenuNow` (logo parked instantly,
  SFX 0x4A, texts) — and on the menu only Fire 1/Fire 2 (bits 0x30: Space / M) starts the
  game.

## Goals / Non-Goals

**Goals:**
- Boot into the authentic sequence: Konami reveal on white → hold → black → swoop with
  trails + SFX → texts → Space (or M) starts; any key during the logo skips to the title.
- Pixel-true logo art from the gfx blobs; ROM timings in ROM iterations.

**Non-Goals:**
- The attract loop (`GS_DemoPlay` replays recorded inputs — no demo system; the title
  idles instead, documented divergence) and the title→logo cycling that rides on it.
- The Japanese region lock, the F5 music toggle, and the post-start intro scene
  (introscene.asm — its own future slice).

## Decisions

1. **Exports**: konami-logo.png (compose the three 1bpp blobs via `KonamiLogoTiles` exactly
   as `SetUpKonamiLogo` does, coloured by `KonamiLogoPal`) and metal.png + gear.png
   (3bpp tiles via `MGLogoColors` mapped through `MenuPalette`) from RoomViewer (it owns
   tile decoding and palettes); logo SFX 0x47/0x4A via the existing `--export-sfx`.
2. **State machine in game.js**: `gameState 'title'` with `titlePhase`
   (`konami-reveal` → `konami-hold` → `swoop` → `wipe` → `text-wait` → `ready`), ticked on
   ROM iterations like the call/text/elevator systems. The swoop trail is drawn by NOT
   clearing the canvas between swoop frames (the one render path that intentionally
   accumulates — an explicit comment marks it).
3. **Boot flow**: `main()` lands in the title instead of the play gate; the #gate overlay
   goes away (the canvas itself is the splash). Browser audio unlocks on the first
   keypress, so a fully-undisturbed boot runs the reveal silently — the ROM's logo phase
   is silent anyway (`InitKonamiLogo` mutes, 0x5C), and the swoop SFX simply starts from
   whenever the context exists (documented browser-policy note).
4. **Start keys**: faithful `ChkAnykeyStart` — any key in the konami phases → skip to
   `ready` (parked logo + texts + SFX 0x4A); in `swoop`/`wipe`/`text-wait` the same skip
   applies (the ROM's any-key works across status < menu... the menu reached mid-swoop is
   still status 1 — fire keys start, other keys do nothing once on the menu); Space/M in
   `ready` starts the game (the existing start path).
5. **Restart unchanged**: death still restarts the slice directly (the ROM's continue flow
   is a separate system); the title shows on first boot only.

## Risks / Trade-offs

- [`KonamiLogoTiles` layout bytes (0xFE + signed offsets) must be interpreted exactly] →
  the exporter ports the `DrawTiles`-style walk; verified visually against the known
  KONAMI wordmark.
- [The swoop's accumulate-without-clear fights the engine's redraw-every-frame model] →
  the title render keeps its own offscreen accumulation canvas; everything else unchanged.

## Open Questions

- None blocking.
