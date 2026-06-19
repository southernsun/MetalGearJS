# browser-doors delta — the bomb-wall lock corrected

## REMOVED Requirements

### Requirement: Lock-14 walls yield only to plastic bombs

**Reason**: The lock number was wrong — ChkOpenDoor's dispatch puts ChkBasementWall at
lock 16 (14 is ChkBigBossDoor). Replaced by the corrected requirement below.

## ADDED Requirements

### Requirement: Lock-16 walls yield only to plastic bombs

A lock-16 wall SHALL open when a PLASTIC BOMB explodes inside its open-area zone (`ChkBombLocation`), and punching it SHALL play the breakable-wall SFX and nothing more (`ChkPunchBaseWall`). The bomb walls are LOCK 16 (`ChkOpenDoor`'s dispatch: 14 = ChkBigBossDoor, 15 = ChkPrisonWalls, 16 = ChkBasementWall — the weapons slice had keyed the hook on 14). The one lock-16 wall in the game data: 166 ⇄ 167 (Ellen's cell); 114 ⇄ 116 turned out to be a CARD1 door.

#### Scenario: Bombing through to Ellen

- **WHEN** a plastic bomb explodes against room 166's east wall
- **THEN** the wall opens into Ellen's cell; any number of punches only thuds
