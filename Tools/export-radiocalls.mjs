// Export the per-room radio callers (data/radiocalls.asm, non-JP) to web/assets/radiocalls.json,
// flattened the way UpdateRadio (Banks0123.asm:2379) builds RadioPersonsDat.
//
// Record byte 0 (semantics from the CODE, which the file-header comment contradicts):
//   bits 7-4 = person id (1=Big Boss .. 7=Big Boss bldg2) -> frequency via RadioFreqs
//   bit 2    = WAIT-CALL (ChkRadioReceiv4 stored-bit0: set -> answers only after SEND;
//              clear -> auto-reply) — the RADIO_WAITCALL equate (4)
//   bit 3    = AUTO-TUNE (UpdateRadio stored-bit1: sets RadioFreq on room entry) — the
//              misleadingly named RADIO_AUTOREPLY equate (8)
//   bit 0    = end of the room's list (RADIO_END)
// Byte 1 = text id (idxTexts).
//
// Output: { "<room>": [{ freq, waitCall, autoTune, textId }, ...] } — freq is the BCD byte
// (0x85 -> displayed "120.85").
//
// Run: node Tools/export-radiocalls.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from './rom-source.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readRom(p);   // disassembly sources resolve under the sibling ROM dir

// RADIO_*/FREQ_* equates.
const enums = {};
for (const line of read('constants/Enums.asm').split(/\r?\n/)) {
  const m = line.match(/^(\w+):?\s+equ\s+(\S+)/i);
  if (m) enums[m[1]] = /h$/i.test(m[2]) ? parseInt(m[2].replace(/h$/i, ''), 16) : parseInt(m[2], 10);
}
// RadioFreqs (Banks0123.asm:2455): person id 1..7 -> frequency byte.
const RADIO_FREQS = ['FREQ_BIGBOSS', 'FREQ_SCHNEIDER', 'FREQ_DIANE', 'FREQ_SCHNEIDER_BUILDING2',
                     'FREQ_DIANE_BUILDING2', 'FREQ_JENIFFER', 'FREQ_BIGBOSS_BUILDING2']
  .map((n) => enums[n]);

// Parse data/radiocalls.asm into label -> bytes / dw label lists.
const byLabel = {};
let cur = null;
for (let line of read('data/radiocalls.asm').split(/\r?\n/)) {
  line = line.replace(/;.*$/, '');
  const lm = line.match(/^(\w+):/);
  if (lm) { cur = { bytes: [], words: [] }; byLabel[lm[1]] = cur; line = line.slice(lm[0].length); }
  if (!cur) continue;
  const dm = line.match(/^\s*(db|dw)\s+(.+)$/i);
  if (!dm) continue;
  const isWord = dm[1].toLowerCase() === 'dw';
  for (const tok of dm[2].split(',').map((s) => s.trim()).filter(Boolean)) {
    if (isWord && /^[A-Za-z_]\w*$/.test(tok)) { cur.words.push(tok); continue; }
    // db value: number, equate, or OR-expression of equates.
    let v = 0;
    for (const part of tok.split('|').map((s) => s.trim())) {
      if (/^0?[0-9A-F]+h$/i.test(part)) v |= parseInt(part.replace(/h$/i, ''), 16);
      else if (/^\d+$/.test(part)) v |= parseInt(part, 10);
      else if (part in enums) v |= enums[part];
      else throw new Error('Cannot parse: ' + part);
    }
    cur.bytes.push(v);
  }
}

const roomLabels = byLabel['idxRoomRadio'].words;
const rooms = {};
roomLabels.forEach((label, room) => {
  if (label === 'NoRadio') return;
  const b = byLabel[label].bytes;
  const list = [];
  for (let i = 0; i + 1 < b.length; i += 2) {
    const person = b[i] >> 4;
    list.push({
      freq: RADIO_FREQS[person - 1],
      waitCall: (b[i] & 4) !== 0,
      autoTune: (b[i] & 8) !== 0,
      textId: b[i + 1],
    });
    if (b[i] & 1) break;                       // RADIO_END
  }
  if (list.length) rooms[room] = list;
});

const outPath = path.join(repo, 'web', 'assets', 'radiocalls.json');
fs.writeFileSync(outPath, JSON.stringify(rooms) + '\n');
const r0 = JSON.stringify(rooms[0]);
console.log(`Wrote ${outPath}: ${Object.keys(rooms).length} rooms with callers; room 0 = ${r0}`);
if (!rooms[0] || rooms[0][0].freq !== 0x85 || rooms[0][0].waitCall || rooms[0][0].textId !== 3)
  throw new Error('Sanity failed: room 0 should be Big Boss 0x85 auto-reply text 3');
