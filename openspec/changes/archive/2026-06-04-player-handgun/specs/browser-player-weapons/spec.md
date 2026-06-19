## ADDED Requirements

### Requirement: Snake shows the armed pose when a weapon is held

Snake SHALL use the **armed** walk/idle frames whenever a weapon is selected (`SelectedWeapon != 0`,
except plastic bomb / land mine) — `SetSprWalk4` adds 12 to the base frame (up=12, down=15, left=18,
right=21, each with idle/walk1/walk2). With no weapon selected he SHALL use the normal unarmed
frames. The punch and the water/box/ladder sprites are unaffected.

#### Scenario: Armed walk when a weapon is selected

- **WHEN** the handgun (or another firing weapon) is the selected weapon
- **THEN** Snake walks/idles in the armed pose (holding the weapon)

#### Scenario: Unarmed when no weapon is selected

- **WHEN** no weapon is selected (holstered)
- **THEN** Snake uses the normal unarmed walk/idle frames

### Requirement: Handgun fire and player shots

With the handgun selected, pressing fire SHALL spawn a player shot faithful to `ChkHandGunShot`:
from Snake's gun position (Y − 14) in his facing direction, at the ROM shot speed (`ShootDirSpeeds`),
with a range timer (`0x10` frames). A shot SHALL travel each tick and be removed when its range
timer expires, when it leaves the room, or when it hits a solid tile (`BulletLogic`/`BulletLogic2`,
ignoring railing tiles `0x6B`/`0x6E`). At most 6 player shots SHALL be active at once. Firing SHALL
be disabled in the modes the ROM disables it (shallow water, deep water, box) per `ChkWeaponShot`.

#### Scenario: Fire the handgun

- **WHEN** the handgun is the selected weapon and the player presses fire
- **THEN** a shot spawns at Snake facing his direction and travels in a straight line

#### Scenario: Shot ends at its range, a wall, or the room edge

- **WHEN** a shot's range timer expires, it reaches a solid tile, or it leaves the room
- **THEN** the shot is removed (railing tiles `0x6B`/`0x6E` do not stop it)

#### Scenario: No firing while swimming or boxed

- **WHEN** Snake is in shallow water, deep water, or under the box
- **THEN** the fire button does not spawn a shot

#### Scenario: Player-shot pool is bounded

- **WHEN** 6 player shots are already active
- **THEN** pressing fire does not spawn another until one frees up
