// Headless RENDER (UI) verification. Every other suite asserts numbers — positions, timers,
// damage tables. None of them assert what actually reaches the screen, which is how #132 (the
// destroyed power switch drew nothing) sat behind a 92%-covered component, and how #118's
// hand-drawn reticle shipped.
//
// This suite records the 2D-context CALL LIST with its arguments, renders known scenes through the
// real draw(), and asserts specific draws happen at specific coordinates.
//
// It deliberately does NOT hash the whole frame. A golden-image/golden-hash test fails on every
// legitimate change, so it gets "updated" reflexively and stops meaning anything. Targeted queries
// ("the wreck is blitted at (96,8)") survive unrelated edits and still fail loudly when the thing
// they name stops being drawn.
//
// Run: node web/render.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// ---- a recording 2D context -------------------------------------------------------------------
// Captures every op with its arguments, so a scene can be queried afterwards.
const draws = [];
function makeCtx() {
  const rec = {};
  for (const m of ['scale', 'clearRect', 'fillRect', 'strokeRect', 'drawImage', 'fillText',
                   'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'save',
                   'restore', 'clip', 'rect', 'transform', 'translate', 'setTransform'])
    rec[m] = (...a) => draws.push({ op: m, args: a.map((v) => (typeof v === 'number' ? Math.round(v) : v)),
                                    fill: rec.fillStyle });
  rec.measureText = (t) => ({ width: String(t).length * 8 });
  rec.fillStyle = '#000'; rec.strokeStyle = '#000'; rec.font = ''; rec.lineWidth = 1;
  rec.textAlign = 'left'; rec.textBaseline = 'top'; rec.imageSmoothingEnabled = false;
  rec.globalAlpha = 1; rec.filter = 'none';
  return rec;
}
const recCtx = makeCtx();
// A stand-in for a decoded asset. The real ones are PNGs the harness can't decode, but draw()
// only branches on truthiness/dimensions — so a tagged object exercises every blit path AND lets
// an assertion name which asset was used.
const img = (tag, w = 64, h = 64) => ({ __tag: tag, width: w, height: h });
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}},
                    style:{}, blur(){}, width:0, height:0 });

const sandbox = {
  console, Math: Object.create(Math), Date, JSON, Set, Map, Array, Object, URLSearchParams,
  isNaN, parseInt, parseFloat, requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){} },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch in harness')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.Math.random = () => 0.5;          // deterministic: no random guard timers / dog waits
sandbox.globalThis = sandbox;

const A = (f) => JSON.parse(fs.readFileSync(path.join(dir, 'assets', f), 'utf8'));
let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '');
vm.createContext(sandbox);
vm.runInContext(src + ';globalThis.__G=(n)=>eval(n);globalThis.__S=(n,v)=>{eval(n+"=v")};', sandbox);
const G = (n) => sandbox.__G(n);
const S = (n, v) => sandbox.__S(n, v);

const results = [];
const check = (name, cond, extra = '') => results.push({ name, ok: !!cond, extra });

// ---- scene helpers ----------------------------------------------------------------------------
S('doorsData', A('doors.json')); S('doorTypes', A('door-types.json'));
S('doorGfx', A('door-gfx.json')); S('actorsData', A('actors.json'));
S('camerasData', A('cameras.json')); S('guardsData', {});
// draw() reads the Snake sprite atlas (assets.atlas) for the player frame — the real exported
// metadata, with a stand-in bitmap so the blit path runs.
G('assets').atlas = A('snake.json');
G('assets').sheet = img('snake', 256, 256);

function scene(room, fn) {
  draws.length = 0;
  G('assets').collision = A(`rooms/${room}.collision.json`);
  G('assets').room = img('room' + room, 256, 192);
  S('currentRoom', room);
  S('gameState', 'play');
  G('buildDoors')(room);
  G('guards').length = 0; S('guard', null);
  const s = G('snake');
  s.x = 128; s.y = 96; s.dir = 'down'; s.anim = G('ANIM_NORMAL'); s.controlMod = G('CONTROL_NORMAL');
  s.life = 24; s.maxLife = 24;
  if (fn) fn(s);
  frame();
  return draws.slice();
}
// Mirror what the game loop actually paints each frame: draw() then the dev overlays. Testing
// draw() alone would miss anything the loop layers on top (the room readout lives there so it
// overlays menus and the radio too).
function frame() {
  G('draw')();
  G('drawRoomHud')();
  if (G('devPerf')) G('drawPerfHud')();
}

// Query helpers over the recorded call list.
const blits = (d, tag) => d.filter((c) => c.op === 'drawImage' && c.args[0] && c.args[0].__tag === tag);
const blitAt = (d, tag, x, y) => blits(d, tag).some((c) => {
  const a = c.args;                       // drawImage(img,dx,dy) or drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh)
  // drawImage has three overloads: (img,dx,dy), (img,dx,dy,dw,dh) and (img,sx,sy,sw,sh,dx,dy,dw,dh)
  return ((a.length === 3 || a.length === 5) && a[1] === x && a[2] === y)
      || (a.length === 9 && a[5] === x && a[6] === y);
});
const anyText = (d, txt) => d.some((c) => c.op === 'fillText' && String(c.args[0]).includes(txt));

// ---- 1. the baseline play frame ---------------------------------------------------------------
let d = scene(59);
check('a play frame draws the room bitmap at the origin', blitAt(d, 'room59', 0, 0));
check('a play frame issues drawing calls at all', d.length > 3, 'ops=' + d.length);
check('the HUD strip is painted below the play area (VIEW_H 192)',
  d.some((c) => c.op === 'fillRect' && c.args[1] >= 192), 'n=' + d.length);

// ---- 2. #132 the destroyed power switch MUST be blitted ---------------------------------------
// The regression this suite exists for: game logic said "destroyed", and nothing was drawn.
S('powSwOffImg', img('powswitch-off', 8, 16));
S('powSwOffRoofImg', img('powswitch-off-roof', 8, 16));
d = scene(37, () => {
  G('buildPowerSwitch')(37);
  const sw = G('powerSwitch');
  sw.life = 0;
  G('powerSwitchTick')();
});
check('#132 a blown power switch BLITS its wreck (not just a state flag)',
  blits(d, 'powswitch-off').length === 1, 'blits=' + blits(d, 'powswitch-off').length);
check('#132 the wreck lands at (switchX-4, switchY-8) = (96,8)', blitAt(d, 'powswitch-off', 96, 8));
d = scene(37, () => { G('buildPowerSwitch')(37); });
check('#132 an intact switch draws NO wreck', blits(d, 'powswitch-off').length === 0);

// ---- 3. #135 a dying camera draws the explosion, not the camera -------------------------------
S('cameraImg', img('camera', 64, 32));
S('explosionSSheet', img('explosion-s', 48, 16));
d = scene(31, () => { G('buildCameras')(31); });
const camBlits = blits(d, 'camera').length;
check('#135 an intact camera is drawn from the camera sheet', camBlits > 0, 'n=' + camBlits);
check('#135 an intact camera draws no explosion', blits(d, 'explosion-s').length === 0);
d = scene(31, () => {
  G('buildCameras')(31);
  const c = G('cameras')[0];
  c.life = 0; G('cameraTick')();        // -> dying = 0
});
check('#135 a DYING camera draws the explosion sprite instead',
  blits(d, 'explosion-s').length === 1 && blits(d, 'camera').length === camBlits - 1,
  'expl=' + blits(d, 'explosion-s').length + ' cam=' + blits(d, 'camera').length);

// ---- 4. the room-number readout (?showroom / F2) ----------------------------------------------
S('devShowRoom', false);
d = scene(59);
check('?showroom off: no room readout', !anyText(d, 'ROOM'));
S('devShowRoom', true);
d = scene(59);
check('?showroom on: the room number is drawn', anyText(d, 'ROOM 59'));
S('devShowRoom', false);

// ---- 5. draw() must not throw in any game state ------------------------------------------------
// Cheap but broad: a render crash in a state nobody screenshots is invisible until a player hits it.
for (const st of ['play', 'menu', 'radio', 'title', 'gameover', 'binoculars', 'text', 'ending']) {
  let threw = null;
  try {
    draws.length = 0;
    S('gameState', st);
    G('draw')();
  } catch (e) { threw = e.message; }
  check(`draw() does not throw in state "${st}"`, threw === null, threw || '');
}
S('gameState', 'play');

let pass = 0;
for (const r of results) {
  console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  [' + r.extra + ']' : ''));
  if (r.ok) pass++;
}
console.log(`\nrender.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
