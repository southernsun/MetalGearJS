# Why the faithfulness audit missed things — and what to change

Prompted by issue **#132** (the destroyed power switch drew no wreck). The 2026-06 audit filed
~60 issues and `docs/rom-coverage.md` reports **96% blended** coverage, yet a visible, one-routine
behaviour in an already-audited actor was absent. This is the post-mortem: what the audit's method
could not see, verified against the source rather than guessed.

Two distinct failure modes, with different fixes.

---

## Failure mode 1 — the main bank is outside the denominator

`Tools/coverage/coverage.mjs` builds its denominator from the routine labels of the `.asm` files
listed per component in `coverage-map.json`. That list covers **97 files**, all under `logic/` and
`data/`.

**`Banks0123.asm` is in no component's file list.** It is the main bank: **13,784 lines, 877 routine
labels**, of which **457 are never mentioned anywhere in `web/game.js`**. None of it was ever in the
denominator, so none of it could ever show as `todo`.

That is exactly how #132 hid. The power switch is split across two files:

| Routine | File | In the denominator? | Ported? |
|---|---|---|---|
| `InitPowerSwitch`, `PowerSwitchLogic`, `ChkRevertFade` | `logic/actors/powerswitch.asm` | yes | yes — the fade ramp is exact |
| `ErasePowerSw`, `DrawDestroyPowSw`, `ChkDrawDestroyPS` | `Banks0123.asm` | **no** | **no** |

The Hazards component scored 92% while half of the power switch had never been read. The audit
walked *per-actor files*, and this actor's destruction half does not live in its file.

**Fix applied:** `coverage.mjs` now prints a **"Main-bank blind spot"** section reporting the
label count and how many are uncited. It is deliberately *not scored* — much of the bank is
genuinely out of scope (VDP/VRAM plumbing, bank switching, MSX hardware) and inventing a
denominator would over- or under-claim. The point is that the number is visible instead of absent.

### The sub-class that actually bites: `Erase*` / `Remove*` / `Rest*`

The port is a **full-redraw canvas renderer**; the ROM is a **dirty-rectangle VRAM renderer**. So
the ROM's whole erase/restore family — 82 routines — was reasonably treated as bookkeeping with no
port equivalent. For ~78 of them that is correct: `EraseTextXY`, `EraseDoorNorth`, `EraseLifeBar`,
`RestLasersBack`, `RestoreBackMine` (a 16×16 copy back from a saved-background buffer) all just
undo pixels we never persist.

But **four members paint new art rather than restoring the background**, and those carry real
visual state:

| Routine | Destroyed-state art | Status |
|---|---|---|
| `EraseMetalGear` | `MetalGearTileMap2` | already ported (`mgBgImg`) |
| `RemoveHindD` | `HindDTileMap2` | already ported (the wreck) |
| `DrawDestroyPowSw` | *(unnamed — see below)* | **missed → #132** |
| `EraseWallPrison2` / `EraseBasemWall` | restores saved tiles | correctly N/A |

### Why the power switch specifically, and not the other three

Metal Gear's and Hind D's wrecks are **named graphics** — `MetalGearTileMap2`, `HindDTileMap2`.
Grep finds them; they look like art; both were ported.

The power switch's wreck **has no name at all**. It is two bare coordinate words:

```asm
                    dw 3830h          ; every room except 40
PowSwOffGfxX:       dw 7050h          ; room 40 (the roof floor)
```

with `SY` always `10h`. Nothing in `gfx/`, no label to grep, and the routine that draws it is called
*"Erase"*. Recovering it means knowing that `TileToVramAdd` (`Banks0123.asm:2687`) stages the room
tileset in page 1 as a 32-wide grid (tile `A` at `x=(A&1Fh)*8, y=(A>>5)*8`) and inverting those
coordinates back into tile numbers `46h`/`47h` and `4Ah`/`4Eh`.

**The lesson:** the audit's discovery method is grep-by-name over routine and graphic labels. An
asset addressed by raw VRAM coordinates has no name to find. Any `VDP_Copy_*` whose source is *not*
a save-background buffer is authored content and must be decoded.

---

## Failure mode 2 — "documented divergence" that was never documented

`CLAUDE.md` sets the rule: a divergence is acceptable only when the ROM logic genuinely cannot be
reproduced, and it must then get (1) a call-site comment, (2) a row in
`faithfulness-divergences.md`, (3) a note in the change's tasks. **Unintentional gaps are bugs, not
divergences.**

The escape hatch was used without step (2). Counted across `web/game.js` and `Tools/*.mjs`:

- **24 comment lines** claim an approximation or divergence;
- **`faithfulness-divergences.md` has 11 substantive rows.**

So roughly **13 in-code claims have no index row** — several of them saying the words "documented
divergence" while being documented nowhere.

That is precisely how **#131** happened. `Tools/export-actors.mjs` said:

> the spawner's running-dog-from-the-edge entry + the `NumBasementDogs` cross-room carry-over count
> are approximated by a placed dog (documented divergence)

It was not in the index — and it was not a divergence. `ID_SPAWN_DOG` is an invisible spawner with
`COLLISION_CFG = 0`; exporting it as a placed dog put a phantom dog inside a wall in several
basement rooms. A reproducible behaviour had been written off as an accepted compromise, in a
comment, where nothing would ever re-examine it.

**The lesson:** an unregistered approximation is a *bug that has been talked out of being filed*.
The index is the only thing that forces a second look.

---

## The sweep, run

Action 4 below, carried out. The ROM dispatches every actor death through `KillActor` →
`IdsKillLogic` (a nibble per actor id) → one of **8 kill logics**, covering all 66 actor slots.
Each was read and diffed against the port:

| # | Kill logic | Actors | Result |
|---|---|---|---|
| 0 | `DismissActor0` | 28 (bullets, gas, pitfalls, spawners, …) | plain removal — ok |
| 1 | `KillEnemy` | 22 (guards, dogs, bosses, …) | Big Boss opens the ladders' door (`DoorOpenArray+6Ah`) — **ported** (`forceOpenDoor(107)`) |
| 2 | `KillPrisoner2` | Ellen, Grey Fox, Madnar | `DowngradeRank` — **ported** |
| 3 | `KillPrisoner` | Prisoner1, Prisoner6 | `DowngradeRank` ported; **Jennifer's brother path missing → #134** |
| 4 | `KillJetpack` | 3 jetpack ids | 3-frame explosion then dismiss — **missing → #136** |
| 5 | `ExplosionAnim` | Camera, Land mine, Laser camera | **cameras aren't damageable at all → #135** |
| 6 | `BossDefeatedLogic` | Tank, Metal Gear, Bulldozer, Hind D | countdown, door 62h, SFX 53h, wreck tiles — **ported** |
| 7 | `EraseBitmapActor` | Power switch | **was missing → #132, fixed** |

Below that sits the `DismissActor3..9` drop chain, also checked: Arnold → CARD7 at (48,48),
Coward Duck → CARD8 at (56,112), last Silencer → suppressor at (98,36), plus the Fire Trooper /
Shot Gunner / MGK / Bulldozer / Big Boss status flags and their area-music restore — all present.

**Yield: 3 new issues (#134, #135, #136) from 8 kill logics.** The method works because the
dispatch table is an exhaustive list — every actor is in it exactly once, so nothing can be
"not thought of". Contrast the grep-by-name approach that missed #132.

## Actions

| # | Action | State |
|---|---|---|
| 1 | Report the main-bank gap in `rom-coverage.md` instead of omitting it | **done** |
| 2 | Decode + port `DrawDestroyPowSw` | **done** (#132) |
| 3 | Triage all 13 unregistered approximation claims — each is either a bug to file or a row to add | tracked in **#133** |
| 4 | When auditing an actor, read its `Banks0123.asm` death/removal path, not just its `logic/actors/` file | **done — see above** |
| 5 | Treat any `VDP_Copy_*` from a non-save-buffer source as authored art to decode | convention |

### Checks worth running again

```sh
# routines in the main bank never mentioned in the port
node Tools/coverage/coverage.mjs          # prints the blind-spot section

# in-code approximation claims vs the canonical index
grep -nE '(approximat|divergence|simplif|not decoded|placeholder|stand-in)' web/game.js Tools/*.mjs \
  | grep -E '^\S+: *//'
awk -F'|' '/^\|/ && NF>3 {print $2}' docs/faithfulness-divergences.md
```
