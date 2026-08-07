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

  // #35: DeadLogic end -> GS_GameOver (GAME OVER / CONTINUE F5) -> continue (F5) or RebootGame to title
  currentRoom = 121; snake.x = 0xC0; snake.y = 0xB8; previousRoom = 0; pendingCheckpoint = true;
  takePendingCheckpoint();                              // a checkpoint to continue back to
  gameState = 'dead'; deadTimer = 1; continueArmed = false;
  update();
  __check('#35 the dead-timer expiry shows the GAME OVER screen', gameState === 'gameover');
  continueArmed = true; gameOverTimer = 1; update();    // F5 armed -> continue from the checkpoint
  __check('#35 GAME OVER + F5 continues from the checkpoint', gameState === 'play' && currentRoom === 121);
  gameState = 'gameover'; gameOverTimer = 1; continueArmed = false; update();   // no F5 -> reboot to title
  __check('#35 GAME OVER with no F5 reboots to the title', gameState === 'title');

  // ===== The checkpoint must carry the CONTROL MODE (#125) =====
  // GameDataAreas (logic/checkpoints.asm:114-126) copies "Room" then "PlayerControlMod", so the
  // mode is part of StoreGameStat/RestoreGameStat. Most SaveStatRooms pairs land in an ELEVATOR
  // room, and restoring as a plain walker there means no X clamp and free movement through the shaft.
  __check('#125 SaveStatRooms really do target elevator rooms',
    ['240,3','241,15','247,109','250,115'].every((k) => SAVE_STAT_ROOMS.has(k)));
  currentRoom = 240; snake.controlMod = CONTROL_ELEVATOR; snake.anim = ANIM_NORMAL;
  snake.x = 0xD8; snake.y = 0xB4;
  elevatorY = 0xB8; elevatorX = 0x70; elevatorLimitUp = 0x38; elevatorLimitDown = 0xB8;
  const snap = serializeProgress();
  __check('#125 the snapshot carries the control mode', snap.controlMod === CONTROL_ELEVATOR);
  __check('#125 ...and the cabin state that goes with it',
    snap.elev && snap.elev.y === 0xB8 && snap.elev.up === 0x38 && snap.elev.down === 0xB8);
  // Simulate the death/continue round trip.
  snake.controlMod = CONTROL_NORMAL; snake.anim = ANIM_NORMAL;
  elevatorY = 0; elevatorLimitUp = 0; elevatorLimitDown = 0;
  restoreProgress(snap);
  __check('#125 continuing restores ELEVATOR mode, not a free walk',
    snake.controlMod === CONTROL_ELEVATOR, 'mode=' + snake.controlMod);
  __check('#125 the cabin and its limits come back too',
    elevatorY === 0xB8 && elevatorLimitUp === 0x38 && elevatorLimitDown === 0xB8);
  // The mode is what enforces the shaft: ElevatorCtrl walks horizontally with the X 104..243 clamp.
  // (The clamp applies to a MOVE, so hold a direction rather than just teleporting him.)
  assets.collision = { width: 32, height: 24, solid: new Array(32*24).fill(0), tiles: new Array(32*24).fill(0) };
  snake.x = 120; held.add('dir:left'); pushRecency('left');
  for (let k = 0; k < 60; k++) elevatorControl();
  __check('#125 elevator mode holds Snake inside the cabin (X clamped at 104, no walking out)',
    snake.x === 104, 'x=' + snake.x);
  held.clear();
  // A non-elevator checkpoint still restores a plain walk.
  currentRoom = 8; snake.controlMod = CONTROL_NORMAL; snake.x = 100; snake.y = 100;
  const snap2 = serializeProgress();
  __check('#125 a normal-room snapshot carries no elevator state', snap2.elev === null);
  snake.controlMod = CONTROL_ELEVATOR;
  restoreProgress(snap2);
  __check('#125 ...and restores a plain walk', snake.controlMod === CONTROL_NORMAL);
  // Backward compatibility: a pre-#125 snapshot has neither field.
  const old = serializeProgress(); delete old.controlMod; delete old.anim; delete old.elev;
  snake.controlMod = CONTROL_ELEVATOR;
  restoreProgress(old);
  __check('#125 an older snapshot still loads (falls back to a walk)',
    snake.controlMod === CONTROL_NORMAL && snake.anim === ANIM_NORMAL);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\ncheckpoints.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
