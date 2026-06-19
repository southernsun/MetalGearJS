## ADDED Requirements

### Requirement: Per-tile tile-type data in room export

The room export SHALL emit, in addition to the solid-collision bitmap, a **per-tile tile-number
grid** addressable per tile like the existing collision grid, sufficient for the browser to
classify gameplay tiles — at minimum ladder tiles (`0x08`) and shallow/deep water tiles
(`0x73–0x74` / `0x75–0x76`, with shadow `0x6F–0x72` and brick-in-water `0x6D`).

#### Scenario: Room data exposes tile types

- **WHEN** a room is exported
- **THEN** its data includes a per-tile tile-number grid, so the browser can determine for any
  tile whether it is a ladder, shallow-water, or deep-water tile — not just solid/open

#### Scenario: Existing collision data is unchanged

- **WHEN** the export runs
- **THEN** the existing `solid[]` bitmap (and all other current outputs) are produced as before,
  with the tile-type grid added alongside
