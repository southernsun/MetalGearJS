# browser-player-hud Specification

## Purpose
TBD - created by archiving change player-hud. Update Purpose after archive.
## Requirements
### Requirement: The HUD is composited each frame from player state

The game SHALL draw an on-screen HUD every frame, faithful to `RenderHUD` (`logic/hud.asm`), composed
of the LIFE bar, the CLASS/rank stars, the equipped weapon (with ammo), and the equipped item. The HUD
SHALL read live player state (`Life`, `MaxLife`, `Class`, `SelectedWeapon`, `SelectedItem`, weapon
ammo) so it always reflects the current situation. (The CALL sign / radio and the self-destruct
countdown that `RenderHUD` also calls are out of scope for this change.)

#### Scenario: HUD reflects current state

- **WHEN** any of life, rank, selected weapon/ammo, or selected item changes
- **THEN** the corresponding HUD element updates on the next frame

### Requirement: LIFE bar

The HUD SHALL draw a "LIFE" label and a bar whose filled width tracks `Life`, faithful to `DrawLife`
(`logic/hud.asm`). The bar's full scale SHALL be `0x30` (48) and the filled portion SHALL be
proportional to `Life`; the bar's outline box SHALL be drawn in white (`0Eh`). `MaxLife` SHALL start
at `0x18` (24) (`InitPlayerVars`) and define the current maximum; when `Life` is at or below 1 the bar
SHALL be empty.

#### Scenario: Bar tracks life

- **WHEN** `Life` decreases or is restored
- **THEN** the filled width of the LIFE bar changes to match `Life` against the `0x30` scale

#### Scenario: Empty bar at zero life

- **WHEN** `Life` is 0 or 1
- **THEN** the LIFE bar shows empty

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

### Requirement: Equipped weapon readout with ammo

The HUD SHALL draw a white-outlined weapon box containing the selected weapon's icon and its 3-digit
ammo count, faithful to `DrawWeaponHUD`/`RenderAmmoHUD` (`Banks0123.asm`). When no weapon is selected
(`SelectedWeapon == 0`) the box SHALL be empty. The ammo shown SHALL be the weapon's stored count from
the `Weapons` inventory (handgun ammo at the inventory ammo offset) and SHALL update when ammo is
consumed by firing.

#### Scenario: Weapon icon and ammo shown

- **WHEN** a weapon is selected
- **THEN** the weapon box shows that weapon's icon and its current ammo count

#### Scenario: Empty box with no weapon

- **WHEN** no weapon is selected
- **THEN** the weapon box is empty

#### Scenario: Ammo count drops on fire

- **WHEN** the handgun is fired and consumes a round
- **THEN** the weapon HUD's ammo count decreases by one

### Requirement: Equipped item readout

The HUD SHALL draw a white-outlined item box containing the selected item's icon, faithful to
`DrawItemHUD` (`Banks0123.asm`), and for keycard items it SHALL draw the card number. When no item is
selected (`SelectedItem == 0`) the box SHALL be empty.

#### Scenario: Item icon shown

- **WHEN** an item is selected
- **THEN** the item box shows that item's icon (and, for a keycard, its card number)

#### Scenario: Empty box with no item

- **WHEN** no item is selected
- **THEN** the item box is empty

