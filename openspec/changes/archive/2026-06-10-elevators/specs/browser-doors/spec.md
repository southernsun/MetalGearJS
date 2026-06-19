# browser-doors delta — elevator doors

## ADDED Requirements

### Requirement: Elevator doors are exported and enterable

The doors export SHALL include the elevator doors (render types 5/6, destinations ≥ 0xF0,
lock 1) it previously filtered — room 3's north door (id 2, type 5, dest 240,
data/doors.asm:308) in the cluster — with the type-5 door graphic decoded like the other
types. Opening/entering a lock-1 door SHALL follow `ChkOpenDoor`'s elevator branch as found
in the disassembly. A door whose destination is ≥ 0xF0 SHALL hand entry to the elevator
system (`SetElevatorPosY` placement — see browser-elevators) instead of the
`PlayerInDoorDat` placement; entering a floor room FROM an elevator SHALL use the existing
`SetPlayerInDoor` path through the now-exported door.

#### Scenario: The elevator door appears and works in room 3

- **WHEN** Snake reaches the top of room 3 and enters its elevator door
- **THEN** the door renders like other doors, and entry lands in elevator room 240 at the
  bottom floor (not at a PlayerInDoorDat offset)

#### Scenario: Returning from the elevator

- **WHEN** Snake exits the elevator room at the bottom floor
- **THEN** he enters room 3 through that same door, placed by the type-5 PlayerInDoorDat
  entry as with any door
