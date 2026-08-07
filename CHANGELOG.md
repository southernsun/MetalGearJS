# Changelog

All notable changes to the browser port. Newest first.

The version lives in `web/game.js` (`APP_VERSION` / `APP_BUILD`) and is shown in the page footer,
in every **B** bug report, and in the console — see [`docs/versioning.md`](docs/versioning.md).
**The newest entry here must match those constants**; `web/hud.headless.mjs` asserts it, so a
half-finished bump fails the suite.

Bump by the severity of the change:

| Bump | When |
| --- | --- |
| **PATCH** `0.9.0` → `0.9.1` | Bug fixes only, no new behaviour. |
| **MINOR** `0.9.0` → `0.10.0` | New behaviour or systems, or a broad faithfulness rework. |
| **MAJOR** → `1.0.0` | Reserved for when the `ready-to-test` playtest backlog is cleared. |

Issue numbers link to [the tracker](https://github.com/southernsun/MetalGearJS/issues).

---

## 0.10.0 — 2026-08-07

Breakable-wall collision taken from the ROM's own per-tile bitmap, and the basement dog spawner
implemented as the spawner it actually is.

### Added
- **Basement dog spawner** — `ID_SPAWN_DOG` is modelled as `InitSpawnDog`/`SpawnDogLogic`
  (`dogspawner.asm`): an invisible spawner that takes **Snake's entry position**, releases one dog
  every `30h` iterations while `NumBasementDogs` (the count of dogs in the room you just left)
  lasts, then dismisses itself. This is the real cross-room "the pack follows you" carry-over,
  replacing the placed-dog approximation. (#131)
- **Per-cell wall collision masks** — `door-gfx.json` now carries each breakable wall's `solid`
  mask, decoded from the ROM's `IdxColisTiles` bitmap by `RoomViewer`'s `SaveWallBlock`.

### Fixed
- **Breakable walls were solid across their whole tile block.** ROM collision is per *tile number*,
  and 8 of the 13 wall types mix solid tiles with walkable ones. Blocking the entire rect sealed off
  the lane the player must occupy: Snake could get no closer than 7px past the block (x=62 where
  `ChkTouchDoor` needed ≤57 in room 165, 30 vs 25 in room 59), so
  - **the prison cell wall could never be punched** — `ChkPrisonWalls` never reached its
    `PrisonWall1Life` decrement, making the cell inescapable (#130);
  - **room 59's side lane could not be walked at all**, hiding the room behind it (#129).
- The dog spawner is no longer drawn as a dog standing at (128,96) — inside a wall in several
  basement rooms (#131).

---

## 0.9.0 — 2026-08-07

The first versioned build. Establishes versioning itself, and carries a large ROM-faithfulness pass
across the alert system, weapons, radio/text/UI, mid-bosses and the telescope.

### Added
- **Versioning** — `APP_VERSION` / `APP_BUILD` in `web/game.js`, surfaced in the page footer, in
  bug-report metadata (a **Version** row in the GitHub issue table) and in the console. Reports
  filed before this build show `unknown (pre-0.9.0 build)`.
- **Room maps** — `docs/room-maps/`, ten PNGs tiling every one of the 235 rooms with its number and
  connections, split at the elevator shafts. Regenerate with
  `dotnet run --project Tools/RoomViewer -- --export-map`.
- **Exported assets replacing hand-drawn art** — the binocular reticle (`--export-target`, #118) and
  the rolling-barrel column (`--export-barrel`, #111) are now decoded from the ROM instead of drawn
  with canvas primitives.
- **Electrified-floor stencils** — per-room masks of the palette slot `PowerSwitchLogic` animates,
  so only the conductor pixels pulse (#112).
- **MapZone** — `idxMapZones` ported, unblocking the radio antenna requirement and the
  `MapZone == 4` bug-warning suppression (#78, and two items of #90).

### Fixed — guard alerts
- Reinforcement cap keyed on the **respawn enemy id** rather than the room's red-alert bit (wrong in
  29 of 96 rooms), counting only that enemy type so guards still on patrol no longer eat the budget;
  rooms 40/41/42/44/48/89/92 now send **jetpack troopers**; `ChkAlarmEnd2`'s rooms-≥-188 and
  room-216 rules added. Full write-up in
  [`docs/alert-system-analysis.md`](docs/alert-system-analysis.md). (#128)

### Fixed — weapons
- Shared 6-slot shot pool: per-weapon spawn caps removed (grenades 2 → 6, mines 3 → 6); the
  `weapondamage.asm` header byte is the `ChkPlayerShots` scan bound, not a cap (#61).
- Rocket / plastic bomb / missile require **shot slot 0** free (#63).
- SMG burst drift negated for horizontal fire (#62); missile steering on a fresh press (#64);
  laser-camera reach extended to the full `LaserLenghts` row (#66); the enemy-drop latch is consumed
  even when slot 0 is occupied (#67); shot speed expressed as the ROM's difficulty formula (#60).

### Fixed — radio, text and UI
- Incoming call suppressed when the first caller cannot answer (#43); `ReplyRequested` cleared on
  tuning (#76); the radio hum returns after a no-reply SEND (#77).
- `TW_Wait`'s full branch ladder — no prompt on auto-advancing texts, mode-0 pages self-advance
  (#44); mode 1 modelled distinctly (#79); skipped texts no longer set their event flags (#80);
  the STAFF roll prints at half speed and silently (#82).
- Keycard number in the HUD (#44); small weapon icons offset +8 (#81); menu cursor seeds the first
  empty slot (#89); Konami logo held 256 iterations and the attract demo plays Theme of Tara (#45);
  password space character (#75); title-skip stop-SFX (#84); elevator dismount facing inverted
  (#85); capture music fades instead of cutting (#86).

### Fixed — rooms, actors and movement
- Rolling barrel: launch direction read the previous room's player position, and the first leg now
  reproduces the ROM's leftward-acceleration quirk (#113); collision box matched to
  `ImpactAreasInfo` row 16.
- Tank idle beats and long-move state (#71); bulldozer's final charge no longer stutters (#72);
  desert shells accelerate sideways and leave a lingering explosion (#73).
- Punch duration 12 → 8 frames (#51); ladder mount/dismount need a fresh press (#52); punch SFX only
  on contact (#55); room 78's second collision shape (#49); guards hidden in the own-room telescope
  view (#87).
- Patrol-path export: table scans no longer read past a room's entry, and alert/silencer guards take
  no path slot — removing three `null` path points that could send a guard to a NaN position (#122).
  `SetDirToPoint` ported literally (#123).
- Telescope: exit returns to the **equipment menu**, so the scope stays active until another item is
  selected (#124). Direction-arrow coordinate corrected (#115).
- Continuing after death inside an elevator restores elevator control mode instead of a free walk
  (#125); punching a wall makes a sound again (#126); rolling-barrel colours corrected to the metal
  drum greys (#127).

### Changed
- `docs/faithfulness-divergences.md` corrected: the telescope "exit to play" row was a bug recorded
  as a deliberate divergence, and three deferred rows are now cleared.
