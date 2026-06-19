# browser-player-weapons — delta (player-shots-hit-enemies)

## ADDED Requirements

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
