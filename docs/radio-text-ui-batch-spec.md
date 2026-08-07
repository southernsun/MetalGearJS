# Radio / text / UI batch — fix spec (#43–#89 cluster)

The faithfulness-audit radio/text/UI cluster: #43, #44, #45, #68, #75–#86, #89. Every claim
re-verified against `../MetalGear` before changing anything.

## The coordinate rule that runs through this batch (and a shipped bug)

Two ways a screen coordinate reaches `DrawChar` / `VDP_Copy_Byte`, and they look opposite:

- **From a data table** — `PrintTextGetXY` does `ld d,(hl) / inc hl / ld e,(hl)`, reading the two
  bytes in memory order. A `dw 0C420h` stores **20h, C4h** (little-endian), so `D = 20h` and
  `E = C4h`. Hence "a `dw` word is `0xYYXX`": low byte = X, high byte = Y.
- **From an immediate** — `ld de, 0C0C4h` loads `D = C0h`, `E = C4h` directly. No endianness
  involved.

Both consumers take **D = X, E = Y** (confirmed by `DrawItemHUD`'s own comment
`ld de, 0E0C2h ; DX,DY`, and by `DrawChar` passing `de` straight to `VDP_Copy_Byte`). Calibration
holds: `txtLife dw 0C110h` → bytes 10h,C1h → (16,193); `txtClass dw 0C908h` → (8,201).

**Consequence — #115 shipped a transposition.** The telescope direction arrow is drawn by
`DrawChar` with an **immediate**:

```
    ld   de, 0C0C4h            ; XY
    ld   c, 0FFh
    call DrawChar
```

That is **X = 0C0h = 192, Y = 0C4h = 196**. The #115 fix applied the *`dw`* rule to an immediate and
shipped **(196,192)**. Corroboration: `txtTelescope dw 0C420h` → (32,196), so the banner and the
arrow share the line Y=196 — which the transposed value breaks. Corrected here to **(192,196)**.

---

## Verified findings

| # | ROM source | Verdict |
| --- | --- | --- |
| #43 | `ChkRadioCalls` (`Banks0123.asm:1689-1743`) | Confirmed. Ring is suppressed when the **first** caller can't answer: Schneider captured, or Jennifer with `Class != 3` / dead brother, or MapZone ≥ 5 without the antenna. |
| #44a | `DrawItemHUD` (`:2270-2311`) | Confirmed. Card digit drawn via `DrawChar` at `ld de,0F0C8h` → **(240,200)**, only for `SELECTED_CARD1 ≤ item < SELECTED_RATION`. |
| #44b/c | `TW_Wait` (`:8143-8198`) | Confirmed, and the full branch order matters — see below. |
| #45 | `GS_KonamiLogo` (`:10090-10105`), `SetDemoPlay3` (`gamedemo.asm:92-101`) | Confirmed. `xor a / jp NextSubstatusT` seeds `WaitCounter = 0`, and `dec (hl) / ret nz` then wraps → **256** iterations. Demo sets `AreaMusic = 2Ch`. |
| #75 | password tables | Confirmed — space code 0x47 is a real buffer char. |
| #76 | `ChgRadioFreq2` (`:10923-10929`) | Confirmed: `ld (hl),0 / inc hl / ld (hl),0` clears `AutoReplyDone` **and** `ReplyRequested`. |
| #77 | `RadioIdle` (`:10742-10751`) | Confirmed: re-fires SFX 0x50 at the top of idle when `RadioCmd != 0` (and not ending). |
| #79 | `TW_Wait` | Confirmed — mode 1 checks keys *before* branching to the timer. |
| #80 | `TextBoxExit` (`:8301-8324`) | Confirmed: `ld a,(SkipTextF) / and a / ret nz` before any flag set. |
| #81 | `DrawWeaponHUD` (`:2110-2120`) | Confirmed: base `ld de,0A0C2h` → (160,194); a 16px weapon adds **+8 to X** → 168. |
| #82 | `TW_PrintChar2` (`:7986-7994`), `TW_PrintChar6` (`:8035-8043`) | Confirmed: text 45 → mask **7**; print SFX 0x23 suppressed when `EndingStatus == 10`. |
| #83 | `IntroScene10b` (`introscene.asm:288-299`) | Confirmed: `ld h,1 / ld (PlayerMovSpeed),hl` → **1.0 px**. |
| #84 | `GoToMenu` (`:10649-10653`) | Confirmed: `ld a,28h / call SetSoundEntry` — stop SFXs. |
| #85 | `ElevatorRoomLogic` (`elevatorroom.asm:11-28`) | Confirmed **and inverted**: `and 4 / ld a,3 / jr z / inc a` — holding **Left** yields DIR_RIGHT (4), Right yields DIR_LEFT (3). Neither held → 0 (no change). |
| #86 | `CaptureSetup` (`capturescene.asm:38-49`) | Confirmed: `ld a,5Ch / ld (MusicToSet),a` — a fade, not a stop. |
| #89 | `GetMenuCursor4` (`:11593-11604`) | Confirmed: walks entries from index 1, stops at the first **empty** one; if none empty, index 1. |

### `TW_Wait` in full (drives #44b, #44c and #79)

```
TW_Wait:
    a = SkipTextMode
    cp 2 ; jr z, TW_Wait2         ; mode 2: no key check, no icon, timer only
    ControlsTrigger & 20h (M)  -> advance      ; modes 0 AND 1 accept keys
    FKeysTrigger    & 20h (RET)-> advance
    a = SkipTextMode ; dec a ; jr z, TW_Wait2  ; mode 1: keys above + timer, never an icon
    TextId == 10               -> TW_Wait2     ; text 10 also auto-advances
    PendingTextFlag == 0       -> ret          ; last page: key only, no timer, no icon
    TextBoxType & 0F0h         -> DrawEnterIcon ; high nibble set: show the prompt
TW_Wait2:                                       ; else fall through: timer auto-advance
    dec WaitTextCnt ; ret nz -> advance
```

So the enter icon appears **only** for mode 0, a non-last page, and a set high nibble. Mode-0
non-last pages with the nibble clear **auto-advance on the timer**. Mode 1 accepts keys *and* the
timer; mode 2 is timer-only.

---

## Not fixable here (latent, documented)

- **#78** — `ChkReplyBigBoss4`'s `MapZone != 4` exclusion. MapZone is not modelled.
- **#68** — item units are BCD in the ROM, integers here. Card "identification numbers" are stored
  `31h..38h`, so the digit for #44a must be rendered from the **low BCD nibble**, which is what the
  ROM's `DrawChar` receives after `daa` arithmetic. Doing that in the card display closes #44a
  without converting the whole inventory to BCD; the wider cheat-cap issue (`0x999` read as 2457)
  stays open under #68.

## Checked and found already faithful

`ChkReplyJeniffer` gates on `Class == 3` exactly, while the port uses `>= 3`. `IncClassLv` caps
Class at 3 in the ROM (`cp 3 / ret z`) and the port does the same (`if (snake.class >= 3) return`),
so the two conditions are equivalent — no change.

## Order of work
1. The #115 coordinate correction (it is already shipped and wrong).
2. Radio: #43, #76, #77.
3. Text: #44b/c, #79, #80, #82.
4. HUD/UI: #44a, #81, #89.
5. Title/intro/misc: #45, #83, #84, #85, #86, #75.
6. Assertions for each; all 28 suites green.

---

## Result (2026-08-07)

15 fixed, 2 documented as blocked, 1 already-shipped fix corrected.

| # | Change |
| --- | --- |
| #115 | **Correction** — telescope arrow (196,192) → **(192,196)**; the `dw` rule had been applied to an `ld de` immediate |
| #43 | `incomingCallPossible()` gates the ring on captured-Schneider / Jennifer's rank |
| #44 | Card digit at (240,200) from the low BCD nibble; `textWaitAutoAdvances` + `textShowsEnterIcon` implement TW_Wait's ladder |
| #45 | `KONAMI_HOLD = 256` (WaitCounter wrap); `demoMusic` pins Theme of Tara for the attract demo |
| #75 | Space accepted in the password buffer; the three codes carry their spaces |
| #76 | `chgRadioFreq` clears `replyRequested` as well as `autoReplyDone` |
| #77 | `RadioIdle` re-fires SFX 0x50 when a command is pending (suppressed during the ending) |
| #79 | Mode 1 modelled distinctly; texts 108/147 moved from mode 2 to mode 1 |
| #80 | `t.skipped` latch (set by a mid-print key) withholds the event flags |
| #81 | 16px weapon icons offset +8 → x=168 |
| #82 | Text 45 prints on mask 7; print SFX suppressed at `endingStatus === 10` |
| #83 | Intro fence climb 1.5 → 1 px |
| #84 | `stopSfx()` (tracked one-shot sources) on title skip |
| #85 | Elevator floor-reached facing inverted |
| #86 | `fadeOutMusic()` gain ramp replaces the hard stop at CaptureSetup |
| #89 | Menu cursor seeds the first empty slot |
| #78, #68 | Blocked — MapZone unmodelled; the wider BCD tradeoff remains |

### Snags worth remembering

- `elevatorTick` declares `const held = currentDir()` partway down, shadowing the global `held` Set
  for the whole function scope. The #85 fix threw a TDZ error until that local was renamed.
- Three existing suites encoded pre-fix behaviour and were rewritten around the ROM rule rather than
  patched to pass: the menu cursor seed (#89), the password codes (#75) and the Konami hold (#45).
- The first #82 speed check was a tautology (`(45===45?7:3)===7`). Replaced with a measured
  character count over a fixed tick window — normal 16 vs staff 8.

### Cover
`text` 17 → 31, `radio` 47 → 57, `hud` 13 → 20, `menu` 43 → 45, `rank` 43 → 44,
`title` 37 → 39, `binoc` 25 → 26. All 28 suites green.
