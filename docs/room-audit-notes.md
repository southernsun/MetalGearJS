# Room audit — findings, fixes & plan (curated)

> **Note:** `data/*.asm` / `logic/*.asm` / `file:line` references here are in the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`. The `*.json` / `web/game.js` paths are in this repo.

Companion to the auto-generated [room-audit.md](room-audit.md) (run `node Tools/audit/audit-rooms.mjs`
to refresh that table + the gap tally). This file is the **hand-curated** record: what each gap is,
the ROM source, the fix status, and remaining work. It is never overwritten by the generator.

## Method

`Tools/audit/audit-rooms.mjs` parses the ROM's authoritative per-room tables
(`data/actorsinrooms.asm`, `data/itemsinrooms.asm`) and diffs them against every coverage
mechanism in the port: `actors.json` (generic actors), `cameras.json`/`lasers.json`, `items.json`,
`doors.json`, and the hardcoded `build*` boss functions in `web/game.js`. Each ROM actor is
classified covered / internal / **GAP**. Doors, connections and items are exported directly from the
ROM tables, so they are faithful by construction (one documented item divergence: the
rocket-launcher set is truncated while `JeniRocketF` stays 0).

## Summary (audit + fixes, 2026-06-15)

235 rooms exported. Doors/connections/items: faithful (only divergence = the rocket-launcher set
truncation while JeniRocketF=0). The audit found **20 rooms** with un-ported ROM actors; after this
pass **0 rooms remain** — every ROM actor class is now represented. (589 headless checks green.)

| # | Gap (ROM actor) | count | rooms | status |
|---|---|---|---|---|
| 1 | `ID_LAND_MINE` mine fields | 38 | 9, 64, 114, 120 | **FIXED** |
| 2 | `ID_GUARD_EXIT_LORRY` | 3 | 5, 7 | **FIXED** (patrol stand-in + exporter pathIdx fix) |
| 3 | `ID_DOG_BASEMENT` + `ID_SPAWN_DOG` | 10 | 58–63 | **FIXED** (DogLogic stand-in) |
| 4 | `ID_GUARD_ELEVATOR` | 2 | 3 | **FIXED** (stationary guard stand-in) |
| 5 | `ID_GUARD_SWITCH` | 1 | 16 | **FIXED** (stationary guard stand-in) |
| 6 | `ID_SLEEPING_SIGN` | 3 | 140 | **FIXED** (sentinels start asleep → Zzz) |
| 7 | `ID_BRIDGE_CTRL` | 2 | 45, 46 | **NOT A GAP** — already in `bridgeTick` (BridgeCtrlLogic) |
| 8 | `ID_SPAWN_TANK_SHELL` (BossTank_KO barrage) | 2 | 65, 66 | **FIXED** (game.js shellSpawner) |
| 9 | `ID_SPAWN_GUARD_ELEV` (relieve ceremony) | 1 | 3 | **FIXED** (game.js elevRelief) |
| 10 | `ID_DESERT_SECURITY` (lock-12 door/compass) | 1 | 69 | **FIXED** (game.js desertSecurity) |

---

## Fix log (all 2026-06-15)

### 1. Land mines (`ID_LAND_MINE`) — rooms 9/64/114/120
- **ROM:** `logic/actors/mine.asm` (InitMines/DrawMine) + `logic/touchenemy.asm:95-126`. Mines are
  placed per room, **invisible unless the MINE DETECTOR item is selected** (5×5 marker); player
  contact destroys the mine (LIFE=0) for `ActorTouchDamage[ID_LAND_MINE-1]` = **0x10**; SFX 0x1C.
- **Fix:** `export-actors.mjs` emits `mines:[{x,y}]`; `game.js` `buildMines`/`mineTick`/`drawMines`.
  Headless: hazards suite (+3 checks).

### 2. Lorry-exit guards (`ID_GUARD_EXIT_LORRY`) — rooms 5/7
- **ROM:** `logic/actors/guardlorry.asm` — a slow guard emerges from a parked lorry, patrols its
  `InitGuardPath2` path, returns. Rooms 5 (1) / 7 (2) previously spawned **no guard at all**.
- **Fix:** exporter emits them as patrol guards on their real path AND consumes a pathIdx slot (the
  ROM counts them — fixes the latent path-misalignment bug). Lorry emerge/return = cosmetic divergence.

### 3. Basement dogs (`ID_DOG_BASEMENT` / `ID_SPAWN_DOG`) — rooms 58–63
- **ROM:** `logic/actors/dogbasement.asm`, `dogspawner.asm` — sleep→run→chase guard dogs.
- **Fix:** exporter emits them as `dogs`, reusing the room-207 `dogTick`. The spawner's
  running-dog-from-the-edge entry + `NumBasementDogs` carry-over count = documented divergence.

### 4/5. Elevator guards (room 3) + guard switch (room 16)
- **ROM:** `ID_GUARD_ELEVATOR` (relieve ceremony), `ID_GUARD_SWITCH` (floor-switch operator).
- **Fix:** emitted as plain stationary guards (LOS + alert + touch). The ceremony / switch scripting
  is a documented divergence. No other path actor shares those rooms, so no path slot is consumed.

### 6. Sleeping signs (`ID_SLEEPING_SIGN`) — room 140
- **ROM:** the Zzz drawn over a sleeping sentinel. Room 140's 3 sentinels each carry one.
- **Fix:** exporter sets `sleeping` on the preceding sentinel; `game.js` already draws the Zzz and
  wakes asleep guards on the alarm (the `sleeping` flag is now propagated through the actors.json path).

### 7. Bridge controller (`ID_BRIDGE_CTRL`) — rooms 45/46 — NOT A GAP
- `bridgeTick` already implements `BridgeCtrlLogic` (the 0x20-iteration flip drives the segments).
  Reclassified as covered; bridges were already confirmed working in the roof playtest.

---

### 8. Tank-shell barrage (`ID_SPAWN_TANK_SHELL`) — rooms 65/66
- **ROM:** `logic/actors/shellspawner.asm` + `tankshell.asm`. While the desert tank (room 67) lives
  (`BossTank_KO` clear), `SpawnTankShell` cycles SFX 0x0B then drops an `ID_TANK_SHELL_AIR` at a
  (every-4th aimed, else random) X; the shell falls SpeedY 6 with an X drift and explodes after a
  0x0A–0x19 flying timer for `ActorTouchDamage` 0x20.
- **Fix:** `game.js` `shellSpawner`/`buildShellSpawner`/`shellSpawnerTick`, gated on the existing
  `tankKO` flag (set when the room-67 tank dies). Air shells reuse the `tankShells` pool (a `timer`
  marks the timer-fused mid-air burst). Headless covered.

### 9. Elevator relieve ceremony (`ID_SPAWN_GUARD_ELEV`) — room 3
- **ROM:** `logic/actors/elevatorguardspawner.asm` + `guardelevator.asm`. The two posted guards are
  periodically relieved: a replacement walks in from the right (X 0xF2) and the "Relieve" text (1)
  prints.
- **Fix:** `game.js` `elevRelief`/`buildElevRelief`/`elevReliefTick`/`drawElevRelief` — a relief
  guard walks in on the relieve timer and the text prints; the posted guards keep their normal
  stationary/LOS/alert AI. **Divergence:** the full two-for-two swap-out is simplified (the posted
  guards don't walk off) — pure flavor, no gameplay stakes.

### 10. Desert security (`ID_DESERT_SECURITY`) — room 69
- **ROM:** `logic/actors/desertsecurity.asm`. Not a visible guard: nearing the desert guards while
  wearing the UNIFORM opens the lock-12 building-2 door ("Come in", text 127); without it the alarm
  triggers. A warning (text 35) prints once; dismissed if Snake came from building 2 (room 73).
- **Fix:** `game.js` `desertSecurity`/`buildDesertSecurity`/`desertSecurityTick` + the
  `SELECTED_UNIFORM` constant; sets the existing `doorBuild2Open` (lock-12 `canOpenDoor`) flag.
  Needs `previousRoom` tracking (added to `setRoom`). Headless covered.
  **Still divergent:** the room-103 compass "get lost" redirect is separate and not ported.

## How to verify / re-run
`node Tools/audit/audit-rooms.mjs` regenerates [room-audit.md](room-audit.md) (the full per-room
table + gap tally) and `Tools/audit/room-audit.json`. After any `export-actors.mjs` change, re-run
that and the 25 headless suites (`web/*.headless.mjs`, 580 checks).
