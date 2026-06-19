## 1. Investigation

- [x] 1.1 The floor graph: 11→15 (stairwell 12-15 → room 8's capture corridor); the 2F
      loop 16-27 and branch 28-36 linked ONLY by elevator 241 (floors 27/15/63); the
      basement chain 57→58-62→63 feeding the same elevator; interiors 139-158/195 behind
      (partly keycard) doors with the ROM's REAL items (goggles 139, bombs 142/153,
      missiles 147, mines 140, cards, ammo)
- [x] 1.2 Actor lists resolved through idxActorsRooms (shared blocks — `ActorPrisoner` =
      (X 0x80, Y 0x60)); guards carry idxRoomPaths patrols; prisoner rooms
      144/145/146/148/152/195 live with real PrisonerTexts (the table already had them)

## 2. Exports

- [x] 2.1 Exporter fix: `--extra` dedups against the exported ORDER, not the BFS `seen`
      set (enqueued-but-capped neighbours — room 15 — were silently dropped)
- [x] 2.2 The world export: +15, 16-19/21/23/26-30/32-36, 139-150/152/153/156-158/195,
      241, 63, 58-62 → 81 rooms (goggles variants included); doors/collision/connections
      auto
- [x] 2.3 `Tools/export-actors.mjs` → actors.json (53 rooms: guards with paths + prisoners)

## 3. game.js

- [x] 3.1 buildGuardRaw: rooms without a demo entry adopt their first ROM guard (real
      position, path converted (Y,X)→(x,y), facing from the first leg, FAST = Snake's
      speed / SLOW = half)
- [x] 3.2 buildPrisoner: real prisoners from actors.json (REAL_PRISONERS retired); DEMO
      rooms keep priority; Grey Fox's blue sheet keyed on room 164 as before
- [x] 3.3 No other code: elevator 241, keycards, lasers, cameras, items, prisoner texts
      all run on the shipped systems

## 4. Checks + docs

- [x] 4.1 check-graph: 72 of 81 rooms reachable from spawn (the 9 = the documented
      islands: water 71-78/105, laser-camera 111); room 8's capture zone reached the ROM
      way; elevator 241 walks 15 ⇄ 27 ⇄ 63; capture suite reads actors.json for Grey Fox
- [x] 4.2 All 14 suites green (352 checks); SESSION-STATE (world map, canonical export,
      hooks notes, gaps); coverage unchanged (a data slice)
