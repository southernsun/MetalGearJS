# browser-doors delta — the bomb walls

## ADDED Requirements

### Requirement: Lock-14 walls yield only to plastic bombs

Lock-14 breakable walls (`ChkBasementWall`, logic/doors/opendoor.asm:332) SHALL open when
a PLASTIC BOMB explodes with its position inside the wall's zone (`ChkBombLocation` — the
door's open area widened by 4); punching them SHALL only play the breakable-wall SFX
(`ChkPunchBaseWall` ends at PlayBreakableSfx with no life counter).

#### Scenario: The right tool

- **WHEN** Snake punches a lock-14 wall all day
- **THEN** it thuds and never opens — one plastic bomb placed against it opens it
