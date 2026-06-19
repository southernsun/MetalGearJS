# browser-rank-progression delta — per-room prisoner rescue texts

## MODIFIED Requirements

### Requirement: Prisoners can be rescued by touch

A room MAY hold a prisoner (`PrisonerLogic`, logic/actors/prisoner.asm): he idles with the
ROM's 2-frame animation, and Snake touching him (touch shape `ActorsShapeTouch` 0x17:
`|prisonerY − 8 − snakeY| < 16` AND `|prisonerX − snakeX| < 16`, strict) SHALL rescue him —
he shows the freed pose briefly, his rescued flag is set so he never reappears in that room,
and the rescue counter increments (`IncRescued`). The rescue SHALL show the ROM's per-room
dialogue through the real lookup chain (`PrisonerRescued`, logic/actors/prisoner.asm:216-260):
room 167 → text 129 (Ellen), room 193 → text 140 or 131 by the prisoner's Y (Jennifer's
brother, `ChkRescJenBro`), otherwise the `PrisonerTexts` table (room → text id, :271-289),
ported verbatim. Touching a prisoner SHALL cause no damage and no alarm. The ROM's prisoner
rooms (129–203) are outside the exported cluster; DEMO prisoners in cluster rooms are a
documented divergence, and each demo room SHALL map to a REAL `PrisonerTexts` text id (cited
as part of the same divergence) so the actual dialogue variety shows.

#### Scenario: Touching a prisoner rescues him

- **WHEN** Snake's position enters an idle prisoner's touch box
- **THEN** the prisoner switches to the freed pose and is gone from the room afterwards, and
  the rescue counter increases by one

#### Scenario: The rescue shows the room's ROM dialogue

- **WHEN** a prisoner is rescued in a room with a `PrisonerTexts` entry (or a demo room's
  mapped id)
- **THEN** that room's text plays in the text window (e.g. room 159's Diane-frequency tip,
  text 27), not a generic string

#### Scenario: A rescued prisoner stays rescued

- **WHEN** Snake re-enters the room of a prisoner he rescued
- **THEN** no prisoner appears there

#### Scenario: Prisoners are harmless

- **WHEN** Snake touches a prisoner
- **THEN** Snake takes no damage and no alarm is raised
