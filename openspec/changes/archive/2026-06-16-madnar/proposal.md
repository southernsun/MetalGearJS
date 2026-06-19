# Dr. Madnar + Fake Madnar

## Why

The two bespoke prisoner actors whose rooms (182/189) shipped empty since building-2:
the real doctor with his Ellen-gated dialogue, and the trap double.

## What Changes

- DR. MADNAR (ID_MADNAR, room 182): rescues through the standard prisoner system (the
  rank counter included) with the EVENT GATE — text 124 ("SAVE ELLEN OR I WON'T DISCUSS")
  until Ellen (room 167) is rescued, then text 125 (the Metal Gear basement briefing).
- FAKE MADNAR (fakemadnar.asm, room 189): waits in the prisoner pose; the touch springs
  the trap — the unskippable text 109 ("YOU ARE CAUGHT IN A TRAP... I WILL GET YOU
  FOXHOUNDER!"), a PITFALL opening at (0x80,0x60), and the double sinking away forever
  (the RescuedArray latch). No contact damage (TouchPlayer exempts him).

## Capabilities

### New Capabilities

- `browser-madnar`: both doctors.

## Impact

- web/game.js, Tools/export-actors.mjs (ID_MADNAR -> prisoners, ID_FAKE_MADNAR);
  madnar.headless.mjs (7 checks).
