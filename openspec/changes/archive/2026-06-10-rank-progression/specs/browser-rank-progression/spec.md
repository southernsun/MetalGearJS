# browser-rank-progression — delta (rank-progression)

## ADDED Requirements

### Requirement: Prisoners can be rescued by touch

A room MAY hold a prisoner (`PrisonerLogic`, logic/actors/prisoner.asm): he idles with the
ROM's 2-frame animation, and Snake touching him (touch shape `ActorsShapeTouch` 0x17:
`|prisonerY − 8 − snakeY| < 16` AND `|prisonerX − snakeX| < 16`, strict) SHALL rescue him —
he shows the freed pose briefly, his rescued flag is set so he never reappears in that room,
and the rescue counter increments (`IncRescued`). Touching a prisoner SHALL cause no damage
and no alarm. The ROM's prisoner rooms (129–203) are outside the exported cluster; DEMO
prisoners in cluster rooms are a documented divergence.

#### Scenario: Touching a prisoner rescues him

- **WHEN** Snake's position enters an idle prisoner's touch box
- **THEN** the prisoner switches to the freed pose and is gone from the room afterwards, and
  the rescue counter increases by one

#### Scenario: A rescued prisoner stays rescued

- **WHEN** Snake re-enters the room of a prisoner he rescued
- **THEN** no prisoner appears there

#### Scenario: Prisoners are harmless

- **WHEN** Snake touches a prisoner
- **THEN** Snake takes no damage and no alarm is raised

### Requirement: Five rescues raise the rank with a full heal

Every 5th rescue SHALL raise the Class by one, capped at 3 (`IncRescued` → `IncClassLv`,
SFX 0x26), and apply `UpdateLevels`: MaxLife becomes 24/32/40/48 for Class 0–3, life is
REFILLED to the new maximum, the HUD CLASS stars and LIFE bar update, and the ammo/ration
maxima move to the rank's row (`MaxAmmoLv1-4`: handgun/SMG 50/100/200/300, grenades
15/30/60/90, rockets 5/10/20/30, bomb/mine/missile 5/10/15/20; rations 3/6/9/18).

#### Scenario: The fifth rescue ranks up

- **WHEN** the rescue counter reaches 5
- **THEN** the counter resets, Class rises by one, life refills to the new MaxLife, and the
  HUD shows one more star

#### Scenario: Rank raises the ammo ceiling

- **WHEN** Snake is Class 1 and collects ammo crates
- **THEN** handgun ammo can now reach 100 (instead of the Class-0 cap of 50)

#### Scenario: Class caps at 3

- **WHEN** Snake is already Class 3 and completes another 5 rescues
- **THEN** Class stays 3 (four stars remains the maximum)

### Requirement: Killing a prisoner downgrades the rank

A prisoner SHALL be killable by gunfire (LIFE 2, handgun damage 2 — the shared shot-vs-enemy
box, shape 0). His death SHALL invoke `DowngradeRank` (`KillPrisoner`): the rescue counter
resets, the REGULAR prisoners' rescued flags clear (they can be re-rescued; the ROM's first-6
special prisoners stay rescued), and if Class > 0 it drops by one (SFX 0x27) with life
CLAMPED (never refilled) to the lower MaxLife and ammo/rations clamped to the lower maxima
(`LimitAmmo`).

#### Scenario: Shooting a prisoner costs a rank

- **WHEN** Snake (Class 1, full life 32) shoots a prisoner dead
- **THEN** Class drops to 0, life clamps to 24, ammo above the Class-0 caps is reduced, and
  the rescue counter is 0

#### Scenario: Regular prisoners can be re-rescued after a downgrade

- **WHEN** a downgrade has cleared the regular rescued flags
- **THEN** those prisoners appear in their rooms again and can be rescued again

#### Scenario: Class never goes below 0

- **WHEN** Snake is Class 0 and kills a prisoner
- **THEN** Class stays 0 (the counter and flags still reset)

### Requirement: Rank persists across the slice restart

Class (and the rescue flags/counter) SHALL survive the death-restart, as the ROM's continue
does — only life and position reset.

#### Scenario: Rank kept after death

- **WHEN** Snake dies and the slice restarts
- **THEN** Class and the rescued flags are unchanged (life refills to the rank's MaxLife)
