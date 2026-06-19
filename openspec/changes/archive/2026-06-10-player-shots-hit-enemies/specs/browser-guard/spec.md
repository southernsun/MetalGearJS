# browser-guard — delta (player-shots-hit-enemies)

## ADDED Requirements

### Requirement: The guard has life points and dies to gunfire

The guard SHALL carry the ROM's life points (`idxActorLife`, data/actorspriteattr.asm:
LIFE = 2 for the patrol/alert guard; `TransformAlertGuard` does not reset it). Bullet damage
SHALL decrement life with a clamp at zero (`DecEnemyLife`). When life reaches zero the guard
SHALL be killed on its next logic tick (`RunEnemyLogic` → `KillActor`) — which, as in the ROM
(`EnemiesLogic` skips the logic while `StunnedCnt > 0`), SHALL be deferred while the guard is
stunned: a guard shot mid-stun dies when the stun expires. Death SHALL remove the guard from
the room; it SHALL NOT remove in-flight guard bullets (they are independent actors in the ROM
and keep flying), and the alarm SHALL continue to end only via the alarm lifecycle (the alert
room being cleared counts, exactly as for a punch kill).

#### Scenario: One handgun bullet kills a guard

- **WHEN** a player handgun shot (damage 2) hits a guard with the ROM's spawn life of 2
- **THEN** the guard's life reaches 0 and he is removed from the room on his next logic tick

#### Scenario: A stunned guard's death is deferred

- **WHEN** a guard is shot to 0 life while frozen by a punch stun
- **THEN** he remains (frozen) until the stun timer expires, and is killed at that point

#### Scenario: Death does not erase in-flight bullets

- **WHEN** a guard dies (by gunfire or the third punch) while his bullets are mid-flight
- **THEN** those bullets keep travelling and remain dangerous until they hit a wall, leave the
  room, or strike Snake

#### Scenario: Shooting the alert-room guard ends the alarm

- **WHEN** the alarm was raised in this room and the guard is killed by gunfire
- **THEN** the alarm ends via the existing lifecycle (alert room cleared), as with a punch kill
