# Design — answering the radio call

## Context

ROM behaviour, verified in the disassembly:

- **Radio mode** (`RadioLogic`, Banks0123.asm:10675): F4 toggles GameMode 4. Five states via
  `EquipRadioStatus`: `DrawRadio` (0) draws the UI and advances to idle; `RadioIdle` (1) is
  the interactive state; `RadioSignalUp` (2) animates the LEDs; `SetupRadioReply` (3) starts
  the reply text; `RadioSignalOFF` (4) resets to idle.
- **DrawRadio** (:10695): radio palette, **`RadioCallFlag = 2` (stop incoming call)**,
  `TilesetBank = 1` (second 256-tile bank), draws `RadioTilesMap` (18×9 tiles at 0x3018) and
  `SnakeTilesMap` (4×4 portrait at 0xC828) — both in data/tileblocks.asm — zeroes the radio
  variables, prints TRANSCEIVER/RECV, `DrawRadioFreq`, RenderHUD, radio-noise SFX 0x50.
- **RadioIdle** (:10742): keeps the noise SFX alive while not in SEND; redraws RECV; UP →
  SEND mode (`ReplyRequested = 1`, prints SEND, mute SFX 0x5C, `SetText(10)` "THIS IS SOLID
  SNAKE... YOUR REPLY, PLEASE."); otherwise `ChgRadioFreq` (left/right: BCD ±1 clamped 0-99;
  trigger moves now and clears the auto-reply latch, hold repeats every 2 after an 8 delay)
  then `ChkRadioReceiv`.
- **ChkRadioReceiv** (:10968): `DrawRadioFreq`, then scans `RadioPersonsDat` (filled per room
  by `UpdateRadio`) for an entry matching `RadioFreq`. Auto-reply entries answer immediately
  unless `AutoReplyDone` (latched until the frequency changes); wait-call entries answer only
  if `ReplyRequested`. A match runs `ChkRadioReply` (gates) and on success stores
  `ReplyRadioPerson`, sets state 2 (signal up), `RadioLedDelay = 0x10`.
- **RadioSignalUp** (:10787): every `RadioLedDelay` (first 0x10, then 2) lights the next of
  **12 LEDs** (`DrawRadioLeds`); all on → state 3. **SetupRadioReply** (:10816): state ← 4,
  mute, `SetText(person's text id)`. **RadioSignalOFF** (:10837): clears `ReplyRequested` and
  `RadioLedCnt`, sets `AutoReplyDone = 1`, state ← 1, noise SFX back on, LEDs off.
- **UpdateRadio** (:2379) on room entry: `idxRoomRadio[room]` (data/radiocalls.asm) → up to 4
  `RadioPersonsDat` entries: frequency (via `RadioFreqs` per person id), wait-call/auto-tune
  bits, text id. Auto-tune sets `RadioFreq` to the caller's frequency. Room 0 = Big Boss
  (FREQ 0x85 → "120.85"), auto-reply, text 3; rooms 1/4/5 add wait-call entries (room 1 also
  Schneider — his gate `SchneiderCaptured` is 0 here so he answers; his text tells the player
  to contact waveband 120.79). The radio frequency starts at Big Boss's (Banks0123.asm:11794).
- **Texts** (`SetText` :7808 → GameMode 0xA; `TextBoxLogic`/`TW_*` :7837+): texts are
  **dictionary-compressed** under `idxTexts` (data/texts.asm): first byte = window config,
  then 0 = space, 0x41+ = chars, ≥ 0x80 = dictionary words (e.g. 0xD1 = "THIS", 0x97 =
  apostrophe at half width), 0xFE = newline, 0xFD = page wait, 0xFF = end. `TW_Init` unpacks
  into a buffer; `TW_PrintChar` prints one char per `TickCounter & 7` (mask 3 for the staff
  roll), plays print SFX 0x23 per non-space char, wraps at the window edge, and animates the
  **talking Snake portrait** (`SnakePicture0-2` mouth/eye frames on `TickCounter & 0x1C`)
  while text 10/155 prints. M / RET skip; F4 exits the radio even mid-text (:7842).
- Our current text window is a minimal stub (hardcoded "RESCUED!", approximated geometry) —
  this change replaces its content path with the real engine + data.

## Goals / Non-Goals

**Goals:**
- Open the radio during the room-0 CALL, receive Big Boss's real mission briefing with the
  ROM look (radio UI, LEDs, frequency, portrait) and the ROM text engine.
- Tune/send: wait-call entries (rooms 1/4/5 + Schneider in 1) answer to SEND; tuning away
  and back re-triggers auto-reply, exactly per the latches.
- Real texts.json so prisoner/item texts can later reuse the same engine.

**Non-Goals:**
- Antenna, Schneider-captured, Jennifer, SwitchOffMSX, transmitter-bugged reply gates
  (absent systems — documented inert; the gates' code paths are ported as comments/guards).
- The radio in non-cluster zones, ending texts, the staff roll, Japanese texts.
- Binoculars save/restore of call state across radio use (no binoculars yet).

## Decisions

1. **Texts decoded offline.** `Tools/export-texts.mjs` ports `TW_Init`'s unpacker + the
   dictionary table (located alongside the TW code — identified during implementation) and
   writes `texts.json`: id → `{ cfg, pages: [[line, ...], ...] }` with the dictionary
   expanded and 0xFE/0xFD already structured. Runtime stays a simple player. Rationale: the
   ROM unpacks to a RAM buffer before printing anyway, so offline decoding is the same
   pipeline split at a file boundary; a runtime dictionary port would re-implement the same
   thing with more code in the hot path.
2. **Radio data exported as JSON** (`Tools/export-radiocalls.mjs`): per-room person entries
   (frequency, waitCall, autoTune, textId) from data/radiocalls.asm + `RadioFreqs`, mirroring
   `UpdateRadio`'s flattening so the runtime just reads the room's list. Non-JP file only.
3. **Radio screen graphics from RoomViewer.** New `--export-radio`: render `RadioTilesMap`
   (18×9) and the Snake portrait maps (`SnakeTilesMap`, `SnakePicture0/1/2`) from the second
   tileset bank with the radio palette (`SetRadioPal`) into radio-bg.png + portrait frames;
   export `gfxFreqDigits` (13 red 1bpp digit tiles, loaded by LoadFont) as freq-digits.png;
   the LED on/off tile pairs from their page-1 coordinates (DrawRadioLeds 0x1090/0x890).
   RoomViewer already builds tilesets and palettes for rooms — this reuses that machinery.
4. **Radio key = `R`** (ROM F4 is browser-hostile). R toggles in, F4-semantics on the way
   out: R also exits from inside a printing radio text (TextBoxLogic's F4 check). Documented
   input divergence alongside Q/E.
5. **State machine ported 1:1** on the call-system pacing (ROM iterations = every other
   60Hz tick, same as the incoming call — LED delays 0x10/2, hold-repeat 8/2, print mask 7
   are all TickCounter-domain values).
6a. **Text box look** (post-implementation correction): the box is NOT a plain black fill —
   `DrawTextBoxIn` (logic/textboxappear.asm:58-62) frames it with a `DrawRect` border in
   `TextBoxEff_Col`, white (0x0E) in every `TextBoxEffectDat` row. The port draws the final
   black box + white frame; only the grow-in animation is omitted.
6. **Text window upgrade, not rewrite**: the existing window keeps its render shell; the
   content path becomes texts.json pages with the ROM cadence/wrap/page-wait/skip and the
   print SFX we already exported. The radio variant adds the talking-portrait hook for
   text 10. The rescue "RESCUED!" stub switches to its real text id if one exists, else
   stays a documented stub.

## Risks / Trade-offs

- [The dictionary/unpacker format may have surprises (nested refs, JP-only opcodes)] → the
  exporter asserts round-trip sanity against the inline English comments in texts.asm
  (e.g. text 3's known wording) and the headless suite locks key texts.
- [Radio tile maps use the second tileset bank — palette/bank wiring in RoomViewer may need
  the radio palette specifically] → `SetRadioPal` is data; if the exact palette block is
  ambiguous, export with it cited and verify visually against the original screen.
- [LED tile source coordinates are VRAM page-1 regions, not a named gfx blob] → worst case
  the LEDs are reconstructed as two exported 8x16 tiles from the same page render; cite
  DrawRadioLeds.
- [Engine pacing in menus/text vs radio: the radio runs its OWN GameMode (not paused)] →
  radio state ticks in update() under `gameState === 'radio'`, with the same iteration gate.

## Open Questions

- None blocking. The dictionary table location and the exact `SetRadioPal` block are
  implementation lookups; the radio-noise SFX ("Radio noise" 0x50 / mute 0x5C) is exported
  if the catalog has it, else the noise is omitted with a citation (it's ambience, not
  logic).
