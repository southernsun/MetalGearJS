# Guard alert system — ROM analysis vs the port

A full read of the ROM's alert machinery and a diff against `web/game.js`, covering the four things
that were reported as wrong: **normal vs high alert**, **how many guards appear and when**, **when
they disappear**, and **which rooms they follow you into**.

Sources: `logic/setalert.asm`, `logic/actors/chkdiscover.asm` (`GuardSetAlarm`),
`Banks0123.asm` (`ChkRespawnEnemy` :6559, `ChkAlarmEnd` :6635, `TransformAlertGuard` :6726,
`DecRespawnGuards` :13214), `data/respawninfo.asm`.

---

## 1. The ROM model

### 1.1 Two independent "red" concepts

They are easy to conflate and the port did:

| | Set by | Effect |
| --- | --- | --- |
| **`RedAlertFlag`** | `GuardSetAlarm`: the `RedAlertRooms` bit for rooms < 128, else 0 | red alert **icon**, and `AlertRespawnTimer = 1Eh` instead of 0 — i.e. *whether reinforcements are armed at all* |
| **Red alert *music*** (`0x2F`) | `SetAlertMode`: only when the triggering actor is `ID_CAMERA` or `ID_LASER` | music only |

So a guard sighting in a red-alert room gets the red icon **and** reinforcements, but the *normal*
alert track. A camera anywhere gets the red *track*. (Already handled — issue #59.)

### 1.2 Raising the alarm

`GuardSetAlarm` (`chkdiscover.asm:327`) — `ret nz` if already alerted, so an alarm is never
re-classified while one is up. Then:

- `RedAlertFlag` = `RedAlertRooms` bit (rooms < 128 only; **rooms ≥ 128 are always low alert**).
- `AlertRespawnTimer` = **0 for a normal alert, `1Eh` for a red alert**.
- `SetAlert` → `SetAlertMode` (`setalert.asm`): `AlertMode = 1`, `RoomAlert = Room`,
  and `NumRespawnGuards = (highest card owned) + 3`, or **0 in room 216**.
- Finally `jp TransformAlertGuard` — unless the trigger was a camera.

`NumRespawnGuards` is a **kill budget**, not a spawn count: `DecRespawnGuards` (`:13214`) decrements
it when a reinforcement-type actor dies, clamped at 0.

Other trigger sources supply their own timer via `SetAlertModeRespawn`: gunfire/laser `5Ah`,
camera `28h`, desert `1Eh`, elevator ceremony `3Ch`.

### 1.3 TransformAlertGuard — why the counts work

`TransformAlertGuard` (`:6726`) sets `ACTOR.ID = RespawnInfo[Room*3]` on the guard that alerts. So an
alerted guard **becomes the room's respawn type**, and every later `CountEnemyType(respawnId)` sees
alerted originals *and* spawned reinforcements — but **not** guards still on patrol.

It returns early for **rooms ≥ 188**: no transform there.

### 1.4 ChkRespawnEnemy — how many appear, and when

```
AlertMode == 0                     -> ret
AlertRespawnTimer == 0             -> ret          ; a NORMAL alert never respawns
dec AlertRespawnTimer ; != 0       -> ret
AlertRespawnTimer = ((r ^ TickCounter) & 0Fh) + 14h   ; next in 20..35 iterations
Room >= 188                        -> ret          ; no respawning from here on
A = RespawnInfo[Room*3] ; A == 0   -> ret          ; room respawns nothing
B = 3 if A == ID_GUARD_REDALERT or A == ID_JETPACK, else 4      ; simultaneous cap
CountEnemyType(A) >= B             -> ret          ; counts THAT TYPE only
loc = RespawnInfo[Room*3 + (TickCounter bit 0 ? 2 : 1)]
AddEnemy(A, loc)                                    ; spawn the type the table names
```

`respawninfo.asm` in use: **id 10** `ID_GUARD_ALERT` (68 rooms), **id 11** `ID_GUARD_REDALERT`
(21 rooms), **id 22** `ID_JETPACK` (7 rooms: 40, 41, 42, 44, 48, 89, 92).

### 1.5 ChkAlarmEnd — when they disappear and which rooms they follow you into

```
TransmiTaken            -> ret            ; bugged: the alarm NEVER ends
AlertMode == 0          -> ret
Room >= 0F0h            -> StopAlert      ; entering an ELEVATOR ends it
if AlertRespawnTimer != 0:                ; reinforcements armed
    NumRespawnGuards != 0 -> ret          ; FOLLOWS YOU EVERYWHERE until the budget is spent
    AlertRespawnTimer = 0
    RoomAlert = Room                      ; budget spent -> re-home the alert to where you are
    ret
; AlertRespawnTimer == 0:
Room != RoomAlert       -> StopAlert      ; leaving the alert room ends it
Room == 216             -> count ID_GUARD_REDALERT
Room >= 188             -> StopAlert
else                    -> count RespawnInfo[Room*3]
CountEnemyType == 10h   -> StopAlert      ; too many
CountEnemyType != 0     -> ret            ; still enemies of that type
                           StopAlert
```

**So the answer to "which rooms do they follow you into":**

- **Normal alert** (no red bit, no noise/camera seed): `AlertRespawnTimer` is 0, so the alarm ends
  the moment you leave the trigger room. They never follow.
- **High alert** (red room, or any trigger that seeds a timer — gunfire `5Ah`, camera `28h`): the
  alarm follows you through **every** room until `NumRespawnGuards` reinforcement kills are banked.
  Only then does it re-home to your current room and become a normal "clear this room" alert.
- **An elevator always ends it.** **Rooms ≥ 188** end it as soon as respawning is done.

---

## 2. Diff against the port

| # | Rule | Port before | Verdict |
| --- | --- | --- | --- |
| 1 | Alert level from `RedAlertRooms`, rooms ≥ 128 low | correct | ok |
| 2 | Red music only for camera/laser | correct (#59) | ok |
| 3 | `NumRespawnGuards` = highest card + 3, 0 in room 216 | correct | ok |
| 4 | Per-source respawn seeds (0/1Eh/5Ah/28h/3Ch) | correct (#28) | ok |
| 5 | Alarm follows while budget remains; re-homes when spent | correct | ok |
| 6 | Elevator ends the alarm | correct | ok |
| 7 | Respawn cadence `((r^tick)&0Fh)+14h` | correct | ok |
| 8 | **Simultaneous cap keyed on the respawn ENEMY ID** (3 for 11/22, else 4) | keyed on `redAlertFlag` | **wrong in 29 of 96 rooms** |
| 9 | **Cap counts only `CountEnemyType(respawnId)`** | counted `guards.length` — every guard, including ones still on patrol | **wrong**: patrolling guards ate the budget, so fewer reinforcements arrived than the ROM sends |
| 10 | **Spawn the type `RespawnInfo` names** | always a plain guard | **wrong in 7 rooms** — 40/41/42/44/48/89/92 should send **jetpack** troopers |
| 11 | Rooms ≥ 188 (except 216) `StopAlert` once respawning is off | missing | **wrong** |
| 12 | Room 216 counts `ID_GUARD_REDALERT` | fell back to "all guards" | wrong (minor) |
| 13 | `CountEnemyType == 10h` → StopAlert | missing | cosmetic, unreachable in practice |

Items 8–12 are fixed below. 13 is left out deliberately: the cap in 8 means the count can never
reach 16.

---

## 3. Changes made

- `respawnTick` now reads `info.id`, takes the cap from it (`3` for `ID_GUARD_REDALERT`/`ID_JETPACK`,
  else `4`), and counts **only the respawn type** — alerted guards plus reinforcements, which is the
  port's equivalent of `TransformAlertGuard`'s re-ID, or live jetpacks when the type is 22.
- Rooms whose `RespawnInfo` id is `ID_JETPACK` now spawn a **jetpack trooper** (`InitJetpack`: flying,
  facing left, `COLLISION_CFG = 2`) instead of a foot soldier.
- `chkAlarmEnd` gained the rooms ≥ 188 rule and the room-216 special case.

## 4. Verified numbers

```
respawn ids in use: {10: 68 rooms, 11: 21, 22: 7}
rooms where the old cap disagreed with the ROM: 29
jetpack-reinforcement rooms: 40, 41, 42, 44, 48, 89, 92
respawn entries at room >= 188: none
```
