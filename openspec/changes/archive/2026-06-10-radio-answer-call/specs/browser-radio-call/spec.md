# browser-radio-call delta — answering the call

## ADDED Requirements

### Requirement: The incoming call can be answered through the radio

Opening the radio SHALL stop the incoming call and its ring (`DrawRadio` sets
`RadioCallFlag = 2`, Banks0123.asm:10701), and the armed caller SHALL be reachable on the
transceiver per the room's radio data — in room 0 the frequency already sits on Big Boss, so
opening the radio during (or after) the CALL delivers the mission briefing via auto-reply.

#### Scenario: Answer during the ring

- **WHEN** the CALL sign is blinking and the player opens the radio
- **THEN** the ring stops and Big Boss's briefing arrives without retuning

#### Scenario: Missed call is still answerable

- **WHEN** the call expired unanswered and the player opens the radio in the same room
- **THEN** the caller still auto-replies on their frequency (the room's radio data, not the
  CALL state, gates the reply)
