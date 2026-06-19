## ADDED Requirements

### Requirement: Cardboard box

The game SHALL draw Snake under the cardboard box when it is the selected item (`SELECTED_BOX`)
and Snake is in normal control (`PlayerAnimation=7`, `SetSprBox`: sprite 42 idle, alternating
42/44 while moving), with movement unchanged from normal walking (the ROM keeps box movement
identical to walking — a sprite/flag, not a separate control mode). The box appearance SHALL be
dropped when the box is deselected, or when Snake enters water, punches, or dies (those animations
take precedence).

#### Scenario: Equipping the box hides Snake under it

- **WHEN** the box item is selected and Snake is in normal control
- **THEN** Snake is drawn as the box and moves like normal walking (box idle vs moving frames)

#### Scenario: Other states take precedence

- **WHEN** the box is selected but Snake enters water, punches, or dies
- **THEN** the water/punch/death animation is shown instead of the box

#### Scenario: Unequipping restores Snake

- **WHEN** the box item is deselected
- **THEN** the box appearance is dropped and the normal walk animation is shown
