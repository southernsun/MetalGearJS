// Dev helper: print font glyphs (gfx/font.asm 1bpp, gfxFont + gfxSymbChars) as ASCII art so
// the custom punctuation mapping (char code -> drawn symbol) can be read off.
// Usage: node Tools/dump-glyphs.mjs <charHex> [charHex...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from './rom-source.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readRom('gfx/font.asm');

const bytes = [];
let on = false;
for (let line of src.split(/\r?\n/)) {
  if (/^gfxFont:|^gfxSymbChars:/.test(line)) on = true;
  else if (/^\w+:/.test(line)) on = false;
  if (!on) continue;
  line = line.replace(/^\w+:/, '').replace(/;.*$/, '');
  const dm = line.match(/\bdb\s+(.+)$/i);
  if (!dm) continue;
  for (const tok of dm[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    if (/^0?[0-9A-F]+h$/i.test(tok)) bytes.push(parseInt(tok.replace(/h$/i, ''), 16));
    else bytes.push(parseInt(tok, 10));
  }
}

for (const arg of process.argv.slice(2)) {
  const ch = parseInt(arg, 16);
  const glyph = ch - 0x30;
  console.log(`char 0x${ch.toString(16)} (glyph ${glyph}):`);
  for (let y = 0; y < 8; y++) {
    const row = bytes[glyph * 8 + y] || 0;
    console.log('  ' + [...Array(8)].map((_, x) => ((row >> (7 - x)) & 1) ? '#' : '.').join(''));
  }
}
