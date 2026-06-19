# browser-radio Specification

## Purpose
The transceiver screen (RadioLogic, GameMode 4): open/close, the ROM UI render, frequency
tuning, RECV/SEND, auto-reply and wait-call replies per room, the 12-LED signal animation,
reply texts through browser-text-system, the talking-Snake portrait, and the radio SFX.
## Requirements
### Requirement: The radio opens to the ROM transceiver screen

A key SHALL toggle the radio (the ROM's F4 → GameMode 4; bound to R — a documented browser
divergence). Opening it SHALL reproduce `DrawRadio` (Banks0123.asm:10695): the radio UI
rendered from the ROM tile maps (`RadioTilesMap` at (48,24) + the Snake portrait
`SnakeTilesMap` at (200,40), data/tileblocks.asm, second tile bank, `RadioPalette`), the
TRANSCEIVER title, RECV label and static red "120." (txtTransceiv, data/menuradiotexts.asm),
the live frequency as two stacked-glyph red digits (`DrawRadioFreq` at (152,33),
`RedDigitTiles`/`gfxFreqDigits`), the HUD kept on screen, the looping radio-noise ambience
(SFX 0x50), the radio variables reset, and — critically — the **incoming call stopped**
(`RadioCallFlag = 2`). Closing the radio SHALL return to play, including from inside a
printing radio text (`TextBoxLogic`, Banks0123.asm:7842).

#### Scenario: Open and close

- **WHEN** the player presses the radio key during play and again to exit
- **THEN** the transceiver screen appears with frequency and RECV shown, play pauses, and
  closing resumes play and stops the ambience

#### Scenario: Opening stops the ringing call

- **WHEN** the CALL sign is ringing and the player opens the radio
- **THEN** the ring SFX and CALL state stop (flag 2)

### Requirement: Frequency tuning follows ChgRadioFreq

Left/right SHALL change the BCD frequency by ±1 (display "120.00"-"120.99", clamped at the
ends, `ChgRadioFreq` Banks0123.asm:10906): a trigger steps immediately and clears the
auto-reply latch (the hold path does not); a held direction repeats after the 8-iteration
delay and then every 2. UP SHALL enter SEND mode (`SetRadioSend`): RECV → SEND,
`ReplyRequested` set, ambience muted, and text 10 ("THIS IS SOLID SNAKE... YOUR REPLY,
PLEASE.") printed with the talking-Snake portrait animating (`DrawSnakeFrame`:
`SnakePicture0-2` on iteration & 0x1C) while it prints.

#### Scenario: Tuning

- **WHEN** the player taps right at 120.85
- **THEN** the display shows 120.86 and a held left walks back down with the ROM repeat
  delays, stopping at 120.00

#### Scenario: Send

- **WHEN** the player presses UP in the radio
- **THEN** SEND replaces RECV and Snake's call-out text prints with the portrait talking

### Requirement: Replies follow ChkRadioReceiv per room

The room's radio entries SHALL drive replies (exported from `idxRoomRadio`, data/radiocalls.asm, flattened the way
`UpdateRadio` does, with per-person frequencies from `RadioFreqs`; record semantics per the
CODE — byte bit 2 = wait-call, bit 3 = auto-tune) SHALL drive replies (`ChkRadioReceiv`,
Banks0123.asm:10968): an **auto-reply** person answers as soon as their frequency is selected,
once, latched (`AutoReplyDone`) until the frequency is retuned; a **wait-call** person answers
only after SEND (`ReplyRequested`). A reply lights the 12 radio LEDs column by column
(`RadioSignalUp`, first delay 0x10 then 2 per LED; all 12 stay lit through the message), then
prints the person's text, then resets to idle with the LEDs off (`RadioSignalOFF`). The
frequency SHALL start at Big Boss's 120.85 at game start (Banks0123.asm:11794), and an
auto-tune entry sets it on room entry. Reply gates whose systems don't exist in this slice
(antenna, Schneider captured, Jennifer, SwitchOffMSX, transmitter-bugged) SHALL stay
documented-inert, not invented.

#### Scenario: Answering the room-0 call

- **WHEN** the player opens the radio in room 0 (frequency already 120.85 — room 0 auto-tunes)
- **THEN** the LEDs light up one by one and Big Boss's mission briefing (text 3) prints,
  then the radio returns to idle with LEDs off

#### Scenario: Auto-reply doesn't loop

- **WHEN** the briefing finishes and the radio sits idle on 120.85
- **THEN** no new reply starts until the player tunes away and back

#### Scenario: Wait-call answers SEND

- **WHEN** the player is in a wait-call room (e.g. room 4) on the caller's frequency and
  presses UP
- **THEN** after Snake's call-out, the caller's reply arrives (LEDs, then the text)

#### Scenario: Wrong frequency stays silent

- **WHEN** the radio idles on a frequency with no entry in the room
- **THEN** nothing answers, in RECV or SEND
