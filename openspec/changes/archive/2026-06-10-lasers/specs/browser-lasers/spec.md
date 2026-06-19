# browser-lasers — the infrared corridors and the cameras

## ADDED Requirements

### Requirement: Laser beams spawn from the ROM tables, never during an alert

Entering a laser room (24/25/72 — `LasersRoom*`, data/laserconfig.asm) SHALL spawn its
beams with the table's ON/OFF status, position, length and axis (`InitLaserRoom`,
Banks0123.asm:5653). While AlertMode is on, NO beams spawn (:5654-5656); beams removed by a
trip SHALL return on a later non-alert entry.

#### Scenario: A quiet entry

- **WHEN** Snake walks into room 24 with no alert running
- **THEN** its six beams are live

#### Scenario: An alerted entry

- **WHEN** Snake enters room 24 mid-alert
- **THEN** the corridor has no beams at all

### Requirement: Beams are invisible without the goggles

Beams SHALL render ONLY while the GOGGLES (equipment 4, `SELECTED_GOGGLES`) are the
selected item and no alert is on (`DrawLaserBeams`, logic/drawlaserbeams.asm:8-14) — as
thin red lines on the beam geometry (axis 0: a column at X spanning Y+8..Y+8+len; axis 1:
a row at Y spanning X..X+len — `ChkTouchLaser`'s math, the asm comments being swapped).
OFF beams draw nothing. The ROM's dotted beam-tile art is approximated by the line
(documented divergence). The goggles are placed as a DEMO item in room 2 (their real room
isn't exported) and a `?goggles` dev hook grants + selects them.

#### Scenario: Blind without them

- **WHEN** Snake stands in room 24 with no goggles selected
- **THEN** nothing shows — the beams are still armed

#### Scenario: The goggles reveal

- **WHEN** Snake selects the goggles
- **THEN** the red beams appear on their exact ROM geometry

### Requirement: Crossing a beam raises the RED alert and burns the room's beams

An ON beam SHALL trip when the player crosses its line per `ChkTouchLaser`
(logic/laserbeams.asm): axis 0 — |playerX − X| < 4 AND |Y + 8 + len/2 − playerY| < len/2;
axis 1 — |playerY − Y| < 4 AND |X + len/2 − playerX| < len/2. Tripping raises the alert
with the RED variant (`SetAlertMode5` — lasers and cameras force the red-alert music) and
REMOVES every beam in the room (`RemoveLaserBeans`) — visible or not.

#### Scenario: Walking through blind

- **WHEN** Snake crosses a beam without the goggles selected
- **THEN** the red alarm sounds and the room's beams are gone for the rest of the alert

### Requirement: Room 72's beams cycle — only while watched

In room 72 ONLY, and ONLY while the goggles are selected (`DrawMovingLasers`,
Banks0123.asm:5785-5792), a 0xC0-iteration timer SHALL advance `LaserRoomCnt` through the
five `LasersOnOff` patterns (data/laserconfig.asm:41-51), toggling each beam's ON state and
its collision with it. The counter persists across rooms. Room 72 is not exported yet — the
logic ships dormant.

#### Scenario: The cycle

- **WHEN** Snake stands in room 72 with the goggles selected for 0xC0 iterations
- **THEN** the beams flip to the next ON/OFF pattern

### Requirement: Surveillance cameras patrol, sight, flash and freeze

Cameras (`ID_CAMERA` — cameras.json from RoomsWithCamera/CamDirs/actor lists/idxRoomPaths;
live in exported rooms 14 and 31) SHALL patrol their ROM path points at 1px per iteration,
waiting a pseudo-random 0-255 iterations at each point (`ld a,r`), and look through
`ChkSeePlayer` from the lens offset (`CameraDrawOffsets`: up −12, down +43, left −17,
right +16). On sighting Snake the camera SHALL stop, flash red for 0x20 iterations
(`CamAlertAnim`, red on bit 2 of the countdown) and the RED alert SHALL rise; it then
freezes (`RenderCamera`). During an alert cameras do not move or scan (`CamameraMove`).

#### Scenario: Spotted by the ceiling

- **WHEN** Snake crosses a room-31 camera's line of sight outside an alert
- **THEN** the camera stops, flashes red, and the red alarm rises

### Requirement: Laser cameras fire damaging shots straight down

Laser cameras (`ID_CAMERA_LASER`, room 111's pair live as an island) SHALL patrol on X and,
when Snake passes underneath (PlayerY ≥ camY AND camX within (playerX−4, playerX+4],
`LaserCamChkShot`), stop and fire a laser shot (SFX 4): a red column growing one 16px
segment per iteration — 11 segments max, 3 in room 111 (`InitLaserShot`) — then shrinking
away. While extended, the shot SHALL damage Snake 0x10 (`ChkLaserShot` → `TouchPlayer`,
ActorTouchDamage) when |playerX − shotX| < 8 within the `LaserLenghts` span, through the
normal damage-delay. While Snake stays within 0x60 the camera SHALL shadow his X
(`CameraChkContinue`), resuming its patrol when he leaves.

#### Scenario: Passing under the turret

- **WHEN** Snake walks under a room-111 laser camera
- **THEN** it stops, fires a red beam downward, and standing in it costs 16 life

#### Scenario: Escaping its reach

- **WHEN** Snake moves more than 0x60 away
- **THEN** the camera returns to its patrol
