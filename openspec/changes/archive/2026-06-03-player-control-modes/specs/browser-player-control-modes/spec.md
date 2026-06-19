## ADDED Requirements

### Requirement: Player control-mode dispatch

The game SHALL drive Snake through a control-mode state machine faithful to the ROM
(`PlayerControlLogic` dispatching on `PlayerControlMod`; `constants/Enums.asm`). For this change
the implemented modes are 0 = normal walk and 1 = punch (the existing behaviour), with the
dispatch structured so later modes (6 ladder-walk, 7 ladder-climb, …) are added as branches. The
on-screen sprite SHALL be selected from `PlayerAnimation`. Plain walk + collision + doors + punch
behaviour SHALL be unchanged — it simply runs as mode 0/1 of the dispatch.

#### Scenario: Walk and punch run as control modes 0 and 1

- **WHEN** Snake walks, collides, opens/enters doors, traverses rooms, or punches
- **THEN** behaviour is exactly as before, now dispatched as mode 0 (walk) / mode 1 (punch)

#### Scenario: The sprite follows PlayerAnimation

- **WHEN** the player animation value changes
- **THEN** the drawn Snake frame is selected from `PlayerAnimation` (walk/punch/die today)

#### Scenario: Dispatch is extensible

- **WHEN** a later change adds a mode (e.g. ladder-climb = 7)
- **THEN** it plugs in as a new branch of the dispatch without altering modes 0/1
