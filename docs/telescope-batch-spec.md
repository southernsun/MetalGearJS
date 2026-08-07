# Telescope / binoculars batch — fix spec (#114, #117, #118 + #87, #88)

Spec for the recon-telescope batch. Source investigation done against `web/game.js` and the MSX
disassembly in `../MetalGear` (`Banks0123.asm` `BinocularMode`/`BinocularLogic`/`DrawBinocRoom`
12256–12603, `logic/menuequipment.asm` 299–360, `gfx/targetspr.asm`).

## Status found on entry

Commit `44006f7` was tagged "#115 #116" but in fact landed **four** telescope fixes: it also
implemented #114 (exit gate) and #117 (full-screen clear), plus the #118 reticle bitmap, and added
`web/binoc.headless.mjs` covering all of them. So two of the three requested issues need
**verification + closure**, not new code. The batch as scoped:

| # | State found | Work required |
| --- | --- | --- |
| #114 | Implemented + tested (`game.js:7546`, binoc suite) | Verify against ROM, post test steps, close |
| #117 | Implemented + tested (`game.js:7574-7575`, binoc suite) | Verify against ROM, post test steps, close |
| #118 | Implemented as an **inline hand-decoded bitmap**; the issue's own follow-up comment records the verification debt | Re-decode via the authoritative tool, ship as an exported asset, fix the tool's catalogue entry |
| #88 | Duplicate of #114 (same routine, same gate) | Close as duplicate |
| #87 | **Live bug** in the same ROM routine — pulled in per CLAUDE.md "read the surrounding code on BOTH sides" | Fix |

---

## #114 — exit locked while peeking (verify)

### ROM
`BinocularMode` (`Banks0123.asm:12256-12264`):

```
BinocularMode:
    ld a,(BinoculStatus)
    dec a
    jr nz,BinocularMode2      ; != 1 => showing an adjacent room, cannot exit
    ld a,(FKeysTrigger)
    and 4                     ; F3?
    jp nz,ExitBinocularMode
```

`BinoculStatus == 1` means the view is the player's own room (`BinocularDir` 1 is copied into it by
`DrawBinocRoom2`, `Banks0123.asm:12586-12587`). While a neighbour is shown the player is locked in
until `TimerBinocular` (0x80) elapses.

### Port
`web/game.js:7542-7548` — `binocOnKey` gates both the direction latch and the exit on
`binoc.mode === 'idle'`. **Faithful.** Covered by `web/binoc.headless.mjs` (3 asserts: Escape and
`q` ignored mid-peek, Escape exits when idle).

### Verdict
Already fixed. Verify in play, then close.

---

## #117 — full-screen clear (verify)

### ROM
`DrawBinocRoom` (`Banks0123.asm:12543-12546`) starts with `DisableScreen` → **`ClearPage0`** →
`ClearSprAttr`, i.e. the whole 212-line VRAM page is wiped before the examined room is rebuilt. The
HUD strip is not redrawn in binocular mode — it is where `txtTelescope` (#116) and the direction
arrow (#115) are printed.

### Port
`web/game.js:7574-7575`:

```js
ctx.clearRect(0, 0, VIEW_W, VIEW_H + HUD_H);                    // ClearPage0 — 212 lines
ctx.fillStyle = '#000'; ctx.fillRect(0, VIEW_H, VIEW_W, HUD_H); // strip backdrop
```

**Faithful.** Covered by `web/binoc.headless.mjs` (2 asserts: full-height `clearRect`, black strip
`fillRect`).

### Verdict
Already fixed. Verify in play, then close.

---

## #118 — reticle art: close the verification debt

### What the issue's follow-up already established
The premise ("the ROM has no centre cross") was wrong — the decoded art *does* have a continuous
centred plus with diamond bulges and tick marks, and `BINOC_RETICLE` in `game.js` reproduces it. But
the comment left two items open, both of which CLAUDE.md explicitly requires:

1. The bitmap was produced by a **hand-rolled RLE script**, not by the repo's authoritative decoder.
2. It lives **inline in `game.js`** instead of as an exported asset under `web/assets/`.

### Decode ground truth (established for this spec)

`SprTarget` (`gfx/targetspr.asm`) is `dw 0F880h` + 98 RLE bytes. Running the real `UnpackGfx`
semantics (`Banks0123.asm:3684-3725` — 2-byte VRAM header; control `B`: `B == 0` end, `B < 0x80`
run of `B`, `B == 0x80` new-address marker, else literal of `B & 0x7F`) yields:

- **128 decoded bytes at `0xF880`–`0xF8FF`, contiguous, no embedded `0x80` address marker.**
- The sprite pattern generator base is `0xF800`, so this is patterns **0x10–0x1F** = 4 × 16×16
  sprites at patterns `10h/14h/18h/1Ch` — exactly the four `BinocularSprAtt` entries.

`BinocularSprAtt` (`logic/menuequipment.asm:355-360`):

```
db 50h, 70h, 10h, 0    ; Y=80  X=112  pattern 10h
db 50h, 80h, 14h, 0    ; Y=80  X=128  pattern 14h
db 60h, 70h, 18h, 0    ; Y=96  X=112  pattern 18h
db 60h, 80h, 1Ch, 0    ; Y=96  X=128  pattern 1Ch
```

= a 2×2 grid spanning **(112,80)–(143,111)**, i.e. 32×32 centred on the 256×192 view. The port's
`drawBinocReticle(VIEW_W>>1, VIEW_H>>1)` with `x0 = cx-16, y0 = cy-16` lands on exactly that origin.

`BinocularSprCol` is flood-filled with `0Eh` (white) for 0x40 bytes
(`logic/menuequipment.asm:343-347`) — the reticle is **monochrome white**.

### Tool-catalogue bug (fix the doc, per CLAUDE.md)
`Tools/MetalGearGfxViewer/GfxCatalog.cs:114` classifies `targetspr.asm` as
`GfxSpec(4, compressed: true, palette: "Room 0")` — **4bpp background graphics**. The disassembly
says otherwise: `LoadSprTarget` (`Banks0123.asm:3226-3232`) unpacks it to the **sprite pattern
table**, and it is rendered as 1bpp hardware sprites flood-filled white. The catalogue entry must be
corrected to 1bpp/sprite. The disassembly wins.

### Work
1. Add `--export-target` to `Tools/MetalGearSpriteMover` (the sprite exporter that already owns this
   decode path: `SnakeSprites` RLE + `SpritePixel` 16×16 quadrant layout), modelled on `ExportZzz`.
   Writes `web/assets/target.png` (32×32 white-on-transparent) + `target.json`.
2. `web/game.js`: load `target.png` and blit it; drop the inline `BINOC_RETICLE`.
3. Correct `GfxCatalog.cs:114`.
4. `web/binoc.headless.mjs`: assert the blit position/size against the ROM attribute table instead of
   counting inline `'#'` characters.

### Acceptance
The exported PNG is byte-identical in shape to the previously-inline bitmap (proving the hand-rolled
decode was right), the reticle draws from the asset at (112,80) 32×32, and no reticle geometry
remains hand-written in `game.js`.

---

## #87 — guards must be hidden in the own-room (idle) view

### ROM
`DrawBinocRoom` (`Banks0123.asm:12570-12581`) — after `SetupEnemyRoom` has populated the examined
room's actors:

```
    call SetupEnemyRoom
    ld   a,(BinocularDir)
    dec  a                    ; is this the player's own room?
    jr   nz,DrawBinocRoom2    ; no (2..5 = a neighbour) -> keep the enemy sprites
    ld   hl,EnemySprAttRAM
    ld   de,EnemySprAttRAM+1
    ld   (hl),0E0h
    ld   bc,57h
    ldir                      ; Remove sprites from player's room
```

`0E0h` is the off-screen Y value, so every enemy sprite attribute is parked off-screen: **in the
idle view (own room) no actors are drawn.** Only when peeking a neighbour (`BinocularDir` 2..5) do
they show — the telescope is for scouting *adjacent* rooms.

Note what is *not* wiped: `AddRoomItems`, `AddDoorsData`/`DrawDoors` and `RenderRoom` run before
this and are untouched, so the room image, its items and its doors still draw in the idle view. Only
the enemy sprite attributes are cleared.

### Port
`web/game.js:7580` calls `drawRoomItems(); drawDoors(); drawGuard();` unconditionally, so home-room
guards are visible in the idle view.

### Fix
Call `drawGuard()` only while peeking (`binoc.mode === 'show'`), leaving items and doors alone.

### Test steps
1. Enter a room that has a visible guard, equip the binoculars and raise them (E menu → binoculars →
   close).
2. Do **not** press a direction — stay on your own room.
3. **Expected (ROM):** the room, its items and its doors draw, but **no guards**.
4. Press a direction toward a valid neighbour: that room's guards **do** draw.
5. **Before fix:** the home room's guards were visible in step 3.

---

## #88 — duplicate of #114

Same routine (`BinocularMode` 12256-12264), same gate, same fix. Close as a duplicate of #114.

---

## Order of work

1. #87 fix (smallest, self-contained behaviour change).
2. #118 exporter + asset + catalogue correction + test rewrite.
3. Re-run all 28 headless suites.
4. Post test steps / verification notes to #114, #117, #118, #87; close #88 as duplicate.

---

## Result (2026-08-06)

- **#87** — `web/game.js` `drawBinoculars` now gates `drawGuard()` on `binoc.mode === 'show'`, with
  the `DrawBinocRoom` 12572-12580 citation at the call site. `drawRoomItems`/`drawDoors` deliberately
  stay ungated (the ROM only wipes `EnemySprAttRAM`).
- **#118** — new `--export-target` in `Tools/MetalGearSpriteMover` (`WebExporter.ExportTarget`), fed
  by two new `SnakeSprites` entry points: `DecodeLabelFrom` (RLE-decode a label in any gfx .asm) and
  `HeaderWordFrom` (read the `dw` VRAM header so pattern numbers can be rebased on the block's first
  pattern — `(0F880h − 0F800h)/8 = 10h`). Writes `web/assets/target.png` (32×32) + `target.json`
  (`width/height/originX/originY/sprites`). `game.js` loads and blits it; the inline `BINOC_RETICLE`
  bitmap is gone. `GfxCatalog.cs` corrected from 4bpp/"Room 0" to 1bpp sprite mode, and
  `docs/tools/gfx-viewer.md` updated to match.
- **Verification** — the exported PNG was compared pixel-by-pixel against the previously-inline
  bitmap: **32×32, 220 lit pixels, 0 differing pixels, 0 non-white lit pixels.** The hand-rolled
  decode had been correct; it is now produced by the repo's own sprite decoder instead.
- **Tests** — `web/binoc.headless.mjs` extended from 20 to 25 checks (asset blit + origin + the
  `target.json`-vs-`BinocularSprAtt` geometry + "no hand-drawn primitives remain" + the three #87
  assertions). All 28 suites green.
- **#114 / #117** — confirmed faithful against the ROM as analysed above; no code change needed.
- **#88** — closed as a duplicate of #114.
