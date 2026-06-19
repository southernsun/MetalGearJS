# browser-title Specification

## Purpose
The boot sequence: the Konami logo reveal, the METAL GEAR title swoop with its smear trail
and SFX, the title texts, and the ROM's two-tier start gating (any key skips the boot;
Fire 1/Fire 2 starts the game).
## Requirements
### Requirement: The Konami logo opens the boot on white

Booting SHALL show the Konami logo sequence (`InitKonamiLogo`/`DrawKonamiLogo`,
logic/konamilogo.asm): a white screen with the 168×49 logo — composed from the ROM's three
1bpp tile blobs through `KonamiLogoTiles` in the `KonamiLogoPal` colours — revealed
top-down at ONE pixel line every TWO ROM iterations, then held for 0x20 iterations before
the title. The logo art SHALL be the decoded ROM graphic, not a recreation (including the
table's SIGNED row offsets — `db -10h` — which the exporter must parse).

#### Scenario: The reveal

- **WHEN** the game boots untouched
- **THEN** the logo wipes in line by line over ~98 iterations on a white screen, holds,
  and the title follows

### Requirement: The METAL GEAR logo swoops in with its SFX

The title SHALL reproduce `MenuLogoLogic` (logic/mainmenu.asm): on a black screen, SFX 0x47
("Menu logo moves up") plays and the logo — "METAL" (104×32) at X 0x20 and "GEAR" (72×32)
at X 0x88, decoded from `gfxMetalGearLogo` via `MGLogoColors`/`MenuPalette` — is drawn at
the `MGLogoYpos` steps (0xC0 up to 0x20, GEAR 8px lower) one step per iteration WITHOUT
erasing the previous draw (the ROM's smear trail), after which `EraseLogoRests` clears the
screen and parks the logo (METAL Y 0x20, GEAR Y 0x28). After 12 more iterations the texts
print (`txtPushSpace`): "©" (0x4E,0x60), "KONAMI 1987" (0x58,0x60), "PUSH SPACE KEY"
(0x48,0x88), in the game font.

#### Scenario: The swoop

- **WHEN** the title phase begins
- **THEN** the logo climbs from the bottom in 16px steps leaving trails, the screen wipes
  clean with the logo parked at the top, and "© KONAMI 1987" / "PUSH SPACE KEY" appear

### Requirement: Start gating follows ChkAnykeyStart

While the Konami logo or the swoop is playing, ANY control SHALL skip to the finished title — the logo parked instantly with SFX 0x4A ("Menu logo stops") and the texts shown (`GoToMenu`/`DrawMenuNow`). On the finished title, only Fire 1 / Fire 2 (Space or M — `ChkAnykeyStart` bits 0x30, Banks0123.asm:10632) SHALL start the game — entering the INTRO scene in room 121 (browser-intro-scene), not play directly; other keys do nothing. The attract demo the ROM would run after idling is NOT ported (no demo-input system) — the title idles instead, a documented divergence.

#### Scenario: Skipping the logo

- **WHEN** a key is pressed during the Konami reveal
- **THEN** the finished title appears at once (logo parked, texts, the stop SFX)

#### Scenario: Starting

- **WHEN** Space (or M) is pressed on the finished title
- **THEN** the intro scene begins in room 121 (the scripted swim)

#### Scenario: Non-fire keys on the title

- **WHEN** an arrow key is pressed on the finished title
- **THEN** nothing happens

