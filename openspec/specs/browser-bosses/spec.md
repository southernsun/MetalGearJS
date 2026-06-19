# browser-bosses Specification

## Purpose
TBD - created by archiving change machine-gun-kid. Update Purpose after archive.
## Requirements
### Requirement: Machine Gun Kid fights his ROM pattern in room 20

Room 20 SHALL spawn Machine Gun Kid at (0xE0, 0x34) unless `MachGunStatus` says dead
(`InitMachGunKid`). The fight SHALL follow `MachGunKidLogic` (logic/actors/
machinegunkid.asm): the intro (2 iterations, then text 79 unskippable ONCE — bit 1 —
and the "Mercenary" boss music); thinking — he waits 0x2D iterations ONLY while Snake
hides in his ±16px column (`MG_ChkSameWall`), moving toward him the moment he breaks
cover; walking 8 iterations at ±4 px/iteration clamped to X 0x20-0xE0; shooting for 0x28
iterations while Snake is within ±0x30 — one bullet every 4th iteration cycling the
0..4..0 fan (`InitMGunKidShot`: speedY 5, speedX (d×0x40−0x80)/256, SFX 5, the recoil
frame per shot); then hiding and repeating.

#### Scenario: The cover game

- **WHEN** Snake hides behind a pillar in Machine Gun Kid's column
- **THEN** the boss waits him out; stepping out draws him over and the bullet rain follows

### Requirement: His bullets and his life use the ROM tables

His bullets SHALL deal 8 damage (ActorTouchDamage[ID_SHOT_M_GUN_KID−1]) and stop on the
pillar tiles like guard bullets. He SHALL have 20 life (idxActorLife) and take the
per-weapon damage (handgun/SMG 2, grenade 5, rocket 0x0A, bomb/mine/missile 5) with the
projectile shape-0 box and his explosion shape 0x1B (±0x14, ±0x10). At 0 life the
enemy-dead SFX plays, the boss music stops, and `MachGunStatus` bit 0 latches — he NEVER
respawns (DismissActor7).

#### Scenario: Rockets end it fast

- **WHEN** two rockets connect
- **THEN** the fight is over for good — re-entering room 20 stays boss-free

### Requirement: The Shotgunner fights his ROM pattern in room 57

Room 57 SHALL spawn the Shotgunner at (0x90, 0x38) unless `ShotGunnerStat` says dead
(`InitShotGunner`). The fight SHALL follow `ShotGunnerLogic` (logic/actors/
shotgunner.asm): the intro (2 iterations, then text 61 unskippable ONCE and the boss
music); INVULNERABLE somersault rolls toward the player at ±4 px/iteration (collisions
disabled — shots pass through, no touch) ending on a wall or the 0x0B timer; then a
standing window (0x2D iterations, vulnerable, body touch deals 4) firing an AIMED
expanding shotgun blast every 16th iteration (`InitShotGunnerShot`: CalcShot2 speed
0x90, SFX 0x0F, 8 damage, the 3-frame expanding pellet visual) — held entirely while
Snake hides in the crate corner (PlayerY ≥ 166 AND PlayerX ≥ 170). He has 20 life,
takes the per-weapon damage standing only, and his death latches `ShotGunnerStat`
bit 0 — he never respawns.

#### Scenario: Timing the rolls

- **WHEN** Snake shoots during a somersault
- **THEN** nothing connects — the standing window between rolls is the only opening

#### Scenario: The crate corner

- **WHEN** Snake tucks behind the boxes (the room's bottom-right corner)
- **THEN** the Shotgunner holds fire until Snake comes out

