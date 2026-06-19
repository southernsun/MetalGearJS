# browser-radio-call — the incoming-call notification

## ADDED Requirements

### Requirement: Entering a call room arms an incoming call

On room entry the game SHALL reset the incoming-call state to stopped (`RadioCallFlag = 2`) and,
when the room's ROM config byte has the incoming-call bit (bit 3 of `RoomsMusic[room]`,
data/musicradioconfig.asm — room 0 = 8), SHALL arm a pending call exactly like `ChkRadioCalls`
(Banks0123.asm:1689): `IncomingCallTimer = 32`, `RadioCallFlag = 0`. The per-room bit SHALL come
from the ROM data (exported, non-Japanese branch), not a hand-picked list. The ROM's caller
gates (Schneider captured, Jennifer's rank/brother, antenna beyond MapZone 4) reference systems
outside this slice and SHALL be documented as inert rather than invented.

#### Scenario: Room 0 arms a call

- **WHEN** Snake enters room 0 (including the initial spawn and a death-restart)
- **THEN** the call state becomes pending with a 32-tick countdown

#### Scenario: Non-call rooms do not arm

- **WHEN** Snake enters a room whose config byte lacks bit 3
- **THEN** no call is armed and any previous call state is reset to stopped

#### Scenario: Re-entry re-arms

- **WHEN** Snake leaves room 0 and comes back
- **THEN** a fresh pending call is armed again

### Requirement: The call life cycle follows ChkIncomingCall

Each play tick the game SHALL run the ported `ChkIncomingCall` (logic/incomingcall.asm):
idle when the timer is 0 or the flag is 2; a **pending** call (flag 0) counts its timer down
and on reaching 0 starts ringing — timer set to 0x58, flag set to 1, **falling through into
the same tick's ringing decrement** (the ROM quirk: the ring phase lasts 0x57 ticks); a
**ringing** call (flag 1) counts down and on reaching 0 stops (flag 2). The tick SHALL run
where the ROM runs it — in the play-mode frame before the dead-mode dispatch
(`PlayModeLogic`, Banks0123.asm:12162) — so it pauses while a menu or the text window is
open and keeps ticking while Snake is dying.

#### Scenario: Pending becomes ringing after 32 ticks

- **WHEN** a pending call's 32-tick countdown elapses
- **THEN** the call starts ringing for the ROM's duration (0x58 set, 0x57 effective ticks)

#### Scenario: Unanswered call expires

- **WHEN** the ringing countdown elapses
- **THEN** the call stops (flag 2), the CALL sign disappears, and the ring SFX is not
  retriggered

#### Scenario: Menus pause the cycle

- **WHEN** a weapon/equipment menu (or the text window) is open
- **THEN** the call timers do not advance and resume where they left off on close

### Requirement: Ringing shows the blinking CALL sign with the ring SFX

While a call is ringing the HUD SHALL show the ROM's CALL sign — tiles 0x9C-0x9E at
(120,193) and 0x9F-0xA1 at (120,201), `txtCALL` data/hudstartendtexts.asm:74 — blinking
with `TickCounter` bit 3 (visible the 8 ticks the bit is clear, hidden the 8 it is set), per
`DrawCallTimer` (logic/hud.asm:25). At the start of each visible phase (tick ≡ 0 mod 16) the
decoded ring SFX 0x22 ("Incoming radio call") SHALL be (re)triggered, replacing the previous
ring. The sign SHALL NOT draw while a menu is open (the ROM erases it in GameMode 2/3). The
sign tiles SHALL be the decoded ROM glyphs (font sheet extended to cover 0x9C-0xA1), not a
hand-drawn stand-in.

#### Scenario: Blink cadence

- **WHEN** a call is ringing during play
- **THEN** the CALL sign is drawn on ticks with bit 3 clear and absent on ticks with bit 3
  set

#### Scenario: Ring SFX cadence and replacement

- **WHEN** the ringing call crosses a tick ≡ 0 (mod 16)
- **THEN** the ring SFX starts, cutting off a still-playing previous ring

#### Scenario: Suppressed in menus

- **WHEN** a menu is open during a ringing call
- **THEN** the CALL sign is not drawn over the menu and no ring SFX fires

### Requirement: Room changes cut the ring SFX

Entering any room SHALL stop a currently playing ring SFX (`SetAreaMusic6`,
Banks0123.asm:1609-1612) before the new room's call state is armed.

#### Scenario: Leaving mid-ring silences the ring

- **WHEN** Snake changes rooms while the ring SFX is playing
- **THEN** the SFX stops immediately (and a new call only begins if the new room arms one)
