// Sound/music audit: ROM RoomsMusic (data/musicradioconfig.asm) vs the port's per-room music
// table, call-bit set, and no-alarm flag — plus a music-track + SFX/event coverage tally.
// Run: node Tools/audit/audit-sound.mjs   ->   writes docs/sound-audit.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from '../rom-source.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = (p) => fs.readFileSync(path.join(root, p), 'utf8');   // in-repo reads (web/game.js, web/assets, ...)
const J = (p) => { try { return JSON.parse(R(p)); } catch { return null; } };
const num = (t) => (/h$/i.test(t) ? parseInt(t, 16) : parseInt(t, 10));

// ---- ROM RoomsMusic bytes (non-Japanese branch of the IF/ELSE/ENDIF) ------
const mLines = readRom('data/musicradioconfig.asm').split(/\r?\n/);
const start = mLines.findIndex((l) => l.startsWith('RoomsMusic:'));
const rm = [];
let skip = false;                          // inside the JAPANESE IF branch -> skip until ELSE
for (let i = start; i < mLines.length; i++) {
  let l = mLines[i].replace(/;.*$/, '');
  if (/^\s*IF\s*\(JAPANESE\)/i.test(l)) { skip = true; continue; }
  if (/^\s*ELSE/i.test(l)) { skip = false; continue; }
  if (/^\s*ENDIF/i.test(l)) { skip = false; continue; }
  if (i > start && /^\w+:/.test(mLines[i])) break;     // next label = end of table
  if (skip) continue;
  const dm = l.match(/\bdb\s+(.+)$/i);
  if (dm) for (const t of dm[1].split(',').map((s) => s.trim()).filter(Boolean)) rm.push(num(t));
}

// ---- Our tables from game.js ----------------------------------------------
const gjs = R('web/game.js');
// game.js ROOMS_MUSIC is now the full RoomsMusic byte table; music nibble = b>>4.
const rmBytes = gjs.match(/const ROOMS_MUSIC = \[([\s\S]*?)\];/)[1]
  .replace(/\/\/.*$/gm, '').match(/-?\d+/g).map(Number);
const rmArr = rmBytes.map((b) => b >> 4);
const shotSecure = new Set(
  gjs.match(/const ROOM_SHOT_SECURE = new Set\(\[([\s\S]*?)\]\)/)[1].replace(/\/\/.*$/gm, '').match(/\d+/g).map(Number));
const callRooms = new Set((J('web/assets/radio.json')?.callRooms) || []);
const MUSIC_NAME = { 0: 'Theme of Tara', 1: 'Sneaking Mission', 2: 'Metal Gear TX-55', 4: 'Beyond Big Boss' };

// ROM RoomShotSecure table (logic/checkweaponalert.asm) — the explicit shoot-secure rooms.
const cwa = readRom('logic/checkweaponalert.asm').split(/\r?\n/);
const rss = [];
{ const s = cwa.findIndex((l) => l.startsWith('RoomShotSecure:'));
  for (let i = s; i < cwa.length; i++) {
    const dm = cwa[i].replace(/;.*$/, '').match(/\bdb\s+(.+)$/i);
    if (dm) for (const t of dm[1].split(',').map((x) => x.trim()).filter(Boolean)) rss.push(num(t));
    else if (i > s && /^\w+:/.test(cwa[i])) break;
  } }
const romShotSecure = new Set(rss);

// ---- Per-room compare ------------------------------------------------------
// Shooting raises no alarm when room is in RoomShotSecure OR IsolatedRoom==1 (RoomsMusic&7==1).
const isolated = (b) => (b & 7) === 1;
const romSecure = (n) => romShotSecure.has(n) || isolated(rm[n] || 0);
const rows = [], musicMiss = [], callMiss = [], secureMiss = [];
for (let n = 0; n < rm.length; n++) {
  const b = rm[n];
  const romMusic = b >> 4, romCall = !!(b & 8);
  const ourMusic = rmArr[n] || 0, ourCall = callRooms.has(n);
  const mOK = romMusic === ourMusic, cOK = romCall === ourCall;
  const sec = romSecure(n), oursSec = shotSecure.has(n) || isolated(rmBytes[n] || 0), sOK = sec === oursSec;
  if (!mOK) musicMiss.push(`room ${n}: ROM=${romMusic}(${MUSIC_NAME[romMusic] || '?'}) ours=${ourMusic}`);
  if (!cOK) callMiss.push(`room ${n}: ROM call=${romCall} ours=${ourCall}`);
  if (!sOK) secureMiss.push(`room ${n}: ROM shoot-secure=${sec} ours=${oursSec}${isolated(b) ? ' (IsolatedRoom)' : ''}`);
  rows.push({ n, romMusic, romCall, ourMusic, ourCall, sec, oursSec, mOK, cOK, sOK });
}
// ROM-faithful generated table (the full RoomsMusic bytes — paste into game.js as ROOMS_MUSIC):
const isoNotInTable = [];
for (let n = 0; n < rm.length; n++) if (isolated(rm[n]) && !romShotSecure.has(n)) isoNotInTable.push(n);

console.log(`RoomsMusic rooms parsed: ${rm.length}`);
console.log(`music mismatches: ${musicMiss.length}`);
console.log(`call-bit mismatches: ${callMiss.length}`);
console.log(`shoot-secure mismatches: ${secureMiss.length}`);
console.log(`our RoomShotSecure matches ROM table: ${[...romShotSecure].every((r) => shotSecure.has(r)) && romShotSecure.size === [...shotSecure].filter((r) => romShotSecure.has(r)).length}`);
if (musicMiss.length) console.log('\nMUSIC:\n  ' + musicMiss.join('\n  '));
if (secureMiss.length) console.log(`\nSHOOT-SECURE gap (IsolatedRoom rooms not honored): ${secureMiss.length}\n  ` + secureMiss.slice(0, 80).join('\n  '));
// Emit the full RoomsMusic byte table in 16-per-row form for pasting.
let tbl = '';
for (let i = 0; i < rm.length; i += 16) tbl += '  ' + rm.slice(i, i + 16).join(',') + ',\n';
console.log('\n--- generated ROOMS_MUSIC bytes (paste; derive music = b>>4, isolated = (b&7)==1) ---\n' + tbl);
console.log(`IsolatedRoom rooms not in RoomShotSecure (count ${isoNotInTable.length}).`);

// ---- Markdown (per-room music table appended by the notes doc) -------------
const md = [];
md.push('# Sound & music audit (per room / per event)', '');
md.push('_Generated by `node Tools/audit/audit-sound.mjs`. Curated catalog + gaps are hand-maintained in [sound-audit-notes.md](sound-audit-notes.md)._', '');
md.push(`RoomsMusic table: ${rm.length} rooms. Music-track mismatches: **${musicMiss.length}**, call-bit: **${callMiss.length}**, shoot-secure: **${secureMiss.length}**.`, '');
md.push('## Per-room music (RoomsMusic high nibble) + flags', '');
md.push('Legend: ✓ match · ✗ mismatch. Call = RoomsMusic bit 3 (incoming radio call). Shoot-secure = gunfire raises no alarm (RoomShotSecure ∪ IsolatedRoom, RoomsMusic&7==1). Plain rooms (Tara, no call, not secure, matching) omitted.', '');
md.push('| Room | ROM music | ours | call ROM/ours | shoot-secure ROM/ours |', '|---|---|---|---|---|');
for (const r of rows) {
  if (r.mOK && r.cOK && r.sOK && r.romMusic === 0 && !r.romCall && !r.sec) continue; // skip plain matching rows
  const m = r.mOK ? '✓' : '✗';
  md.push(`| ${r.n} | ${r.romMusic} ${MUSIC_NAME[r.romMusic] || '?'} | ${m} ${r.ourMusic} | ${r.romCall ? 'Y' : '-'}/${r.ourCall ? 'Y' : '-'}${r.cOK ? '' : ' ✗'} | ${r.sec ? 'Y' : '-'}/${r.oursSec ? 'Y' : '-'}${r.sOK ? '' : ' ✗'} |`);
}
fs.writeFileSync(path.join(root, 'docs', 'sound-audit.md'), md.join('\n') + '\n');
console.log('\nWrote docs/sound-audit.md');
