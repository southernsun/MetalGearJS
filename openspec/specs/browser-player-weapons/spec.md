# browser-player-weapons Specification

## Purpose
TBD - created by archiving change player-handgun. Update Purpose after archive.
## Requirements
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

### Requirement: Player shots hit enemies

A player shot SHALL test the room's guard each tick using the ROM's shot-vs-enemy collision
(`ChkEneHitByShot`, logic/damagetoenemy.asm): the guard's projectile impact box is shape 0 of
`ImpactAreasInfo` (data/shapes.asm) — the shot hits when `|guardY − 16 − shotY| < 16` AND
`|guardX − shotX| < 8` (strict comparisons). On a hit the shot SHALL deal the handgun's ROM
damage to that enemy (`BulletDamage`, data/weapondamage.asm: 2 for guards) and the shot SHALL
be removed (`RemoveShot` — handgun/SMG bullets are consumed by the hit; they do not pass
through).

#### Scenario: A shot in the guard's impact box hits

- **WHEN** a player shot's position enters the guard's impact box (within 16px vertically of
  the point 16px above the guard's anchor, and within 8px horizontally)
- **THEN** the guard takes 2 damage and the shot disappears

#### Scenario: A near miss passes by

- **WHEN** a player shot passes outside the impact box (e.g. ≥ 8px to the side of the guard)
- **THEN** the guard takes no damage and the shot keeps flying

#### Scenario: A wall protects the guard

- **WHEN** a player shot reaches a solid tile before the guard's impact box
- **THEN** the shot stops at the wall and the guard is not hit

### Requirement: The weapon fire dispatch covers all seven weapons

Firing SHALL dispatch by `SelectedWeapon` (`ChkWeaponShot`, logic/weaponuse.asm:30-40)
into the shared 6-slot shot pool, refusing in elevators, water, the box, and rooms ≥ 224.
Each weapon SHALL consume its ammo/unit per use (click SFX 0x15 when dry, for the SMG) and
respect its max-active count (data/weapondamage.asm headers: bullets 6, grenades 2,
rocket 1, bomb 1, mines 3, missile 1).

#### Scenario: No stacking rockets

- **WHEN** a rocket is in flight and the player fires again
- **THEN** nothing happens until it is gone

### Requirement: The SMG autofires a fanned burst

While Fire is HELD with the SMG selected, a bullet SHALL fire every 2 iterations
(`ChkSMGShot`, SubMachGunTimer), each consuming one round, with the burst position
cycling 1..8 through `SMG_BulletSpeeds` — bullets fan around the facing axis with ±1.5
and ±3 px/iteration drift. Bullets otherwise behave as handgun bullets (range 0x10,
kill by contact, suppressor honoured: SFX 0x0D / 0x0E, unsuppressed noise can raise the
alarm).

#### Scenario: Holding fire

- **WHEN** Fire is held with SMG ammo
- **THEN** a stream of bullets sprays with a visible spread, draining ammo per bullet

### Requirement: Grenades lob over walls and explode

A grenade (`ChkGrenadeShot`) SHALL move at ±3 px/iteration on the facing axis with its
DRAWN Y following the `GrenadeYOffsets` parabola over its real Y (peak −0x28), ignore tile
collision, not hurt by contact, and after 0x18 iterations explode (SFX 0x1A, alert
trigger): a ONE-frame kill window with `GrenadeDamage` (5 vs guards), then the 3-frame
small explosion.

#### Scenario: Over the wall

- **WHEN** a grenade is lobbed at a wall with a guard behind it
- **THEN** it arcs over and the explosion at its landing point can kill the guard

### Requirement: Rockets fly straight and explode on impact

A rocket (`ChkFireRocket`, one at a time) SHALL fly at ±5 px/iteration, kill by contact
(`RocketDamage` 0x0A vs guards), and explode against tiles (SFX 0x13 launch, 0x1A
explosion + alert, the medium explosion frames).

#### Scenario: Wall impact

- **WHEN** a rocket reaches a wall
- **THEN** it detonates there with the medium explosion

### Requirement: Plastic bombs are placed, timed, and open the bomb walls

A plastic bomb (`ChkPBombShot`, one at a time, consumable) SHALL be placed one step ahead
(`PBombDirOffset`), count 0x30 iterations (SFX 0x17 on set), then explode (SFX 0x1C +
alert, a one-frame kill window, the medium explosion). An exploding bomb inside a lock-14
wall's zone (`ChkBasementWall`/`ChkBombLocation` — the wall's open area widened by 4)
SHALL open that wall; punching those walls only plays the breakable SFX.

#### Scenario: Blowing the basement wall

- **WHEN** a plastic bomb explodes against a lock-14 wall
- **THEN** the wall opens; punching it forever does not

### Requirement: Mines arm where Snake stands and trip on contact

A land mine (`ChkLMineShot`, up to 3, consumable) SHALL sit at the placement spot, killing
by contact (`MineDamage` 5 vs guards): an enemy stepping on it takes the hit and the mine
explodes (small explosion, SFX 0x1C + alert).

#### Scenario: A guard steps on a mine

- **WHEN** a patrolling guard walks onto a set mine
- **THEN** the mine detonates, damaging him

### Requirement: The remote missile is steered by the direction keys

A remote missile (`ChkMissileShot`, one at a time, consumable, SFX 0x14) SHALL fly at
±4 px/iteration and re-aim on every direction press (`ControlMissile` → `SetMissileSpr`:
new speeds + the directional sprite), exploding against tiles (medium, `MissileDamage` 5
vs guards by contact). Player-movement gating during flight follows whatever the ROM
does (verified at implementation).

#### Scenario: Steering around a corner

- **WHEN** the missile flies right and Up is pressed
- **THEN** it turns upward and continues, its sprite re-aimed

