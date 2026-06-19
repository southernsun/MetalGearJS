# rom-coverage Specification

## Purpose
TBD - created by archiving change rom-coverage. Update Purpose after archive.
## Requirements
### Requirement: A curated component → routine status map

The project SHALL maintain a machine-readable map that groups the ROM into gameplay
**components**, and for each component lists its source `.asm` files and/or routine labels with
a status of `done`, `partial`, `todo`, or `out-of-scope`, plus an optional pointer to the JS
function/file that covers it. The map is the single source of truth for the curated numerator.

#### Scenario: Map enumerates components and routine statuses

- **WHEN** the coverage map is read
- **THEN** each component lists its ROM routines/files with one of the statuses
  `done` / `partial` / `todo` / `out-of-scope`, and `done`/`partial` entries may name the JS
  function or file that implements them

#### Scenario: Non-portable code is marked out-of-scope

- **WHEN** a routine is MSX hardware init, PSG/sound-driver internals, or copy-protection
- **THEN** it is recorded as `out-of-scope` so it is excluded from the coverage denominator

### Requirement: Automated denominator from the disassembly

The coverage script SHALL compute each component's denominator by parsing the actual `.asm`
sources — counting routine labels (and lines) for the files/routines assigned to that
component — rather than relying on hand-entered totals, so the denominator stays correct as the
disassembly changes.

#### Scenario: Denominator parsed from source

- **WHEN** the coverage script runs
- **THEN** it derives each component's total routine count (and line count) by parsing the
  assigned `.asm` files, not from numbers typed into the map

#### Scenario: Map references a routine that no longer exists

- **WHEN** the curated map names a routine/file absent from the disassembly
- **THEN** the script reports it (a warning or error) instead of silently miscounting

### Requirement: Per-component and overall coverage report

The coverage script SHALL emit a report showing, per component and overall, the count and
percentage of in-scope routines that are `done` (with `partial` distinguished), excluding
`out-of-scope` routines from the totals, and SHALL write/refresh `docs/rom-coverage.md` as the
human-readable view.

#### Scenario: Report shows per-component and overall coverage

- **WHEN** the coverage script runs
- **THEN** it prints each component's done/partial/total counts and a percentage, plus an overall
  percentage, with `out-of-scope` routines excluded from the denominator

#### Scenario: Documentation is generated from the data

- **WHEN** the report is generated
- **THEN** `docs/rom-coverage.md` reflects the current map and computed percentages, and notes
  that "translated" is a curated judgement whose faithfulness varies

### Requirement: Seeded from existing work

The initial coverage map SHALL be seeded from the ROM-source citations already recorded in the
project's completed changes, so the first report reflects work already done rather than starting
empty.

#### Scenario: Initial map reflects shipped slices

- **WHEN** the coverage map is first created
- **THEN** the components for snake movement, room traversal, doors, the guard (patrol, LOS,
  alert, chase, shoot, punch), player damage/HUD, and asset/audio export are populated with the
  routines those shipped changes cite, marked `done` or `partial` accordingly

