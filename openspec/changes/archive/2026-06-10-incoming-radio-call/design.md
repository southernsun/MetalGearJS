# Design — incoming radio call (CALL notification)

## Context

ROM behaviour, verified in the disassembly:

- **Arming (room entry)** — `SetAreaMusic6`/`ChkRadioCalls` (Banks0123.asm:1608-1744): when a
  room is entered, a playing ring SFX (0x22) is stopped first (:1609-1612). The room's config
  byte `RoomsMusic[Room]` (data/musicradioconfig.asm; high nibble = area music) is read; **bit 3
  = incoming call in this room**. Default is `RadioCallFlag = 2` (stopped). If the bit is set
  (and the gates pass), `IncomingCallTimer = 32` (`and 8` then `add a,a` twice) and
  `RadioCallFlag = 0` (pending). Room 0's byte is 8 → the start room rings.
  Gates: Schneider's frequency never calls once he's captured; Jennifer (rank < 4 stars or her
  brother dead) doesn't call; `MapZone >= 5` needs the antenna. None of those systems exist in
  this slice — for our exported rooms every gate passes.
- **Life cycle** — `ChkIncomingCall` (logic/incomingcall.asm), called every frame from
  `PlayModeLogic` (Banks0123.asm:12162) *before* the dead-mode check: timer 0 → idle;
  flag 2 → done; flag 1 → decrement, at 0 set flag 2 (call expired); flag 0 (pending) →
  decrement, at 0 set timer = 0x58 and flag = 1 **and fall through** to the flag-1 decrement
  (so the ring phase is effectively 0x57 ticks — port the fall-through, not a cleaned-up
  version). Menus and the text window never reach `PlayModeLogic`, so the cycle pauses there.
- **Presentation** — `DrawCallTimer` (logic/hud.asm:25-55), part of `RenderHUD`: nothing
  unless flag == 1; erased while GameMode is 2/3 (menus); blinks with `TickCounter` **bit 3**
  (visible when clear — 8 ticks on, 8 off); at the start of each visible phase
  (`TickCounter & 7 == 0` inside the bit-3-clear half, i.e. tick ≡ 0 mod 16) SFX 0x22 is
  (re)triggered. The sign is `txtCALL` (data/hudstartendtexts.asm:74): tiles 0x9C-0x9E at
  XY 0x78,0xC1 and 0x9F-0xA1 at 0x78,0xC9 — two 3-tile rows (24×16 px) at x=120, y=193/201,
  inside the HUD strip (our HUD also starts at y=192). The destruction-timer branch displaces
  the sign; that system is out of scope.

Our port: `setRoom` is the room-entry point; `update()` is the frame tick (menus/text return
early — matching where `PlayModeLogic` doesn't run); `renderHud()` draws the HUD each frame
and is also called by `drawMenu`. font.png currently exports glyphs 0x30-0x9B (count 108) —
the CALL tiles 0x9C-0xA1 are the next 6 glyphs in the same text-tile graphics.

## Goals / Non-Goals

**Goals:**
- Entering room 0 arms a call exactly like the ROM: 32 pending ticks, then a ringing CALL
  sign blinking 8-on/8-off with the real ring SFX, expiring after the ROM's duration.
- Re-entering the room re-arms; entering any room cuts a playing ring SFX.
- The cycle pauses in menus (and the sign/ring are suppressed there).

**Non-Goals:**
- Answering the call: the radio screen (GameMode 4), frequencies, `RadioPersonsDat`, call
  texts, auto-tune/auto-reply — the radio/text slices.
- The destruction-timer display that shares the CALL HUD slot.
- The Schneider/Jennifer/antenna gates (systems don't exist; documented inert).

## Decisions

### 1. Per-room call bit: tiny data export, like items.json

`Tools/export-radio.mjs` parses `RoomsMusic` from data/musicradioconfig.asm (taking the ELSE
branch of the `IF (JAPANESE)` block) and writes `web/assets/radio.json` —
`{ "callRooms": [<rooms with bit 3 set>] }`. Precedent: `Tools/export-items.mjs` (no dotnet
needed). Rationale over an inlined constant: the table is 256 entries with a conditional
block; parsing the source keeps the ROM data authoritative and covers future rooms for free.

### 2. State machine ported verbatim into game.js

`radioCallFlag` (0 pending / 1 ringing / 2 stopped) + `incomingCallTimer`. In `setRoom`:
stop the ring SFX, set flag 2, and if `callRooms` has the room set timer 32 / flag 0 (with a
comment noting the ROM gates that don't apply yet). In `update()`, `chkIncomingCall()` runs
after the menu/text early-returns and **before** the dead branch (mirroring `PlayModeLogic`
calling it before the dead-mode dispatch), ported with the ROM's fall-through (ring lasts
0x58−1 ticks). Death-restart re-enters the start room through `setRoom`, which re-arms —
the same thing the ROM's continue flow does.

### 3. Ring SFX retriggers from the tick, not the render

`DrawCallTimer` triggers SFX 0x22 when `TickCounter ≡ 0 (mod 16)` during the ringing flag —
a pure function of the tick counter. Our render loop can run fewer draws than update ticks,
so the trigger lives in `chkIncomingCall()` (`flag === 1 && (tickCounter & 15) === 0`) —
same timing, no missed beats; and because menus/text pause the tick, the ring pauses there
exactly like the ROM (whose menu modes never call `DrawCallTimer`'s SFX path). The ring uses
a **tracked** audio source (`playCallRing`/`stopCallRing`) instead of fire-and-forget
`playBuf`, because `SetAreaMusic6` must cut it on room entry and each retrigger replaces the
previous ring.

### 4. CALL sign drawn from the extended font sheet

Extend the RoomViewer font export count 108 → 114 so font.png/font.json cover glyphs
0x9C-0xA1 (they're the next tiles in the same text graphics `txtCALL` prints through).
`drawCallSign()` in `renderHud()` blits chars 0x9C-0x9E at (120,193) and 0x9F-0xA1 at
(120,201) — the ROM's exact XY, which lands in our HUD strip (y ≥ 192) — when
`radioCallFlag === 1 && gameState !== 'menu' && (tickCounter & 8) === 0`. The menu check
ports `DrawCallTimer`'s GameMode 2/3 erase (our `drawMenu` calls `renderHud` too). No
destruction-timer branch (out of scope).

### 5. New headless suite: radio.headless.mjs

Same vm-sandbox pattern as the other suites, driving the real game.js: arming on
`setRoom(0)` (timer 32, flag 0) and not on a non-call room; pending → ringing after 32
ticks; ringing → stopped after 0x58−1 more; re-entry re-arms; ring SFX retrigger cadence
(every 16 ticks, via a `playBuf`/ring-source intercept) and stop-on-room-change; blink
phase + menu suppression via the recorded canvas calls.

## Risks / Trade-offs

- [The 6 new font tiles might not directly follow the current 108 in the exporter's source
  data] → verify in the RoomViewer export code against the gfx bank before extending; if the
  CALL tiles live elsewhere, export them as a separate tiny sheet instead (the draw call is
  isolated in `drawCallSign`).
- [SFX trigger moved from render to tick] → timing is identical by construction
  (`TickCounter` math is the same); noted in a comment as a same-timing port.
- [`starX` and other font.json fields] → the export change must keep existing consumers
  (drawText, the arrow glyph, star icons) byte-identical for glyphs 0x30-0x9B; the headless
  suites cover those draws.
- [Call ticks while dying] → faithful (`PlayModeLogic` calls `ChkIncomingCall` before the
  dead check); the sign also draws during the death animation as in the ROM.

## Open Questions

- None blocking. Whether the ring SFX WAV contains one ring or a sustained loop is settled
  by the export itself — the 16-tick retrigger reproduces the ROM cadence either way.
