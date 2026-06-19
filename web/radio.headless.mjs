// Headless verification for the incoming radio call (ChkRadioCalls Banks0123.asm:1689,
// ChkIncomingCall logic/incomingcall.asm, DrawCallTimer logic/hud.asm:25). Loads the REAL
// web/game.js + the real exported radio.json/collision data in a vm sandbox and verifies:
// arming on entry to a call room (room 0), the pending(32) -> ringing(0x58-1) -> stopped life
// cycle with the ROM's fall-through, the ring-SFX cadence and room-change cut, menu pausing,
// and the CALL sign blink. Run: node web/radio.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const calls = [];
function makeCtx() {
  const rec = {};
  for (const m of ['scale','clearRect','fillRect','strokeRect','drawImage','fillText','beginPath',
                   'moveTo','lineTo','closePath','fill','stroke','save','restore','clip','rect','transform','translate'])
    rec[m] = (...a) => calls.push({ m, a });
  rec.measureText = () => ({ width: 0 });
  rec.fillStyle = '#000'; rec.strokeStyle = '#000'; rec.font = ''; rec.lineWidth = 1;
  rec.textAlign = 'left'; rec.textBaseline = 'top'; rec.imageSmoothingEnabled = false;
  return rec;
}
const recCtx = makeCtx();
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}}, style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch in harness')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
sandbox.__radio = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'radio.json'), 'utf8'));
sandbox.__coll0 = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', '0.collision.json'), 'utf8'));
sandbox.__coll7 = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', '7.collision.json'), 'utf8'));
sandbox.__texts = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'texts.json'), 'utf8'));
sandbox.__radiocalls = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'radiocalls.json'), 'utf8'));

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  callRooms = new Set(__radio.callRooms);           // the real exported RoomsMusic bit-3 data
  rooms.set(0, { img: null, collision: __coll0 });
  rooms.set(7, { img: null, collision: __coll7 });
  doorsData = {}; doorTypes = {}; doorGfx = {};
  gameState = 'play';

  // Intercept the tracked ring source (no audio in the harness).
  let rings = 0, stops = 0;
  playCallRing = () => { rings++; };
  stopCallRing = () => { stops++; };

  __check('radio.json: room 0 is a call room (RoomsMusic[0] = 8)', callRooms.has(0));

  // --- arming (ChkRadioCalls): call room -> pending 32; other rooms -> stopped ---
  setRoom(0);
  __check('entering room 0 arms a pending call (timer 32, flag 0)',
    radioCallFlag === 0 && incomingCallTimer === 32, 'flag='+radioCallFlag+' t='+incomingCallTimer);
  setRoom(7);
  __check('entering a non-call room resets to stopped (flag 2)', radioCallFlag === 2, 'flag='+radioCallFlag);
  __check('every room entry cuts the ring SFX (SetAreaMusic6)', stops >= 2, 'stops='+stops);
  setRoom(0);
  __check('re-entering room 0 re-arms', radioCallFlag === 0 && incomingCallTimer === 32);

  // --- pacing gate: the call system advances only on ROM iterations (every other 60Hz tick;
  //     TickInProgress skip, Banks0123.asm:456-463) ---
  function iter() { tickCounter = 2; chkIncomingCall(); }   // one ROM iteration
  tickCounter = 1; const tOdd = incomingCallTimer; chkIncomingCall();
  __check('odd 60Hz ticks do not advance the call (ROM iteration = 2 ticks)',
    incomingCallTimer === tOdd && radioCallFlag === 0, 't='+incomingCallTimer);

  // --- life cycle (ChkIncomingCall): pending 32 iterations -> ringing, with the fall-through ---
  for (let t = 0; t < 31; t++) iter();
  __check('31 pending iterations: still pending', radioCallFlag === 0 && incomingCallTimer === 1,
    'flag='+radioCallFlag+' t='+incomingCallTimer);
  iter();                                            // 32nd iteration: starts ringing
  __check('32nd iteration starts the ring with the ROM fall-through (0x58 set, same iteration decrements)',
    radioCallFlag === 1 && incomingCallTimer === 0x57, 'flag='+radioCallFlag+' t='+incomingCallTimer);

  // --- ring SFX cadence (DrawCallTimer timing): fires when callTickCounter % 16 == 0 ---
  rings = 0;
  callTickCounter = 15; iter();                      // increments to 16 -> on the beat
  __check('ring SFX fires on an iteration % 16 == 0', rings === 1, 'rings='+rings);
  callTickCounter = 3; iter(); iter();
  __check('no ring SFX off the 16-iteration beat', rings === 1, 'rings='+rings);

  // --- menus pause the cycle (PlayModeLogic never runs in GameMode 2/3) ---
  const fBefore = radioCallFlag, tBefore = incomingCallTimer;
  gameState = 'menu'; menuMode = 'item'; menuEntries = [];
  update(); update(); update();
  __check('menu ticks do not advance the call timers',
    radioCallFlag === fBefore && incomingCallTimer === tBefore, 't='+incomingCallTimer);
  gameState = 'play'; menuMode = null;

  // --- ring duration: 0x58 - 1 iterations of ringing, then stopped ---
  let guard_ = 0;
  while (radioCallFlag === 1 && guard_++ < 1000) iter();
  __check('unanswered call stops (flag 2) after the countdown', radioCallFlag === 2 && incomingCallTimer === 0,
    'flag='+radioCallFlag+' t='+incomingCallTimer+' steps='+guard_);

  // --- room change mid-ring cuts the SFX and a stopped room does not re-ring ---
  setRoom(0);                                        // re-arm
  for (let t = 0; t < 32; t++) iter();               // straight to ringing
  __check('ringing again after re-entry', radioCallFlag === 1);
  stops = 0; setRoom(7);
  __check('leaving mid-ring stops the ring SFX and the call', stops === 1 && radioCallFlag === 2, 'stops='+stops);
  rings = 0; callTickCounter = 15; iter();
  __check('no ring after the call is gone', rings === 0, 'rings='+rings);

  // --- CALL sign blink (DrawCallTimer / drawCallSign) ---
  callSignImg = { __call: true };
  radioCallFlag = 1; incomingCallTimer = 0x40; gameState = 'play';
  const signDrawn = () => __calls.some(c => c.m === 'drawImage' && c.a[0] && c.a[0].__call === true
                                            && c.a[1] === 120 && c.a[2] === 193);
  callTickCounter = 0;  __calls.length = 0; drawCallSign();
  __check('CALL sign drawn at (120,193) while bit 3 is clear', signDrawn());
  callTickCounter = 8;  __calls.length = 0; drawCallSign();
  __check('CALL sign hidden while bit 3 is set (blink off-phase)', !signDrawn());
  callTickCounter = 0; gameState = 'menu'; __calls.length = 0; drawCallSign();
  __check('CALL sign suppressed in menus (GameMode 2/3 erase)', !signDrawn());
  gameState = 'play'; radioCallFlag = 2; __calls.length = 0; drawCallSign();
  __check('no CALL sign when no call is ringing', !signDrawn());

  // ================= The transceiver (RadioLogic) =================
  textsData = __texts; radiocallsData = __radiocalls;
  rooms.set(4, { img: null, collision: __coll0 });
  let noiseOn = 0, noiseOff = 0;
  playRadioNoise = () => { noiseOn++; };
  stopRadioNoise = () => { noiseOff++; };
  // update() increments tickCounter first, so seed 1 -> the tick runs on an even count.
  const iter2 = (n) => { for (let i = 0; i < (n || 1); i++) { tickCounter = 1; update(); } };

  // --- answering the room-0 call: open stops the ring, auto-reply delivers the briefing ---
  setRoom(0);
  __check('UpdateRadio: room 0 callers loaded + auto-tuned to 120.85',
    radioPersons.length === 1 && radioFreq === 0x85, 'freq='+radioFreq.toString(16));
  iter2(10);                                          // pending call ticking
  stops = 0;
  openRadio();
  __check('opening the radio stops the incoming call (DrawRadio: flag 2)',
    gameState === 'radio' && radioCallFlag === 2 && stops === 1 && noiseOn === 1);
  iter2(1);                                           // idle -> ChkRadioReceiv matches
  __check('auto-reply starts the signal (state 2, LED delay 0x10)',
    radioState === 2 && radioLedDelay === 0x10, 'state='+radioState);
  iter2(0x10 + 11 * 2);                               // first LED after 0x10, then 2 each
  __check('all 12 LEDs lit -> reply state', radioLedCnt === 12 && radioState === 3, 'leds='+radioLedCnt);
  iter2(1);
  __check('reply opens Big Boss text 3 over the radio (noise muted)',
    gameState === 'text' && textBox && textBox.id === 3 && radioState === 4 && noiseOff >= 1);
  dismissText(); dismissText();                       // skip both pages
  __check('text closes back into the radio', gameState === 'radio');
  iter2(1);                                           // RadioSignalOFF
  __check('signal off: idle again, LEDs out, auto-reply latched',
    radioState === 1 && radioLedCnt === 0 && autoReplyDone === true);
  iter2(20);
  __check('latched: no new reply while sitting on 120.85', radioState === 1);

  // --- retuning clears the latch and re-rings ---
  radioDirTrigger = 'left'; iter2(1);
  __check('tune left: 120.84, latch cleared', radioFreq === 0x84 && autoReplyDone === false, 'freq='+radioFreq.toString(16));
  radioDirTrigger = 'right'; iter2(1); iter2(1);
  __check('back on 120.85: the auto-reply rings again', radioFreq === 0x85 && radioState === 2);

  // --- frequency clamps + hold repeat (ChgRadioFreq) ---
  closeRadio(); openRadio();                          // reset to idle (openRadio needs 'play')
  radioFreq = 0x99; radioDirTrigger = 'right'; iter2(1);
  __check('clamped at 120.99', radioFreq === 0x99);
  radioFreq = 0x00; radioDirTrigger = 'left'; iter2(1);
  __check('clamped at 120.00', radioFreq === 0x00);
  radioFreq = 0x50;
  held.add('dir:right'); pushRecency('right');
  radioHoldWait = 8;
  iter2(7);
  const heldFreq = radioFreq;
  iter2(1); iter2(2);
  __check('held tune: first step after 8 iterations, then every 2',
    heldFreq === 0x50 && radioFreq === 0x52, 'freq='+radioFreq.toString(16));
  held.delete('dir:right');

  // --- wrong frequency stays silent ---
  iter2(10);
  __check('no caller on 120.52: idle', radioState === 1);

  // --- wait-call (room 4): answers only after SEND ---
  closeRadio(); gameState = 'play';
  setRoom(4);                                         // no auto-tune entry: RadioFreq persists
  openRadio();
  radioFreq = 0x85;                                   // the player tunes to Big Boss
  iter2(10);
  __check('wait-call entry ignores RECV idling', radioState === 1);
  radioUpTrigger = true; iter2(1);
  __check('UP = SEND: Snake text 10 over the radio, reply requested',
    gameState === 'text' && textBox && textBox.id === 10 && replyRequested === true && radioCmd === 1);
  dismissText();                                      // (in-game it also self-dismisses)
  __check('back to the radio after the call-out', gameState === 'radio');
  iter2(1);
  __check('the wait-call reply now rings (state 2)', radioState === 2);
  iter2(0x10 + 11 * 2 + 1);
  __check("room 4's reply is Big Boss text 3", gameState === 'text' && textBox && textBox.id === 3);
  dismissText(); dismissText();
  closeRadio();
  __check('closing the radio stops the noise and resumes play', gameState === 'play' && noiseOff > 0);

  // ================= ChkRadioReply gates =================
  switchOffMsx = false; transmiTaken = false; schneiderCaptured = false; snake.class = 4;
  __check('Big Boss default reply passes through', radioReplyGate({ freq: 0x85, textId: 3 }) === 3);
  transmiTaken = true;
  __check('Big Boss warns about the bug (text 50) when bugged', radioReplyGate({ freq: 0x85, textId: 3 }) === 50);
  switchOffMsx = true;
  __check('after room 111 Big Boss orders switch-off MSX (text 136)', radioReplyGate({ freq: 0x85, textId: 3 }) === 136);
  switchOffMsx = false; transmiTaken = false;
  schneiderCaptured = true;
  __check('a captured Schneider gives no reply', radioReplyGate({ freq: 0x79, textId: 7 }) === null);
  schneiderCaptured = false;
  __check('a free Schneider replies', radioReplyGate({ freq: 0x79, textId: 7 }) === 7);
  snake.class = 2;
  __check('Jennifer needs rank class >= 3 (none below)', radioReplyGate({ freq: 0x48, textId: 9 }) === null);
  snake.class = 3;
  __check('Jennifer replies at rank class 3', radioReplyGate({ freq: 0x48, textId: 9 }) === 9);
  // entering room 111 arms the switch-off flag (ChkSwitchMsxOff)
  switchOffMsx = false; rooms.set(111, { img: null, collision: __coll0 }); setRoom(111);
  __check('entering room 111 arms SwitchOffMSXF', switchOffMsx === true);
})();
`;

sandbox.__calls = calls;
vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
