# browser-guard-alarm delta — the transmitter bug

## ADDED Requirements

### Requirement: The transmitter prevents the alarm from ending

While `TransmiTaken` is set, `ChkAlarmEnd` SHALL return without ending the alarm
(Banks0123.asm:6636-6638), and entering a room outside the no-alert list SHALL re-raise the
alert (`SetAreaMusic4`, Banks0123.asm:1590-1595). Consuming the transmitter from the
equipment menu clears the flag and restores normal alarm behaviour.

#### Scenario: The alarm won't die

- **WHEN** the alarm is up and Snake carries the transmitter out of the alert room
- **THEN** the alarm continues in the next room instead of ending

#### Scenario: Dropping the bug

- **WHEN** Snake uses the transmitter in the equipment menu
- **THEN** it is consumed, and the alarm can end again by the normal rules
