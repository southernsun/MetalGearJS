## 1. game.js

- [x] 1.1 `guards[]` array + makeGuard; buildGuardRaw spawns EVERY actor-list guard (demo
      rooms stay single); the `guard` alias synced on build/update/kill
- [x] 1.2 updateGuard loops updateGuardOne (parameter-shadowed body; guardSeesSnake gets
      the explicit guard); killGuard(g) splices; buildGuard alerts all on alert-room entry
- [x] 1.3 chkTouchGuard / tryPunchGuard (one victim per swing) / drawGuard loop;
      shotTarget spreads over all guards; chkAlarmEnd clears only when guards.length === 0

## 2. Checks + docs

- [x] 2.1 alarm.headless.mjs: +6 multi-guard checks (both spawn with paths, independent
      patrols, the alarm alerts all, one-down keeps the alarm, the alias tracks the
      survivor, cleared ends it); the 5 alias-kill sites also empty the array
- [x] 2.2 All 15 suites green (376 checks); SESSION-STATE updated

## Playtest

- [x] USER PLAYTEST CONFIRMED (2026-06-11): room 18 (5 guards) — independent patrols,
      per-guard sighting/alarm pull, per-guard kills, alarm ends on the LAST kill,
      full respawn on re-entry

