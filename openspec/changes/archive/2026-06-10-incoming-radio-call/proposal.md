# Incoming radio call (room 0 CALL notification)

## Why

In the original game, entering room 0 (the start room) triggers an incoming radio call: a
"CALL" sign blinks in the HUD with a ring SFX until the call expires. Our port has none of
this — the user wants it replicated. The behaviour is fully specified by the disassembly:
`RoomsMusic[0] = 8` (data/musicradioconfig.asm:15, bit 3 = incoming call in this room),
`ChkRadioCalls` (Banks0123.asm:1689) arms the call on room entry, `ChkIncomingCall`
(logic/incomingcall.asm) runs the pending→ringing→stopped life cycle, and `DrawCallTimer`
(logic/hud.asm:25) blinks the CALL sign and retriggers SFX 0x22.

## What Changes

- **Per-room call data from the ROM**: the incoming-call bit (bit 3 of the `RoomsMusic` byte,
  data/musicradioconfig.asm, non-Japanese branch) is exported/ported so room 0 — and any other
  exported room with the bit — arms a call on entry.
- **Call life cycle** (`ChkRadioCalls` + `ChkIncomingCall`): on room entry the call state
  resets (flag 2 = stopped by default); a call room sets `IncomingCallTimer = 32` and flag 0
  (pending). Each play tick: pending counts down 32 ticks, then the call starts (flag 1,
  timer 0x58 = 88 ticks); ringing counts down, then stops (flag 2). The ROM's gates
  (Schneider captured, Jennifer's rank/brother, antenna for MapZone ≥ 5) reference systems
  that don't exist in this slice and are documented as inert.
- **CALL sign + ring SFX** (`DrawCallTimer`): while ringing, the 6-tile CALL sign
  (tiles 0x9C-0xA1, two 3-tile rows at HUD x=0x78, y=0xC1/0xC9) blinks with `TickCounter`
  bit 3 (8 ticks on / 8 off) and SFX 0x22 fires at the start of each visible phase; the sign
  and ring are suppressed while a menu is open (GameMode 2/3 in the ROM). Entering a new
  room stops a playing ring SFX (`SetAreaMusic6`, Banks0123.asm:1609).
- **New exports**: the font sheet extended by 6 tiles to cover the CALL sign glyphs
  (font.png currently ends at 0x9B), and `call.wav` from the "Incoming radio call" catalog
  entry (SFX 0x22).
- **Out of scope**: answering the call — the radio screen (GameMode 4), frequencies,
  `RadioPersonsDat`, and call texts belong to the radio/text-system slices. The call rings
  and expires unanswered, exactly as the ROM behaves when the player never opens the radio.

## Capabilities

### New Capabilities

- `browser-radio-call`: the incoming-call notification — per-room arming from the ROM config
  byte, the pending/ringing/stopped life cycle, the blinking HUD CALL sign, and the ring SFX
  with its room-change stop rule.

### Modified Capabilities

(none — the CALL sign is a new HUD concern owned by the new capability; existing
browser-player-hud requirements are unchanged)

## Impact

- `web/game.js`: call state machine in the play tick, arming on `setRoom`, CALL sign drawing
  in the HUD render, stoppable ring SFX.
- `Tools/RoomViewer` font export (6 more tiles) → `web/assets/font.png`/`font.json`.
- `Tools/ThemeOfTaraPlayer --export-sfx "Incoming radio call"` → `web/assets/call.wav`.
- Per-room call-bit data (small export from data/musicradioconfig.asm or an inlined cited
  table) → consumed by `setRoom`.
- `web/hud.headless.mjs` (or a new `radio.headless.mjs`): life-cycle timing, blink phase,
  SFX retrigger/stop, menu suppression checks.
- `docs/SESSION-STATE.md`, `docs/rom-coverage.md` regenerated.
