# Answering the radio call (the transceiver screen + real texts)

## Why

The incoming call now rings in room 0 but cannot be answered — the radio screen (GameMode 4)
doesn't exist, and the briefing text it would show ("THIS IS BIG BOSS... MISSION! GAIN ACCESS
TO THE ENEMY'S FORTRESS, OUTER HEAVEN...") lives in a text system we have only stubbed. The
disassembly fully specifies both: `RadioLogic` (Banks0123.asm:10675) drives the transceiver
through five states, `UpdateRadio` (Banks0123.asm:2379) + data/radiocalls.asm define who
answers per room (room 0 = Big Boss, auto-reply, text 3), and the texts live
dictionary-compressed behind `idxTexts` (data/texts.asm) with the text-window engine
(`SetText`/`TextBoxLogic`/`TW_PrintChar`, Banks0123.asm:7808+) unpacking and printing them.

## What Changes

- **Real ROM texts**: a new exporter decodes `idxTexts` + the dictionary compression
  (bytes ≥ 0x80 expand to words; 0 = space, 0xFE = newline, 0xFD = page wait, 0xFF = end;
  first byte = window config) into `texts.json`. The text window plays these for real:
  char-by-char print at the ROM cadence with the print SFX, line wrap at the window edge,
  page waits, and the ROM skip keys — replacing the hardcoded "RESCUED!"-style stub.
- **The transceiver screen**: a key opens the radio (ROM F4; browser binding documented).
  Faithful to `RadioLogic`'s states: `DrawRadio` (radio UI + Snake portrait from the ROM
  tile maps, frequency display, RECV label, radio-noise SFX, **stops the incoming CALL**),
  `RadioIdle` (left/right tune the BCD frequency 0-99 with the ROM hold-repeat; UP sends —
  prints "THIS IS SOLID SNAKE... YOUR REPLY, PLEASE." text 10 with the talking-Snake
  portrait animation), `RadioSignalUp` (12 LEDs light one by one), `SetupRadioReply` (the
  caller's text), `RadioSignalOFF` (LEDs off, back to idle, auto-reply latched until the
  frequency changes). F4/close exits, also from inside a radio text.
- **Who answers**: `UpdateRadio` ported with `idxRoomRadio` exported from data/radiocalls.asm
  (per-room person/frequency/wait-call/auto-tune/text id; `RadioFreqs` per person). Room 0:
  Big Boss 120.85, auto-reply, mission briefing (text 3); rooms 1/4/5 have wait-call
  entries. The frequency initialises to Big Boss's at game start (Banks0123.asm:11794).
  The reply gates that exist in our slice are ported (auto-reply-done latch, reply-requested);
  the antenna/Schneider-captured/Jennifer/SwitchOffMSX gates reference absent systems and
  stay documented-inert.
- **Answering the call**: opening the radio while the CALL rings stops the ring (`DrawRadio`
  sets `RadioCallFlag = 2`) and — with the frequency already on Big Boss — the auto-reply
  delivers the briefing.
- **New exports**: radio screen background + Snake portrait frames (tile maps
  `RadioTilesMap`/`SnakeTilesMap`/`SnakePicture0-2`, data/tileblocks.asm, second tileset
  bank), the red frequency digits (`gfxFreqDigits`), LED on/off tiles, texts.json,
  radiocalls.json, and the radio-noise SFX if present in the catalog.

## Capabilities

### New Capabilities

- `browser-text-system`: the ROM text table decoded to data + the faithful text-window
  print engine (cadence, wrap, paging, skip keys, print SFX, window config).
- `browser-radio`: the transceiver screen — open/close, UI render, frequency tuning,
  RECV/SEND, auto-reply and wait-call replies per room, LED signal animation, reply texts,
  the talking-Snake portrait, radio SFX.

### Modified Capabilities

- `browser-radio-call`: answering — opening the radio stops the incoming call/ring
  (`DrawRadio`, Banks0123.asm:10701), and the armed caller's reply is reachable through
  the radio.

## Impact

- `web/game.js`: radio mode (state machine, input, render), text-window engine replacement,
  game-start frequency init; `web/index.html` key help.
- New exporters: texts (node, ports the unpacker + dictionary), radiocalls (node), radio
  screen graphics (RoomViewer; second tileset bank rendering already exists for rooms).
- `web/assets/`: texts.json, radiocalls.json, radio-bg.png, snake-portrait.png(+frames),
  freq-digits.png, led tiles, radio-noise wav (catalog permitting).
- New `web/text.headless.mjs` + `web/radioscreen.headless.mjs` (or extensions of
  radio.headless.mjs); updated suite counts and docs/SESSION-STATE.md, rom-coverage.
