# browser-doors delta — the prison-wall door

## ADDED Requirements

### Requirement: Prison-wall doors open per ChkPrisonWalls

The prison-wall door types (room 165's type 14 in the cluster's pocket) SHALL be exported
like other doors and SHALL open per `ChkPrisonWalls` (logic/doors/opendoor.asm dispatch) as
found in the disassembly — the cell punch-out — with the wall's draw/erase handled by its
`DrawWallPrison*` routine's visual (or the room art, if the routine draws nothing the
collision tiles imply).

#### Scenario: Punching out of the cell

- **WHEN** Snake satisfies the ROM's prison-wall condition at room 165's wall
- **THEN** the wall opens and he can walk through to room 164
