# browser-player-hud — delta (rank-progression)

## MODIFIED Requirements

### Requirement: CLASS / rank stars

The HUD SHALL draw a "CLASS" label followed by `Class + 1` star tiles (1–4 stars), faithful to
`DrawClass` (`logic/hud.asm`), driven by the `Class` variable. The displayed star count SHALL change
when `Class` changes, and `MaxLife` SHALL follow `Class` per `UpdateLevels` (higher rank → higher max,
up to the `0x30` bar scale). `Class` now changes in play (see `browser-rank-progression`): a rank-up
refills the LIFE bar to the new maximum, and a rank-down clamps it — the HUD SHALL reflect both
immediately.

#### Scenario: Stars match rank

- **WHEN** `Class` is N
- **THEN** the HUD shows N+1 stars next to "CLASS"

#### Scenario: Rank-up refills the bar at its new scale

- **WHEN** a rescue raises `Class`
- **THEN** the LIFE bar fills to the new MaxLife and one more star is drawn

#### Scenario: Rank-down clamps the bar

- **WHEN** killing a prisoner lowers `Class` while life exceeds the lower maximum
- **THEN** the LIFE bar shows the clamped value and one fewer star
