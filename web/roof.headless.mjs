// Headless verification for the roof traversal: bridges (BridgeLogic + ChkOnBridge),
// the parachute fall chain (ChkParachute/NextParachuteRoom/SetLandingRoom + FreeFall),
// the room-53 air flow (ChkRoofAirFlow/AirFlowLogic + the bomb suit gate), the jetpack
// event (room 40: descend -> the power switch -> takeoff -> hover), and sentinels.
// Run: node web/roof.headless.mjs
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
sandbox.__actors = fs.readFileSync(path.join(dir, 'assets', 'actors.json'), 'utf8');

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  actorsData = JSON.parse(__actors);
  for (const r of [204, 5, 6, 10, 45, 53, 40]) rooms.set(r, { img:null, collision:C() });
  gameState='play'; assets.collision=C();
  const iter2 = (fn, n) => { for (let i=0;i<(n||1);i++) { tickCounter=(tickCounter+1)&0xff; fn(); tickCounter=(tickCounter+1)&0xff; fn(); } };

  // ==== Bridges (rooms 45/46) ====
  currentRoom=45; buildBridges(45);
  __check('room 45 places its EIGHT bridge segments', roofBridges.length===8);
  __check('per-index speeds (BridgesSpeeds 0x40..0x100)',
    Math.abs(roofBridges[0].vx)===0x40/256 && Math.abs(roofBridges[3].vx)===1);
  const sign0 = Math.sign(roofBridges[0].vx);
  snake.x=999; snake.y=999;
  iter2(bridgeTick, 0x20);
  __check('all segments reverse together every 0x20 iterations', Math.sign(roofBridges[0].vx)===-sign0);
  // on a segment: protected from the chasm but NOT carried (SetOnBridge is only a flag)
  assets.collision.tiles.fill(1);
  const b=roofBridges[0]; snake.x=Math.round(b.x); snake.y=b.y;
  const sx=snake.x;
  iter2(bridgeTick, 4);
  __check('on a segment (shape 7): no fall and NOT carried (SetOnBridge only flags)',
    currentRoom===45 && snake.x===sx, 'room='+currentRoom+' x='+snake.x+' was '+sx);
  // the seam between two segments (b.y+8 == next.y-8): the boundary row is covered
  snake.y=b.y+8;
  iter2(bridgeTick, 1);
  __check('the segment seams (the +-8 boundary rows) are covered — no phantom fall',
    currentRoom===45, 'room='+currentRoom);
  // the fall: chasm tiles (1) with no segment underfoot
  for (const bb of roofBridges) bb.y = 999;
  selectedItem = 0;
  assets.collision.tiles.fill(1);
  snake.x=128; snake.y=100; snake.life=24; snake.invulnTimer=0;
  iter2(bridgeTick, 1);
  __check('missing the bridges over the chasm = the FreeFall (no parachute): dead in room 5',
    currentRoom===5 && (snake.life===0 || gameState==='dead'), 'room='+currentRoom+' life='+snake.life);

  // ==== The parachute chain ====
  gameState='play'; snake.life=24; snake.controlMod=CONTROL_NORMAL;
  items.set(SELECTED_PARACHUTE,1); selectedItem=SELECTED_PARACHUTE;
  currentRoom=45; assets.collision=C(); buildBridges(45); for (const bb of roofBridges) bb.y=999;
  assets.collision.tiles.fill(1);
  snake.x=128; snake.y=100;
  iter2(bridgeTick, 1);
  __check('with the PARACHUTE: the fall cuts to the brick wall (204), drifting',
    currentRoom===204 && snake.controlMod===CONTROL_PARACHUTE && parachuteCnt===2);
  for (let i=0;i<400 && parachuteCnt===2;i++) { tickCounter=(tickCounter+1)&0xff; parachuteControl(); }
  __check('the first screen ends into a SECOND brick-wall screen (HeightParachuteCnt)',
    currentRoom===204 && parachuteCnt===1, 'cnt='+parachuteCnt);
  for (let i=0;i<400 && currentRoom===204;i++) { tickCounter=(tickCounter+1)&0xff; parachuteControl(); }
  __check('the second screen LANDS in room 5 (from the room-45 jump), walking again',
    currentRoom===5 && snake.controlMod===CONTROL_NORMAL, 'room='+currentRoom);
  __check('the touchdown is the FIXED yard spot (SetLandingPos2: 0x68,0x38), facing up',
    snake.x===0x68 && snake.y===0x38 && snake.dir==='up', 'x='+snake.x+' y='+snake.y);

  // ==== The air flow (room 53) ====
  gameState='play'; currentRoom=53; assets.collision=C();
  snake.x=0x80; snake.y=0x58; snake.controlMod=CONTROL_NORMAL; selectedItem=0;
  chkRoofAirFlow();
  __check('the wind band catches Snake without the bomb suit', snake.controlMod===CONTROL_AIRFLOW);
  for (let i=0;i<60 && snake.controlMod===CONTROL_AIRFLOW;i++) airFlowControl();
  __check('the wind pushes him back UP to Y < 0x30, then walking', snake.y<0x30 && snake.controlMod===CONTROL_NORMAL);
  items.set(SELECTED_BOMB_SUIT,1); selectedItem=SELECTED_BOMB_SUIT;
  snake.y=0x58; chkRoofAirFlow();
  __check('the BOMB BLAST SUIT defeats the wind', snake.controlMod===CONTROL_NORMAL);

  // ==== The jetpack event (room 40) ====
  selectedItem=0; alertMode=false; redAlertFlag=false; alertRespawnTimer=0;
  currentRoom=40; buildPowerSwitch(40); buildJetpacks(40);
  __check('room 40: the floor starts OFF; the jetpack guard is staged', powerSwitchOn===false && jetpacks.length===1);
  guardsData={}; guards.length=0; guard=null;
  iter2(jetpackTick, 1);
  __check('the descent raises the alarm + arms 0x5A reinforcements', alertMode===true && alertRespawnTimer>0);
  iter2(jetpackTick, 60);
  __check('reaching the switch CREATES the power switch — the floor goes LIVE',
    powerSwitchOn===true && powerSwitch && powerSwitch.x===0x44);
  iter2(jetpackTick, 0x20 + 4);
  __check('the guard takes off into the hover', jetpacks[0] && jetpacks[0].mode==='fly');
  jetpacks[0].life=0; iter2(jetpackTick, 1);
  __check('shot dead, the jetpack leaves', jetpacks.length===0);

  // ==== Sentinels (room 39) + HideGuards ====
  // Room 39 has 4 sentinels in two pairs (Y 72 north, Y 176 south); HideGuardRoom39 culls the
  // pair on the side Snake enters from — from the roof elevator (242) the NORTH pair, else SOUTH.
  stopAlarm(); enterDir=0;
  previousRoom=242; currentRoom=39; buildGuard(39);
  __check('from the elevator (242) the NORTH sentinel pair is hidden -> 2 south remain',
    guards.length===2 && guards.every(g=>g.sentinel && g.y===176));
  previousRoom=38; buildGuard(39);
  __check('from elsewhere the SOUTH pair is hidden -> 2 north remain',
    guards.length===2 && guards.every(g=>g.sentinel && g.y===72));
  const s=guards[0]; const d0=s.dir; s.sentinelWait=1;
  tickCounter=0; updateGuardOne(s); tickCounter=1; updateGuardOne(s); tickCounter=2; updateGuardOne(s);
  __check('the look direction cycles through its list', s.dir!==d0 || s.sentinelIdx>0, 'dir='+s.dir);
  __check('sentinels hold their post (no patrol drift)', s.x===guards[0].x && s.stepping===false);

  // ==== The escape ending (EndingLogic, logic/ending.asm) ====
  // Stub the text + title-restore so the cinematic drives deterministically (texts close instantly).
  let endTexts = [];
  setText = (id) => { endTexts.push(id); gameState = 'ending'; textReturnState = 'ending'; };
  titleClear = () => {}; drawLogoParked = () => {};
  escapeEnding();
  __check('escape -> the ending: run + the 200-unit countdown (status 0)',
    gameState==='ending' && endingStatus===0 && endingTimer===200);
  let g=0; while (endingStatus===0 && g++<1000) { tickCounter=0; endingTick(); }
  __check('the countdown reaches zero and Outer Heaven explodes (status 1)',
    endingStatus>=1);
  g=0; while (gameState==='ending' && g++<6000) { tickCounter=(tickCounter+2)&0xff; endingTick(); }
  __check('the report / KNK news / staff / threat texts play in order (155,31,45,15)',
    endTexts.join(',')==='155,31,45,15', endTexts.join(','));
  __check('the dial auto-tuned to the news frequency 120.77 (0x77)', radioFreq===0x77);
  __check('the ending finishes -> back to the title', gameState==='title' && !escaped);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\nroof.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
