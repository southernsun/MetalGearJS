# browser-hazards delta

## ADDED Requirements

### Requirement: Gas rooms drift visible clouds

Every gas room's ID_GAS spots SHALL cycle per GasLogic: hidden for a random delay (up to 255 iterations), visible for 0x20 iterations animating two frames every 8, then hidden again — ambience only, no collision.

#### Scenario: The cloud cycle

- **WHEN** Snake stands in a gas room
- **THEN** clouds appear and fade at the ID_GAS spots on independent random cycles

### Requirement: Rolling barrels crush

The barrel rooms (141/153/191/205) SHALL roll their barrel horizontally per RollingBarrelLogic: starting away from the player's side, accelerating ±8/256 px per iteration, bouncing between X 56 and 200 with SFX 0x1D; touching the barrel costs ALL life (ActorTouchDamage 0xFF) through the normal damage delay.

#### Scenario: The bounce

- **WHEN** the barrel reaches a side wall
- **THEN** it clamps, flips direction with the hit SFX, and accelerates again

### Requirement: Electric floors zap while their switch lives

Rooms 37/110 (tiles 0x60/0x61) and 40 (0x45/0x46) SHALL electrify those tiles while the room's switch actor is alive: standing on one costs 2 life with SFX 0x18 and an 8-frame delay; SHOOTING the switch (life 2) turns the floor off for the visit. The live tiles pulse visibly (the ROM's palette fade approximated).

#### Scenario: Kill the switch

- **WHEN** Snake shoots the room's power switch dead
- **THEN** the floor stops zapping until the room is re-entered
