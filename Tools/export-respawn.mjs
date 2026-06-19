// Export the alert-reinforcement table (data/respawninfo.asm RespawnInfo) to
// web/assets/respawn.json: { "<room>": { id, locs: [[x,y],[x,y]] } }.
//
// ChkRespawnEnemy (Banks0123.asm:6559-6627): 3 bytes per room — [enemyId, loc1, loc2];
// a location byte packs BOTH coords: Y = byte & 0xF0, X = (byte & 0x0F) * 16. The two
// spots alternate on TickCounter bit 0. Limits: 3 of ID_GUARD_REDALERT/ID_JETPACK,
// 4 of anything else; no respawning from room 188 on.
// Run: node Tools/export-respawn.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from './rom-source.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readRom('data/respawninfo.asm');
const num = (t) => (/h$/i.test(t) ? parseInt(t, 16) : parseInt(t, 10));

const bytes = [];
let inTable = false;
for (let line of src.split(/\r?\n/)) {
  line = line.replace(/;.*$/, '');
  if (!inTable) { if (/^RespawnInfo:/.test(line)) inTable = true; else continue; }
  else if (/^\w+:/.test(line)) break;
  const m = line.match(/\bdb\s+(.+)$/i);
  if (!m) continue;
  for (const tok of m[1].split(',').map((s) => s.trim()).filter(Boolean)) bytes.push(num(tok));
}

const out = {};
for (let room = 0; room * 3 + 2 < bytes.length; room++) {
  const id = bytes[room * 3];
  if (!id) continue;
  const loc = (b) => [(b & 0x0F) * 16, b & 0xF0];               // [x, y]
  out[room] = { id, locs: [loc(bytes[room * 3 + 1]), loc(bytes[room * 3 + 2])] };
}
fs.writeFileSync(path.join(root, 'web', 'assets', 'respawn.json'), JSON.stringify(out) + '\n');
console.log('respawn.json:', Object.keys(out).length, 'rooms with reinforcements');
