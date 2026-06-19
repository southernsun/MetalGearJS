# browser-radio — the transceiver screen

## ADDED Requirements

### Requirement: The radio opens to the ROM transceiver screen

A key SHALL toggle the radio (the ROM's F4 → GameMode 4; the browser binding is a documented
divergence). Opening it SHALL reproduce `DrawRadio` (Banks0123.asm:10695): the radio UI
rendered from the ROM tile maps (`RadioTilesMap` + the Snake portrait `SnakeTilesMap`,
data/tileblocks.asm, second tileset bank, radio palette), the TRANSCEIVER title and RECV
label, the current frequency shown as "120." + the BCD byte via the red digit tiles
(`gfxFreqDigits`), the HUD kept on screen, the radio-noise ambience (if exported), and —
critically — the **incoming call stopped** (`RadioCallFlag = 2`). Closing the radio SHALL
return to play, including from inside a printing radio text (`TextBoxLogic`,
Banks0123.asm:7842).

#### Scenario: Open and close

- **WHEN** the player presses the radio key during play and again to exit
- **THEN** the transceiver screen appears with frequency and RECV shown, play pauses, and
  closing resumes play

#### Scenario: Opening stops the ringing call

- **WHEN** the CALL sign is ringing and the player opens the radio
- **THEN** the ring SFX and CALL state stop (flag 2)

### Requirement: Frequency tuning follows ChgRadioFreq

Left/right SHALL change the BCD frequency by ±1 (display "120.00"-"120.99", clamped at the
ends, `ChgRadioFreq` Banks0123.asm:10906): a trigger steps immediately and clears the
auto-reply latch; a held direction repeats after the 8-iteration delay and then every 2.
UP SHALL enter SEND mode (`SetRadioSend`): RECV → SEND, `ReplyRequested` set, ambience
muted, and text 10 ("THIS IS SOLID SNAKE... YOUR REPLY, PLEASE.") printed with the
talking-Snake portrait animating while it prints.

#### Scenario: Tuning

- **WHEN** the player taps right at 120.85
- **THEN** the display shows 120.86 and a held left walks back down with the ROM repeat
  delays, stopping at 120.00

#### Scenario: Send

- **WHEN** the player presses UP in the radio
- **THEN** SEND replaces RECV and Snake's call-out text prints with the portrait talking

### Requirement: Replies follow ChkRadioReceiv per room

The room's radio entries (exported from `idxRoomRadio`, data/radiocalls.asm, flattened the
way `UpdateRadio` does, with per-person frequencies from `RadioFreqs`) SHALL drive replies
(`ChkRadioReceiv`, Banks0123.asm:10968): an **auto-reply** person answers as soon as their
frequency is selected, once, latched (`AutoReplyDone`) until the frequency changes; a
**wait-call** person answers only after SEND (`ReplyRequested`). A reply lights the 12 radio
LEDs one by one (`RadioSignalUp`, first delay 0x10 then 2 per LED), then prints the person's
text, then resets to idle with the LEDs off (`RadioSignalOFF`). The frequency SHALL start at
Big Boss's 120.85 at game start (Banks0123.asm:11794), and an auto-tune entry sets it on
room entry. Reply gates whose systems don't exist in this slice (antenna, Schneider
captured, Jennifer, SwitchOffMSX, transmitter-bugged) SHALL stay documented-inert, not
invented.

#### Scenario: Answering the room-0 call

- **WHEN** the player opens the radio in room 0 (frequency already 120.85)
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
