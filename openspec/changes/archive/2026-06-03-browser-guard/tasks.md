> Asset status: all guard assets are now decoded **from the ROM** — guard sprite, the "!"
> alert icon, and the Alert music.

## 1. Export: guard sprites — decoded from the ROM ✓

- [x] 1.1 Decoded `SprGuard` (32 sprites) and the actor colour mapping (ID 4 → `ActorSprColors3` = index 2 + CC|0Dh). **Layout (confirmed by inspecting all 32 sprites):** sprites 0–7 = upper bodies as OR-pairs per direction `(0,1)=down (2,3)=left (4,5)=up (6,7)=right`; sprites 8–31 = lower bodies (legs), OR-pairs at `8 + phase*8 + 2*dir` for 3 leg phases. A frame = `upper[dir]` over `lower[dir][phase]` (16×32)
- [x] 1.2 Added `--export-guard` to SpriteMover: composites the 12 frames (4 dir × idle/walk1/walk2 leg phases) in the guard's colours → `web/assets/guard.png` (192×32) + `guard.json` (atlas, anchor 8,30)
- [x] 1.3 Fallback (examples-sheet crop) not needed — decoded straight from the disassembly
- [x] 1.4 Verified the guard frames render correctly in-game (green guard, decoded contact sheet checked; final up/down facing to confirm in the manual pass)

## 2. Export: alert icon + alert music — decoded from the ROM ✓

- [x] 2.1 Decode the alert "!" icon → `web/assets/alert-icon.png` (16×16, transparent). It is **split across two graphics**: the BOTTOM halves are in `gfxAlertIcon` (`alerticon.asm`), the TOP halves are the **last 4 tiles of `GfxItems`** (`items.asm`) — both 3bpp via `ColorsItems`, stored oriented correctly. Normal alert = items-tail[0,1] over gfxAlertIcon[0,1]; red alert = items-tail[2,3] over gfxAlertIcon[2,3]
- [x] 2.2 Added `--export-alert` to ThemeOfTaraPlayer: renders MUSIC `0x32` ("Alert") → `web/assets/alert.wav` (fixed 8 s, normalized to 0.9, loops in-browser)
- [x] 2.3 Verified: `alert-icon.png` renders correctly above the guard in-game; `alert.wav` is a valid 8 s / 44.1 kHz / 0.9-peak WAV

## 3. Browser: guard entity + patrol

- [x] 3.1 Load `web/assets/guards.json` (room → guard `{x,y,dir,speed,path:[…]}`) and the guard spritesheet `guard.png`/`guard.json` at startup
- [x] 3.2 Author a `guards.json` with one guard in the start room (room 0) on a horizontal patrol loop over the open lower corridor
- [x] 3.3 Build the active room's guard on `setRoom` (`buildGuard`); none when the room has no guard
- [x] 3.4 Patrol movement: step toward the next waypoint at `speed`, snap + advance with a wait, loop; facing from movement direction
- [x] 3.5 Draw the guard each tick from the decoded spritesheet (directional walk frames; KO'd guard drawn rotated/lying), room → doors → guard → Snake order

## 4. Browser: line-of-sight detection

- [x] 4.1 Front check (Snake on the guard's facing side) + perpendicular band (±8 up/down, ±6 left/right), ported from `chkdiscover.asm`
- [x] 4.2 Wall-blocked LOS: step tiles from guard toward Snake along the facing axis against the room collision map; any solid tile blocks sight
- [x] 4.3 Trigger only when front + band + clear-LOS all hold; skip when the guard is KO'd or already alerted

## 5. Browser: alert state

- [x] 5.1 On detection, enter the alert state once: stop the patrol, face Snake
- [x] 5.2 Draw the decoded "!" alert icon (`alert-icon.png`) above the guard while alerted
- [x] 5.3 Loop the decoded Alert music (`alert.wav`) once on alert (not retriggered each frame); stop it on KO / room change
- [x] 5.4 Keep the alert latched for the slice (no chase/calm-down), cleared only on KO

## 6. Browser: punch — stun + kill (ROM-faithful)

- [x] 6.1 Hitbox ported exactly from `logic/punchenemy.asm` (ChkArea): directional punch area, 12px radius (strict <) at a 12px facing-direction offset; no separate facing check (the area encodes it)
- [x] 6.2 A connecting punch freezes the guard (`StunnedCnt = 0x40`, 60Hz): while stunned he neither patrols nor detects, does the small `StunnedBounce`, then resumes at 0; re-punch ignored while `StunnedCnt >= 0x38`
- [x] 6.3 Punch count accumulates; the 3rd connecting punch kills the guard (`ChkKillPunching`) and removes him from the room
- [x] 6.4 A stunned/killed guard cannot raise an alert (detection skipped while frozen / when gone)

## 7. Verification and polish

- [x] 7.1 Headless smoke test: room 0 loads, guard renders, no console errors (only the expected autoplay log)
- [x] 7.2 Simulate (node) detection — front/band/clear → detected; behind / out-of-band / wall-blocked → not. 6/6 cases pass
- [x] 7.3 Manually verify in a browser: guard patrol, walk into sight → alert (icon + sound); punch once → he freezes; stop → he resumes walking; punch three times → he dies/disappears; punch-before-sight → no alert; hitbox matches the original
- [x] 7.4 Movement/traversal/doors still work unchanged with the guard present (guard is additive; render verified)
- [x] 7.5 Set sensible defaults for guard speed/wait, LOS band/range, and patrol path; final feel is part of the manual pass
- [x] 7.6 Only static assets at runtime so far (guards.json + existing); guard/alert assets add files once authored
