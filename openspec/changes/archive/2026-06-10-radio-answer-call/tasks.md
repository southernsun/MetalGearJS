## 1. Text system export + engine (browser-text-system)

- [x] 1.1 Locate the text-window unpacker and its dictionary table in the disassembly
      (TW_Init path, Banks0123.asm:7837+; the dictionary the ≥0x80 bytes index) and document
      the byte format (window-config first byte, 0x00 space, 0x97 apostrophe, 0xFE newline,
      0xFD page wait, 0xFF end)
      — DONE: tokens are ≥0xA1 (DecodeText :5305 → AddDictEntry :5352 → idxDictionary,
      data/texts.asm:573, 0xFF-terminated verbatim entries); print mask is 3 for normal
      texts (7 is the STAFF roll — the proposal had it backwards); line height +12; skip
      jumps to the NEXT page; enter icon = char 0x3F at PromptXY when cfg high nibble set;
      text 10 auto-advances after 0x60 iterations; window geometry =
      TextBoxXYSize/TextXYSize/TextBoxEffectDat (:8365-8387). docs/rom-data-formats.md updated.
- [x] 1.2 `Tools/export-texts.mjs`: decode `idxTexts` (data/texts.asm) → `web/assets/texts.json`
      (id → { cfg, pages: [[lines]] }); sanity-assert text 3 and text 10 against the
      disassembly's inline comments — 90 texts, 92 dictionary entries; strings hold RAW ROM
      char codes (lossless; font.png is indexed by them)
- [x] 1.3 Replace the text window's content path in web/game.js: play texts.json pages with
      the ROM cadence, print SFX 0x23 per non-space char, 8px advance (4px apostrophe),
      wrap at the window edge, page waits + enter icon, skip-to-next-page, per-type ROM
      window geometry; rank.headless.mjs updated (25/25)
- [x] 1.4 Point the prisoner "RESCUED!" stub at its real text id — DONE: setText(131)
      (txt id 131 decodes to exactly "RESCUED", cfg 0)

## 2. Radio data + graphics exports

- [x] 2.1 `Tools/export-radiocalls.mjs`: flatten `idxRoomRadio` (data/radiocalls.asm,
      non-JP) + `RadioFreqs` the way UpdateRadio does → `web/assets/radiocalls.json`
      (room → [{freq, waitCall, autoTune, textId}]); verify room 0 = Big Boss 0x85
      auto-reply text 3 and rooms 1/4/5 entries
      — DONE: 60 rooms. NOTE the bit semantics come from the CODE, not the file header:
      byte bit 2 = WAIT-CALL (RADIO_WAITCALL=4), bit 3 = AUTO-TUNE (the misleadingly named
      RADIO_AUTOREPLY=8) — room 0 auto-tunes AND auto-replies
- [x] 2.2 RoomViewer `--export-radio`: render `RadioTilesMap` (18×9) → radio-bg.png;
      `SnakeTilesMap` + `SnakePicture0/1/2` → portrait frames; `gfxFreqDigits` →
      freq-digits.png; LED tiles — DONE, verified visually (the MG1 transceiver).
      Findings: bank-2 ids = 0x40 blank, 0x41-0x5F gfxRadio (24 tiles + overrun into
      gfxRadio2 — the ROM loads 31 from the gfxRadio label), 0x60-0x66 gfxRadio2 mirrored;
      LED ON/OFF = gfxRadio tiles 1/0 (ids 0x42/0x41); the red digit strip is chars
      0xA3 ('.') - 0xAF (RedDigitTiles pairs); the "120." prefix is txtTransceiv data;
      data/tileblocks.asm added to GameData's parse list
- [x] 2.3 Export the radio-noise ambience — DONE: "Radio noise" catalog entry →
      web/assets/radio-noise.wav (2.0s, looped at runtime; muted for texts per SFX 0x5C)

## 3. Radio mode in game.js (RadioLogic)

- [x] 3.1 `gameState 'radio'`: R toggles in/out (documented F4 divergence; R also exits from
      inside a printing radio text per TextBoxLogic Banks0123.asm:7842); opening runs the
      DrawRadio port — stop the CALL ring (flag 2), reset radio vars, ambience on
- [x] 3.2 Port the state machine on the ROM-iteration pacing: idle (tune left/right BCD ±1
      clamp 0-99, trigger clears `AutoReplyDone`, hold-repeat 8 then 2; UP → SEND +
      `ReplyRequested` + text 10), `ChkRadioReceiv` (auto-reply vs wait-call, latches),
      signal-up (12 LEDs, delay 0x10 then 2), reply text, signal-off (latch
      `AutoReplyDone`, LEDs off, idle)
- [x] 3.3 Game-start/room-entry wiring: `RadioFreq` init to Big Boss 0x85
      (Banks0123.asm:11794); per-room entries loaded from radiocalls.json on setRoom
      (UpdateRadio), auto-tune applying the frequency
- [x] 3.4 Radio render: radio-bg (48,24) + portrait (200,40) + "120."+BCD freq digits
      (txtTransceiv/DrawRadioFreq positions) + TRANSCEIVER/RECV/SEND + 12 LED cells at
      (64,32) + HUD + the text window over it; talking portrait (SnakePicture frames on
      iter & 0x1C) at (208,48) while texts 10/155 print
- [x] 3.5 Update web/index.html key help (R = radio, ←/→ tune, ↑ send)

## 4. Headless checks + docs

- [x] 4.1 Text engine suite (`web/text.headless.mjs`, 16 checks): decode sanity (texts 3/10
      wording + paging vs the disassembly comments), cadence, SFX per char (spaces silent),
      wrap (+12px rows), page wait + enter icon at PromptXY, skip, text-10 auto-advance,
      type-3 window geometry
- [x] 4.2 Radio suite extended (39 checks): open stops the ring; room-0 auto-tune +
      auto-reply → 12 LEDs (0x10 then 2) → briefing text 3 → signal-off with the latch;
      retune clears it and re-rings; clamps at 120.00/120.99; hold-repeat 8 then 2;
      wrong frequency silent; wait-call (room 4) answers only after SEND (text 10 +
      ReplyRequested); close stops the noise
- [x] 4.3 Run all suites + check-graph — 229/229 across 10 suites; SESSION-STATE updated
      (controls, exporters, shipped, divergences, gaps), rom-coverage regenerated
