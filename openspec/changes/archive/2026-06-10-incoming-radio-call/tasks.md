## 1. Asset exports (ROM data → web/assets)

- [x] 1.1 `Tools/export-radio.mjs`: parse `RoomsMusic` from data/musicradioconfig.asm
      (non-Japanese ELSE branch of the IF block) → `web/assets/radio.json`
      `{ "callRooms": [...] }`; verify room 0 is in the list
      — DONE: 251 room bytes parsed; call rooms [0, 29, 37, 53, 69, 99, 104, 108, 111,
      115, 116, 119, 125, 165, 178, 192, 193]
- [x] 1.2 Export the ring SFX: `dotnet run --project Tools/ThemeOfTaraPlayer -- --export-sfx
      "Incoming radio call" web/assets/call.wav` (catalog entry for SFX 0x22)
- [x] 1.3 Extend the RoomViewer font export from 108 to 114 glyphs so font.png/font.json
      cover the CALL tiles 0x9C-0xA1 (`txtCALL` prints them via the text tile gfx);
      re-export and verify glyphs 0x30-0x9B are unchanged (existing suites still pass) and
      the 6 new tiles render the CALL sign — if the tiles do NOT follow the font block in
      the gfx source, export them as a separate small sheet instead
      — DONE via the fallback: the CALL sign is NOT font data — LoadFont decodes a dedicated
      `gfxCALL` blob (six 2bpp tiles, colorsCALL {6,8,0xE,0xF}) into tiles 0xAC-0xB1; added
      `ExportCallSign` to RoomViewer → `web/assets/call-sign.png` (24x16, red-on-white CALL,
      visually verified); font.png untouched

## 2. Call state machine (ChkRadioCalls + ChkIncomingCall)

- [x] 2.1 Load radio.json; add `radioCallFlag` / `incomingCallTimer` state; in `setRoom`:
      stop the ring SFX (SetAreaMusic6 Banks0123.asm:1609-1612), default flag 2, and arm
      timer=32 / flag=0 for call rooms (cite ChkRadioCalls Banks0123.asm:1689 + the inert
      Schneider/Jennifer/antenna gates in a comment)
- [x] 2.2 Port `chkIncomingCall()` verbatim from logic/incomingcall.asm — including the
      start-of-ring fall-through (timer=0x58 then the same-tick decrement) — and call it
      from `update()` after the menu/text early-returns and before the dead branch
      (PlayModeLogic order, Banks0123.asm:12162)
- [x] 2.3 Ring SFX as a tracked source: `playCallRing()` (stops the previous ring, starts
      call.wav) + `stopCallRing()`; retrigger from the tick at `flag===1 &&
      (tickCounter & 15) === 0` with a comment noting this is DrawCallTimer's TickCounter
      timing moved off the render path

## 3. CALL sign in the HUD (DrawCallTimer)

- [x] 3.1 `drawCallSign()` in `renderHud()`: when `radioCallFlag === 1 && gameState !==
      'menu' && (tickCounter & 8) === 0`, draw call-sign.png (the decoded txtCALL tiles,
      data/hudstartendtexts.asm:74) at (120,193) — 24x16 covering both rows (193/201);
      menu suppression = the ROM's GameMode 2/3 erase

## 4. Headless checks + docs

- [x] 4.1 New `web/radio.headless.mjs` (vm-sandbox pattern): arming on setRoom(0) and not
      on a non-call room; re-entry re-arms; 32 pending ticks → ringing; ringing stops after
      0x58−1 ticks; menu state pauses the timers; ring retrigger every 16 ticks replacing
      the previous source; room change stops the ring; CALL sign drawn only in the bit-3
      clear phase and never while a menu is open
- [x] 4.2 Run all headless suites + `node Tools/check-graph.mjs`; update the suite list /
      check count, controls/notes in docs/SESSION-STATE.md (incoming call shipped; radio
      screen still a gap), and regenerate docs/rom-coverage.md
      (`node Tools/coverage/coverage.mjs`)
