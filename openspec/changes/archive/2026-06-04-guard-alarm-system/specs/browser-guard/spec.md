## MODIFIED Requirements

### Requirement: Alert state with icon and music

When the guard detects Snake, the game SHALL raise the **global alarm** (see `browser-guard-alarm`):
briefly flash the "!" alert icon above the guard (a momentary discovery cue, as in the ROM — not a
persistent badge) and play the alert music. In alert, the guard SHALL **actively pursue Snake** —
chasing him and firing at him (see the chase and bullet requirements) — rather than holding position.
The alert SHALL be the game-wide alarm rather than a per-guard latch: it persists across room changes
(a guard in a room entered during the alarm starts alerted), and it SHALL end via the alarm lifecycle
(`ChkAlarmEnd`/`StopAlert`) — when the alert room is cleared/left — returning the guard to its patrol,
rather than remaining latched for the whole slice. A punch KO/kill still drops *that* guard out of the
chase, but the alarm itself ends only through the alarm lifecycle.

#### Scenario: Detection raises the alarm

- **WHEN** the guard detects Snake
- **THEN** the "!" icon flashes above the guard briefly and the alert music plays (after audio
  is unlocked by a user gesture)
- **AND** the guard begins pursuing Snake (it no longer stands still), and the global alarm is raised

#### Scenario: The alert icon is a brief flash, not a permanent badge

- **WHEN** the discovery flash has elapsed while the guard is still alerted and chasing
- **THEN** the "!" icon is no longer drawn (matching the original game), even though the guard
  remains in the alert/chase state

#### Scenario: Alert is not retriggered every frame

- **WHEN** the guard is already in the alert state and still sees Snake
- **THEN** the alert music is not restarted from the top each frame

#### Scenario: Alert persists across rooms and ends via the alarm lifecycle

- **WHEN** the player changes rooms while alerted, or the alert room is later cleared
- **THEN** the alarm stays up across the room change, and ends only when the alarm lifecycle clears it
  (alert room cleared/left) — at which point the music stops, the icon is gone, and guards patrol again
