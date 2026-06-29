// Headless verification for the checkpoint / continue flow (logic/checkpoints.asm):
// ChkSaveGameStatus arms a checkpoint only on a (Room, PreviousRoom) pair in SaveStatRooms (and
// never once MetalGear_KO); StoreGameStat snapshots the full progress; RestoreGameStat rolls the
// whole game state back to that snapshot on death — so items/doors/rank gained since are LOST.
// Run: node web/checkpoints.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const recCtx = new Proxy({ fillStyle: 0, strokeStyle: 0, lineWidth: 1 }, {
  get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (t[k] = v, true),
});
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}}, style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  // minimal rooms so setRoom (called by restoreProgress) succeeds without actor data
  actorsData = null; guardsData = {}; doorsData = {}; itemsData = {};
  for (const n of [121, 64, 11]) rooms.set(n, { img:null, collision:C() });
  manifest = { start: 121 };
  gameState = 'play';

  // --- ChkSaveGameStatus: arms ONLY on a SaveStatRooms pair ----------------------------------
  checkpointSnapshot = null; pendingCheckpoint = false; mgDestroyed = false;
  previousRoom = 0; chkSaveGameStatus(121);
  __check('a non-checkpoint pair (121,0 is one) arms it', pendingCheckpoint === true);

  pendingCheckpoint = false;
  previousRoom = 5; chkSaveGameStatus(121);     // 121,5 is NOT in the table
  __check('a non-listed pair does not arm', pendingCheckpoint === false);

  pendingCheckpoint = false;
  previousRoom = 11; chkSaveGameStatus(64);     // 64,11 = "Exit to desert from building 1"
  __check('a listed pair (64,11) arms', pendingCheckpoint === true);

  // --- MetalGear_KO: no checkpoints once the base is doomed -----------------------------------
  pendingCheckpoint = false; mgDestroyed = true;
  previousRoom = 11; chkSaveGameStatus(64);
  __check('mgDestroyed (MetalGear_KO) blocks new checkpoints', pendingCheckpoint === false);
  mgDestroyed = false;

  // --- StoreGameStat: takePendingCheckpoint snapshots, then clears the latch -------------------
  currentRoom = 121; snake.x = 0xC0; snake.y = 0xB8; snake.dir = 'up';
  snake.class = 2; snake.maxLife = RANK_MAX_LIFE[2]; snake.life = 20;   // #36: checkpoint at PARTIAL life (20/32)
  weapons.clear(); weapons.set(HAND_GUN, 0x10);
  items.clear(); openedDoorIds.clear(); weaponsTaken.clear(); itemsTaken.clear();
  previousRoom = 0; pendingCheckpoint = true;
  takePendingCheckpoint();
  __check('StoreGameStat takes the snapshot and clears the latch',
    checkpointSnapshot && pendingCheckpoint === false && checkpointSnapshot.room === 121);
  takePendingCheckpoint();    // a second call with nothing pending is a no-op
  __check('takePendingCheckpoint is a no-op when nothing is armed', checkpointSnapshot.room === 121);

  // --- progress made AFTER the checkpoint --------------------------------------------------
  currentRoom = 64; previousRoom = 11;
  snake.class = 4; snake.maxLife = RANK_MAX_LIFE[4]; snake.life = 4;
  weapons.set(HAND_GUN, 0x40); weapons.set(ROCKET_LAUNCHER, 0x05);
  openedDoorIds.add(0x0B); itemsTaken.add(99);

  // --- RestoreGameStat: death rolls EVERYTHING back to the checkpoint ----------------------
  poisoned = true; escaped = false;
  restart();
  __check('death returns to the checkpoint room', currentRoom === 121, 'room='+currentRoom);
  __check('death restores the checkpoint position', snake.x === 0xC0 && snake.y === 0xB8);
  __check('death rolls back rank (class 4 -> 2)', snake.class === 2, 'class='+snake.class);
  __check('death restores the checkpoint-time life, NOT a full refill (20/32) (#36)',
    snake.life === 20 && snake.maxLife === RANK_MAX_LIFE[2]);
  __check('death rolls back ammo gained since the checkpoint', weapons.get(HAND_GUN) === 0x10);
  __check('weapons picked up since the checkpoint are LOST', !weapons.has(ROCKET_LAUNCHER));
  __check('doors opened since the checkpoint are LOST', !openedDoorIds.has(0x0B));
  __check('items taken since the checkpoint are LOST', !itemsTaken.has(99));
  __check('the continue clears Poisoned (DamageDelayTimer=0)', poisoned === false);
  __check('the continue resumes play', gameState === 'play');

  // --- no checkpoint yet: the legacy fallback respawns keeping inventory --------------------
  checkpointSnapshot = null; introCheckpoint = { x: 0x40, y: 0x50 };
  snake.class = 3; weapons.clear(); weapons.set(HAND_GUN, 0x22);
  restart();
  __check('with no checkpoint it falls back to the intro landing', currentRoom === 121 && snake.x === 0x40);
  __check('the fallback keeps the current inventory', weapons.get(HAND_GUN) === 0x22 && snake.class === 3);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\ncheckpoints.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
