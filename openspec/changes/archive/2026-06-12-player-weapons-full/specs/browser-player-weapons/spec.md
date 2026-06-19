# browser-player-weapons delta — the full arsenal

## ADDED Requirements

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
