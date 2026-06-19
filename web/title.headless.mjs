// Headless verification for the boot/title sequence (GS_KonamiLogo / MenuLogoLogic /
// ChkAnykeyStart — logic/konamilogo.asm, logic/mainmenu.asm, Banks0123.asm:10617). Loads the
// REAL web/game.js and checks the phase timings (49-line reveal at 1 line per 2 iterations,
// 0x20 hold, 12-step swoop with SFX 0x47, wipe + park, 12 iterations to the texts), the
// smear-trail accumulation, the any-key skip (SFX 0x4A) and the Fire-only start gating —
// then the INTRO scene it starts (IntroSceneLogic, logic/introscene.asm; init
// Banks0123.asm:8422): the scripted swim in room 121, the incoming call at cnt 0x20, the
// 12-LED radio + text 2 briefing, the fence climb snaps (Y 0x88 / 0x66), the landing hop
// and the ChkSaveGameStatus checkpoint.
// Run: node web/title.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const calls = [];        // the MAIN canvas
const tcalls = [];       // the offscreen TITLE surface
function makeCtx(sink) {
  const rec = {};
  for (const m of ['scale','clearRect','fillRect','strokeRect','drawImage','fillText','beginPath',
                   'moveTo','lineTo','closePath','fill','stroke','save','restore','clip','rect','transform','translate'])
    rec[m] = (...a) => sink.push({ m, a, fillStyle: rec.fillStyle });
  rec.measureText = () => ({ width: 0 });
  rec.fillStyle = '#000'; rec.strokeStyle = '#000'; rec.font = ''; rec.lineWidth = 1;
  rec.textAlign = 'left'; rec.textBaseline = 'top'; rec.imageSmoothingEnabled = false;
  return rec;
}
const recCtx = makeCtx(calls);
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}}, style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat, String, Number,
  requestAnimationFrame: () => 0,
  document: {
    getElementById: () => el(),
    addEventListener(){},
    createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx(tcalls) }),
  },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch in harness')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
sandbox.__fontMeta = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'font.json'), 'utf8'));
sandbox.__coll121 = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', '121.collision.json'), 'utf8'));
sandbox.__texts = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'texts.json'), 'utf8'));

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });
sandbox.__calls = calls;
sandbox.__tcalls = tcalls;

const test = `
;(function(){
  fontImg = {}; fontMeta = __fontMeta;
  konamiLogoImg = { width: 168, height: 48, __konami: true };
  metalImg = { __metal: true }; gearImg = { __gear: true };
  assets.logoMoveBuf = 'SFX47'; assets.logoStopBuf = 'SFX4A';
  const sfx = [];
  playBuf = (b) => sfx.push(b);
  const iter = (n) => { for (let i = 0; i < (n || 1); i++) { tickCounter = 1; update(); } };

  // --- the Konami reveal: 1 line per 2 iterations, 49 lines, then the 0x20 hold ---
  gameState = 'title'; titlePhase = 'konami-reveal'; titleCnt = 0;
  iter(20);
  __calls.length = 0; drawTitle();
  const whiteFill = __calls.find((c) => c.m === 'fillRect' && c.fillStyle === '#fff');
  const partial = __calls.find((c) => c.m === 'drawImage' && c.a[0].__konami);
  __check('reveal: white backdrop + the logo clipped to cnt/2 lines at (0x28,0x40)',
    !!whiteFill && partial && partial.a[4] === 10 && partial.a[5] === 0x28 && partial.a[6] === 0x40,
    partial ? 'lines='+partial.a[4] : 'none');
  iter(49 * 2 - 20);
  __check('after 98 iterations: the hold (WaitCounter 0x20)', titlePhase === 'konami-hold' && titleCnt === 0x20);
  __calls.length = 0; drawTitle();
  const full = __calls.find((c) => c.m === 'drawImage' && c.a[0].__konami);
  __check('hold shows all 49 lines', full && full.a[4] === 49);

  // --- the swoop: SFX 0x47, 11 accumulated draw steps (no clears between), then the wipe ---
  iter(0x20);
  __check('hold elapses into the swoop with SFX 0x47', titlePhase === 'swoop' && titleCnt === 12 && sfx.includes('SFX47'));
  __tcalls.length = 0;
  iter(11);
  const steps = __tcalls.filter((c) => c.m === 'drawImage' && c.a[0].__metal);
  const clears = __tcalls.filter((c) => c.m === 'fillRect');
  __check('11 swoop steps accumulate WITHOUT clearing (the ROM smear trail)',
    steps.length === 11 && clears.length === 0, 'steps='+steps.length+' clears='+clears.length);
  __check('the first step is the bottom Y (0xC0), the last the top (0x20)',
    steps[0].a[2] === 0xC0 && steps[10].a[2] === 0x20, steps.map((s) => s.a[2]).join(','));
  __tcalls.length = 0;
  iter(2);                                          // cnt 1 -> wipe, then the wipe runs
  __check('EraseLogoRests wipes and parks the logo (METAL (0x20,0x20), GEAR (0x88,0x28))',
    titlePhase === 'text-wait'
      && __tcalls.some((c) => c.m === 'fillRect')
      && __tcalls.some((c) => c.m === 'drawImage' && c.a[0].__metal && c.a[1] === 0x20 && c.a[2] === 0x20)
      && __tcalls.some((c) => c.m === 'drawImage' && c.a[0].__gear && c.a[1] === 0x88 && c.a[2] === 0x28));

  // --- the texts after 12 more iterations ---
  iter(12);
  __check('PUSH SPACE KEY appears (phase ready)', titlePhase === 'ready');
  __calls.length = 0; drawTitle();
  const glyphs = __calls.filter((c) => c.m === 'drawImage' && c.a[0] === fontImg);
  __check('texts drawn at the txtPushSpace rows (y 0x60 and 0x88)',
    glyphs.some((g) => g.a[6] === 0x60) && glyphs.some((g) => g.a[6] === 0x88));

  // --- ChkAnykeyStart: any key skips; Fire starts; arrows inert on ready ---
  titlePhase = 'konami-reveal'; titleCnt = 0; sfx.length = 0;
  titleSkip();
  __check('any key during the boot skips to the parked title + SFX 0x4A',
    titlePhase === 'ready' && sfx.includes('SFX4A'));
  __check('still in the title (arrows are inert on ready — only Fire starts)', gameState === 'title');
  // ==== GS_PlayStart: the blinking "PLAY START" before the game starts =====================
  textsData = __texts;
  rooms.set(121, { img: null, collision: __coll121 });
  titleStartGame();
  __check('Fire enters GS_PlayStart: PLAY START blinks for 0x50 (still in the title)',
    gameState === 'title' && titlePhase === 'playstart' && titleCnt === 0x50);
  const psGlyphs = () => __calls.filter((c) => c.m === 'drawImage' && c.a[0] === fontImg && c.a[6] === 0x88).length;
  titleCnt = 8; __calls.length = 0; drawTitle();             // bit 2 clear -> drawn
  __check('PLAY START drawn at (0x58,0x88) on the visible blink phase', psGlyphs() === 9);
  titleCnt = 4; __calls.length = 0; drawTitle();             // bit 2 set -> erased
  __check('PLAY START erased on the off phase (WaitCounter bit 2)', psGlyphs() === 0);
  titleCnt = 0x50;

  // ==== The intro scene (IntroSceneLogic, logic/introscene.asm) ============================
  iter(0x50);
  __check('GS_StartGame: a BLACK beat (0x20) with the music up, Snake staged in room 121',
    gameState === 'intro' && titlePhase === null && currentRoom === 121
      && snake.x === 0xC0 && snake.y === 0xB8 && snake.anim === ANIM_DEEP_WATER
      && introStatus === -1 && introCnt === 0x20);
  __calls.length = 0; draw();
  __check('the black beat draws ONLY the clear fill (no room, no HUD)',
    __calls.length === 1 && __calls[0].m === 'fillRect' && __calls[0].fillStyle === '#000');
  iter(0x20);
  __check('the shore appears: IntroScene1 begins (cnt 0x40)',
    introStatus === 0 && introCnt === 0x40);
  __check('InitGame: the fresh start carries CIGARETTES, selected',
    items.get(SELECTED_CIGARETTES) === 1 && selectedItem === SELECTED_CIGARETTES);

  // From here the natural tickCounter alternation matters (the LED pacing is gated on the
  // ROM iteration boundary), so plain update() loops replace the forced-tick iter().
  // The intro runs on the ROM iteration boundary (every other tick) — bounds are 2x counts.
  const until = (cond, max) => { let i = 0; while (!cond() && i++ < max) update(); };
  until(() => introStatus === 1, 0x90);
  __check('dive 1 (0x40 left, collision-checked): surfaces facing up (ANIM_WATER)',
    introStatus === 1 && snake.anim === ANIM_WATER && snake.dir === 'up' && snake.x < 0xC0,
    'x='+snake.x);
  until(() => introStatus === 2, 0x70);
  __check('float 0x30, then submerges left again',
    introStatus === 2 && snake.anim === ANIM_DEEP_WATER && snake.dir === 'left');
  until(() => introStatus === 3, 0xB0);
  until(() => introStatus === 4, 0x50);
  __check('dive 2 (0x50 left) + the north leg (0x20): surfaced facing right',
    introStatus === 4 && snake.anim === ANIM_WATER && snake.dir === 'right' && snake.y < 0xB8,
    'x='+snake.x+' y='+snake.y);
  until(() => radioCallFlag === 1, 0x50);
  __check('the CALL rings mid-wait (SetIntroCallFlag at cnt 0x20)',
    radioCallFlag === 1 && introStatus === 4 && introCnt === 0x20);
  until(() => introStatus === 5, 0x50);
  __check('answered: the radio opens over the scene (LED delay 0x10)',
    introRadio === true && radioState === 2 && radioCallFlag === 2
      && radioLedCnt === 0 && radioLedDelay === 0x10);
  until(() => gameState === 'text', 200);
  __check('12 LEDs climb (RadioSignalUp), then Big Boss speaks: text 2 OVER the radio',
    radioLedCnt === 12 && introStatus === 7 && textBox && textBox.id === 2
      && textReturnState === 'intro' && introRadio === true);
  let dguard = 0;
  while (textBox && dguard++ < 10) dismissText();
  until(() => introStatus === 8, 4);
  __check('the briefing closes: ExitRadio, the swim right begins (cnt 0x28)',
    gameState === 'intro' && introRadio === false && introStatus === 8);
  until(() => introStatus === 10, 0x100);
  __check('swim right + up to the fence: snapped to Y 0x88, climbing (ANIM_LADDER)',
    introStatus === 10 && snake.y === 0x88 && snake.anim === ANIM_LADDER, 'x='+snake.x);
  until(() => introStatus === 11, 0x50);
  __check('over the top: snapped to Y 0x66 (ANIM_NORMAL), the hop starts (cnt 0x0C)',
    introStatus === 11 && snake.y === 0x66 && snake.anim === ANIM_NORMAL && introCnt === 0x0C);
  until(() => gameState === 'play', 0x40);
  __check('IntroScene13: control passes to the player; the landing is the checkpoint',
    gameState === 'play' && introCheckpoint !== null
      && introCheckpoint.x === snake.x && introCheckpoint.y === snake.y,
    introCheckpoint ? 'x='+introCheckpoint.x+' y='+introCheckpoint.y : 'none');
  snake.x = 10; snake.y = 10;
  restart();
  __check('ChkSaveGameStatus: restart() respawns at the checkpoint in room 121',
    currentRoom === 121 && snake.x === introCheckpoint.x && snake.y === introCheckpoint.y);

  // ==== Attract / demo mode (GS_DemoPlay) ====
  setRoom = (n) => { currentRoom = n; };       // stub the heavy room rebuild
  gameState = 'title'; titlePhase = 'ready'; titleIdle = 0; demoSceneIdx = 0;
  for (let i = 0; i < DEMO_IDLE - 1; i++) { tickCounter = 0; titleTick(); }
  __check('the title idles without starting the demo before the timeout', !demoActive);
  tickCounter = 0; titleTick();
  __check('after ~256 idle iterations the attract demo starts (gameplay 1, room 5)',
    demoActive && gameState === 'play' && currentRoom === 5);
  // DemoControler bit mapping: control 8 = Right held; 0x20 = punch edge.
  punchQueued = false; fireQueued = false;
  demoPrevCtrl = 0; applyDemoControl(8);
  __check('demo control 8 = Right held', held.has('dir:right') && !held.has('dir:left'));
  applyDemoControl(0x20);
  __check('demo control 0x20 = a punch edge (Fire2)', punchQueued === true);
  // Replay runs to the 0xFF terminator -> back to the title, next scene queued.
  let guard = 0;
  while (demoActive && guard++ < 5000) { tickCounter = 0; demoControlTick(); }
  __check('the demo ends at 0xFF -> returns to the title', !demoActive && gameState === 'title');
  __check('the cycle advances to the radio-tutorial scene (idx 1)', demoSceneIdx === 1);

  // ==== Radio-tutorial demo scene (idx 1) ====
  startDemo();
  __check('the tutorial demo opens the radio at Big Boss freq, LED climb',
    demoActive && gameState === 'radio' && radioFreq === 0x85 && radioState === 2);
  guard = 0;
  while (gameState === 'radio' && radioState === 2 && guard++ < 500) { tickCounter = 0; radioTick(); }
  __check('the 12 LEDs climb, then tutorial text 36 shows',
    radioLedCnt === 12 && gameState === 'text' && textBox && textBox.id === 36);
  textBox = null; gameState = textReturnState;            // simulate the text closing
  tickCounter = 0; radioTick();
  __check('after the tutorial text the demo ends -> title, cycles to gameplay 2 (idx 2)',
    !demoActive && gameState === 'title' && demoSceneIdx === 2);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
