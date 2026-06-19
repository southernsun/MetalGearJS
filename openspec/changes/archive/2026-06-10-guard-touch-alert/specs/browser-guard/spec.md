# browser-guard — delta (guard-touch-alert)

## ADDED Requirements

### Requirement: Touching a guard alerts him

The game SHALL detect Snake touching the guard each frame using the ROM touch shape
(`ActorsShapeTouch[ID_GUARD−1] = 8` → `ImpactAreasInfo` row 8, via `ChkArea`): a touch occurs
iff `|guardY − snakeY| < 8` AND `|guardX − snakeX| < 12` (strict comparisons). A touch SHALL
set the guard's touched flag (`TOUCH_INFO` bit 7). An awake guard whose touched flag is set
SHALL raise the global alarm (`ChkSeePlayer2` → `GuardSetAlarm`); a sleeping guard SHALL wake
and raise the alarm from the same flag (`ListenShotsChkTouch`). A **stunned** guard SHALL
register no touch at all (`ChkTouchEnemy` skips stunned enemies): no flag, no damage, no
alarm.

#### Scenario: Walking into a patrolling guard raises the alarm

- **WHEN** Snake's position enters the guard's touch box while the guard patrols
- **THEN** the global alarm is raised and the guard enters the chase

#### Scenario: Touch box uses the ROM shape

- **WHEN** Snake stands exactly 12px to the side, or exactly 8px above/below, the guard
- **THEN** no touch registers (strict `<`); at 11px / 7px it does

#### Scenario: A stunned guard cannot be touched

- **WHEN** Snake overlaps a guard who is frozen by a punch stun
- **THEN** no touch flag is set, Snake takes no contact damage, and no alarm is raised

## MODIFIED Requirements

### Requirement: Line-of-sight detection faithful to the ROM

The guard SHALL detect Snake only when Snake is in front of the guard along its facing
direction, within a narrow perpendicular band, with no solid wall tile between them — matching
`chkdiscover.asm` (band ±8px for up/down facing, ±6px for left/right; player must be in front;
view blocked by collision tiles). Detection SHALL additionally honour `ChkSeePlayer`'s
visibility gates: Snake in **deep water** (the water-shadow animation) SHALL never be seen;
Snake under the **cardboard box** SHALL be seen only while the box is moving — a stationary
box hides him (the ROM's "is the cardboard box moving" check; the movement gate applies only
to the box). Being **touched** discovers Snake regardless of facing (see the touch-alert
requirement).

#### Scenario: Snake in the line of sight is detected

- **WHEN** Snake stands in front of the guard, within the perpendicular band, with a clear
  (no-wall) path along the facing axis
- **THEN** the guard detects Snake and the alert is triggered

#### Scenario: Behind the guard is safe

- **WHEN** Snake is behind the guard (opposite its facing) or outside the perpendicular band
- **THEN** the guard does not detect Snake

#### Scenario: Walls block sight

- **WHEN** a solid wall tile lies between the guard and Snake along the facing axis
- **THEN** the guard does not see Snake even if Snake is in front and within the band

#### Scenario: Deep water hides Snake

- **WHEN** Snake is in the deep-water animation inside the guard's line of sight
- **THEN** the guard does not detect him

#### Scenario: A stationary box hides Snake; a moving one does not

- **WHEN** Snake sits still under the cardboard box in the guard's line of sight
- **THEN** the guard does not detect him — but if he moves while boxed, the guard does
