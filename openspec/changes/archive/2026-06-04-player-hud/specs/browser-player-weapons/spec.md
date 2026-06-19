## MODIFIED Requirements

### Requirement: Handgun fire and player shots

With the handgun selected, pressing fire SHALL spawn a player shot faithful to `ChkHandGunShot`
(`logic/weapon/handgun.asm`): from Snake's gun position (Y − 14) in his facing direction, at the ROM
shot speed (`ShootDirSpeeds`), with a range timer (`0x10` frames). Firing SHALL be gated on
**ammunition**: the handgun carries an ammo count in the `Weapons` inventory; when ammo is **zero**,
pressing fire SHALL play the empty "click" SFX (`15h`) and spawn **no** shot; otherwise firing SHALL
consume one round (`DecItemUnits`) and the count SHALL decrease. Firing also makes noise — unless the
suppressor is held, firing SHALL trigger an alert check (`ChkAlertTrigger`). A shot SHALL travel each
tick and be removed when its range timer expires, when it leaves the room, or when it hits a solid
tile (`BulletLogic`/`BulletLogic2`, ignoring railing tiles `0x6B`/`0x6E`). At most 6 player shots
SHALL be active at once. Firing SHALL be disabled in the modes the ROM disables it (shallow water,
deep water, box) per `ChkWeaponShot`.

#### Scenario: Fire the handgun

- **WHEN** the handgun is the selected weapon, has ammo, and the player presses fire
- **THEN** a shot spawns at Snake facing his direction, travels in a straight line, and the handgun
  ammo count decreases by one

#### Scenario: Out of ammo

- **WHEN** the handgun is selected with zero ammo and the player presses fire
- **THEN** no shot spawns (an empty "click" is the only feedback)

#### Scenario: Firing makes noise

- **WHEN** the handgun is fired without the suppressor
- **THEN** the shot triggers an alert check (the noise can alert a nearby guard)

#### Scenario: Shot ends at its range, a wall, or the room edge

- **WHEN** a shot's range timer expires, it reaches a solid tile, or it leaves the room
- **THEN** the shot is removed (railing tiles `0x6B`/`0x6E` do not stop it)

#### Scenario: No firing while swimming or boxed

- **WHEN** Snake is in shallow water, deep water, or under the box
- **THEN** the fire button does not spawn a shot

#### Scenario: Player-shot pool is bounded

- **WHEN** 6 player shots are already active
- **THEN** pressing fire does not spawn another until one frees up
