# Faithfulness divergences — deliberate & deferred

The browser port aims to mimic the original Metal Gear (MSX) ROM exactly (see
[`CLAUDE.md`](../CLAUDE.md) → "ROM faithfulness"). Where the port **knowingly** differs, this
file is the record: the deliberate, intentional divergences (which should *not* be "fixed" back
to the ROM), and the small set of comment-only inaccuracies. Behavioural bugs — places the port
diverges *unintentionally* — are not listed here; those are filed as GitHub issues under the
[`faithfulness`](https://github.com/southernsun/MetalGearJS/labels/faithfulness) label.

> **Note:** `.asm` / `file:line` citations refer to the separate MSX disassembly repo
> ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling
> clone at `../MetalGear`. `web/game.js` paths are in this repo.

This file was seeded from the 2026-06 ROM-vs-port faithfulness audit (which filed issues
#27–#89). It is **hand-curated** — add to it whenever a deliberate divergence is introduced.

---

## A. Deliberate divergences (intentional — do NOT "fix")

Each of these reproduces the ROM's *intent* while diverging from its exact code, because a
faithful port either can't be reproduced yet or would reintroduce a bug. They are already
called out in `web/game.js` comments; this table is the index.

| Area | `web/game.js` | ROM source | Divergence & why |
| --- | --- | --- | --- |
| Big Boss aiming / cover | `2387-2402`, `2461-2489` | `bigboss.asm` `BBAimToPlayer` + perpendicular bob | Replaced with `bbAimInward`/`bbAimCover` lunges to fix a "stuck in a corner" bug where the ROM aiming left Big Boss immobile against a wall. |
| Ladder room-cross X-snap | `6942` (`snapToLadderColumn`) | `nextroom.asm` `SetRoomEntryXY` (preserves X) | ROM preserves Snake's X across a ladder room change; the port snaps X to the ladder column so he stays on the shaft if the two rooms' columns differ. Harmless when the real 224–226 shafts are aligned. |
| Room-entry open-floor scan | `3430-3441` (`transition`) | `nextroom.asm` `SetRoomEntryXY` (writes XY unconditionally) | ROM places Snake at a fixed entry point unconditionally; the port scans for an open tile near it, in case the exported collision marks the mirrored entry pixel solid. Robustness only. |
| Roof "Relieve" alert delay | elevator-guard ceremony (`1114-1218`) | `guardelevator.asm` / `elevatorguardspawner.asm` | The ROM's multi-frame alert-delay handshake is collapsed to a single `0xF` delay; the net ceremony timing matches. |
| Save medium | `603-666` | `saveload.asm` cassette `GameProgressBuffer` (+ checksum/verify) | Cassette tape → `localStorage`. The ROM's tape load/verify flow has no faithful browser equivalent. SAVE/LOAD reuse the pause-mode typing buffer. |
| Text-window grow-in | text window (`748-873`) | `textboxappear.asm` | The animated window grow-in is omitted; the box appears at full size. |
| Intro black beat | intro scene `status -1` (`3847-4017`) | `introscene.asm` | A short black beat was added to the intro that the ROM does not have, to smooth the JS transition. |
| Patrol look-around turn (Down/Right) | `PATROL_TURN` + patrol logic (`GUARD_LOOK_TICKS`) | `guard.asm:144` `GuardPatrolTurn` (`xor 2`) | The look-around turn (#39) is exact for Up→Left / Left→Up, but the ROM's `Direction xor 2` yields **out-of-range** direction values (0 / 6) for Down/Right facings — a genuine ROM bug (it then indexes the LOS jump-table and sprite table out of bounds). We port the routine's evident ±90° intent instead, completing the symmetric pair Down↔Right. The ~50% walk-through skip and the two-phase 0x10/0x10 timing are faithful. |
| Binoculars (telescope) | `7502-7610` (`enterBinoculars`/`exitBinoculars`/`binocOnKey`/`drawBinoculars`) | `Banks0123.asm:12256-12603` `BinocularMode`/`DrawBinocRoom`/`ExitBinocularMode` | **CORRECTED 2026-08-07 (#124):** this row used to claim "exit returns to play, not the equipment menu" as intentional, reasoned as *"the port's moving = selecting / close = play menu model would re-enter binoculars immediately on the menu close"*. Re-entering immediately is exactly what the ROM does — `ExitBinocularMode` restores `GameMode 3` (`SwitchGameMode`, `:12425`), so the telescope stays active until a different item is selected. That was a **bug, not a divergence**, and is now ported. Two intentional differences remain: (1) no `EnemyList`/power/radio/alert backup-and-restore — the ROM needs it because `DrawBinocRoom` overwrites shared room RAM, but the port renders from a transient snapshot and never mutates play state; (2) F3 (enter/exit) is remapped to closing the item menu / Escape-E-Q, as the browser has no MSX function keys. The peek state machine, `TimerBinocular` 0x80, the exit lock while peeking (#114), the full `ClearPage0` wipe (#117), the own-room actor hiding (#87), banner/arrow positions (#115/#116), and the reticle art are all faithful — the reticle is now the **exported** `SprTarget` asset (`assets/target.png`, `--export-target`), not hand-drawn (#118). |

> If you add a new deliberate divergence, (1) comment it at the call site in `web/game.js`,
> (2) add a row here, and (3) note it in the change's OpenSpec tasks/notes — per `CLAUDE.md`.

---

## B. Comment-only inaccuracies (behaviour is correct; the comment is wrong)

These are *not* behavioural bugs — the port matches the ROM — but a nearby code comment
mis-describes the ROM. Cheap doc fixes; left here so they aren't re-investigated as bugs.

| `web/game.js` | Problem |
| --- | --- |
| `3758` | Comment labels the demo-abort behaviour a divergence, but `ChkAnykeyStart` runs for `GameStatus < 3` (incl. demo), so the ROM also aborts on any key — behaviour matches. |
| `4868` | Stale comment ("medium 0.75, fast 1.0"); the actual `actors.json` speeds (0.5/0.625/0.75 = ROM `WalkSpeeds` 0x100/0x140/0x180) are correct. |
| IntroScene13 area | Comment over-attributes a checkpoint to `IntroScene13`. |

(Several hex-value comments that *did* describe a real behavioural divergence were filed as
issues instead — e.g. the poison `0x80` justification → #29, `ALERT_ICON` → #57, `titleCnt`
`0x20` → #45.)

---

### Sound-driver timing we cannot observe

Two waits in the ROM are keyed on the PSG driver reporting a track FINISHED (`SoundWorkArea+2`).
The port plays audio through WebAudio buffers and has no equivalent signal, so both are replaced by
a fixed span. Tracked in **#35**; they were asserted in code comments for months without a row here,
which is exactly the gap #133 was opened for.

| Area | ROM behaviour | Port | `web/game.js` |
| --- | --- | --- | --- |
| SFX tail before a state change | waits for the sound entry to finish | fixed span | `~169` |
| GAME OVER screen | waits for the game-over music to finish, then RebootGames | `GAME_OVER_TICKS` (0x100) | `~6956` |

## C. Deferred until a prerequisite system exists

These ROM behaviours can't be ported faithfully yet because a system they depend on isn't
modeled. They are an **acceptable divergence** under `CLAUDE.md` *only until* the prerequisite
lands. Tracked in GitHub issue **#90** (and the two latent ones already have their own issues).

| ROM behaviour | Blocked on | Tracking |
| --- | --- | --- |
| Aimed-shot speed difficulty addend (`Dificulty*8 + param`) | A real difficulty value — the formula itself is now ported with `DIFFICULTY = 0` | #60 |

**Cleared 2026-08-08:** the **Jennifer dead-brother** suppression landed with #134 — `KillPrisoner`
now sets `JennifBrotherDead` (room 193's third prisoner, `IDX_SAME_ID == 3`), and both
`ChkRadioCalls` and `ChkReplyJeniffer` read it.

**Cleared 2026-08-07:** the radio **antenna** requirement and the radio **MapZone** gates both
landed once `idxMapZones` was ported (`mapZoneFor`, #78) — that also wired `SetAreaMusic5`'s
transmitter-alert exemption. The **rooms 16/116 electric floors** turned out to be live already
(room 16 via its `ID_GUARD_SWITCH` operator, room 116 via a normal `ID_POWER_SWITCH`).

When a prerequisite system is implemented, port the corresponding behaviour and remove its row
here.
