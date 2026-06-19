#!/usr/bin/env node
// ROM -> JS coverage tracker for the Metal Gear browser port.
//
// Denominator (automated): routine labels parsed from the disassembly `.asm` files assigned to
// each gameplay component. Numerator (curated): the per-routine status in coverage-map.json.
// Routines present in source but absent from the map default to `todo` (so we under-claim, never
// over-claim). `out-of-scope` routines/files are excluded from the totals.
//
// Usage:
//   node Tools/coverage/coverage.mjs           # print the table + (re)write docs/rom-coverage.md
//   node Tools/coverage/coverage.mjs --check    # exit 1 if docs/rom-coverage.md is stale (for CI)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { romDir, readRom } from '../rom-source.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');               // Tools/coverage -> repo root
const MAP_PATH = path.join(HERE, 'coverage-map.json');
const DOC_PATH = path.join(REPO, 'docs', 'rom-coverage.md');
const LABEL_RE = /^([A-Za-z_][A-Za-z0-9_]*):/;             // a routine label at column 0

const warnings = [];

// Parse the routine labels (and line count) of one .asm file from the disassembly source tree.
// Individually-missing files are tolerated (warn + under-claim); a missing disassembly dir
// surfaces readRom's actionable "clone southernsun/MetalGear / set MG_ROM_DIR" error.
function parseLabels(relFile) {
  if (!fs.existsSync(path.join(romDir, relFile))) { warnings.push(`missing file: ${relFile}`); return { labels: [], lines: 0, missing: true }; }
  const rows = readRom(relFile).split(/\r?\n/);
  const labels = [];
  rows.forEach((line) => { const m = LABEL_RE.exec(line); if (m) labels.push(m[1]); });
  return { labels, lines: rows.length, missing: false };
}

function resolveStatus(comp, name, file, oos) {
  if (oos.files.has(file) || oos.routines.has(name)) return 'out-of-scope';
  return (comp.status && comp.status[name]) || 'todo';
}

function analyze(map) {
  const oos = { files: new Set(map.outOfScope?.files || []), routines: new Set(map.outOfScope?.routines || []) };
  const fileCache = new Map();
  const getLabels = (f) => { if (!fileCache.has(f)) fileCache.set(f, parseLabels(f)); return fileCache.get(f); };

  const results = [];
  for (const comp of map.components) {
    const routines = [];                                   // { name, file }
    const known = new Set();
    for (const f of comp.files || []) {
      for (const name of getLabels(f).labels) { routines.push({ name, file: f }); known.add(name); }
    }
    for (const r of comp.extraRoutines || []) {            // explicit routines from shared files
      const present = getLabels(r.file).labels.includes(r.name);
      if (!present) warnings.push(`[${comp.id}] extraRoutine not found: ${r.name} in ${r.file}`);
      routines.push({ name: r.name, file: r.file }); known.add(r.name);
    }
    // Validate that every curated status / jsRef key actually exists in this component's sources.
    for (const key of Object.keys(comp.status || {})) if (!known.has(key)) warnings.push(`[${comp.id}] status names unknown routine: ${key}`);
    for (const key of Object.keys(comp.jsRef || {})) if (!known.has(key)) warnings.push(`[${comp.id}] jsRef names unknown routine: ${key}`);

    const counts = { total: routines.length, done: 0, partial: 0, todo: 0, oos: 0 };
    const byStatus = { done: [], partial: [], todo: [] };
    for (const r of routines) {
      const s = resolveStatus(comp, r.name, r.file, oos);
      if (s === 'out-of-scope') counts.oos++;
      else { counts[s] = (counts[s] || 0) + 1; (byStatus[s] || byStatus.todo).push(r.name); }
    }
    const inScope = counts.total - counts.oos;
    const pct = inScope ? Math.round((100 * counts.done) / inScope) : 0;
    const blended = inScope ? Math.round((100 * (counts.done + 0.5 * counts.partial)) / inScope) : 0;
    results.push({ comp, counts, inScope, pct, blended, byStatus });
  }
  return results;
}

function pct(n, d) { return d ? Math.round((100 * n) / d) : 0; }

function render(results, tooling) {
  const tot = { done: 0, partial: 0, todo: 0, oos: 0, inScope: 0, total: 0 };
  for (const r of results) {
    tot.done += r.counts.done; tot.partial += r.counts.partial; tot.todo += r.counts.todo;
    tot.oos += r.counts.oos; tot.inScope += r.inScope; tot.total += r.counts.total;
  }
  const oPct = pct(tot.done, tot.inScope), oBlend = pct(tot.done + 0.5 * tot.partial, tot.inScope);

  const L = [];
  L.push('# ROM → JS coverage');
  L.push('');
  L.push('How much of the original Metal Gear (MSX) disassembly the browser port has reimplemented,');
  L.push('per gameplay component. **Generated** by `Tools/coverage/coverage.mjs` — run that to refresh;');
  L.push('do not edit by hand.');
  L.push('');
  L.push('Honesty notes:');
  L.push('- The **denominator** is parsed automatically from the `.asm` routine labels of each');
  L.push("  component's files (gameplay code only — MSX hardware init, the PSG/sound-driver internals,");
  L.push('  and copy-protection are not counted).');
  L.push('- The **numerator** is curated in `Tools/coverage/coverage-map.json`. "Done" is a judgement,');
  L.push('  and faithfulness varies — some routines are ported with documented divergences. Routines');
  L.push('  present in source but not yet mapped count as `todo` (we under-claim, never over-claim).');
  L.push('- `partial` = some behaviour in place with known gaps. The blended % counts it as half.');
  L.push('');
  L.push('| Component | Files | Done | Partial | Todo | In-scope | Done % | Blended % |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of results) {
    L.push(`| ${r.comp.title} | ${(r.comp.files || []).length + (r.comp.extraRoutines ? 1 : 0)} | ${r.counts.done} | ${r.counts.partial} | ${r.counts.todo} | ${r.inScope} | ${r.pct}% | ${r.blended}% |`);
  }
  L.push(`| **Overall (gameplay)** | | **${tot.done}** | **${tot.partial}** | **${tot.todo}** | **${tot.inScope}** | **${oPct}%** | **${oBlend}%** |`);
  L.push('');

  if (tooling && tooling.length) {
    L.push('## Offline tooling (not routine-counted)');
    L.push('');
    L.push('These reimplement ROM **data decoding** in the C# export tools rather than porting game');
    L.push('logic to JS, so they are tracked qualitatively (the PSG/sound driver itself is out-of-scope).');
    L.push('');
    for (const t of tooling) L.push(`- **${t.title}** — ${t.status}. ${t.notes || ''}`.trimEnd());
    L.push('');
  }

  L.push('## What is covered, per component');
  L.push('');
  for (const r of results) {
    L.push(`### ${r.comp.title}`);
    if (r.comp.notes) L.push(`${r.comp.notes}`);
    L.push(`Sources: ${(r.comp.files || []).map((f) => `\`${f}\``).join(', ')}` +
           (r.comp.extraRoutines ? ` + ${r.comp.extraRoutines.length} routine(s) from shared files` : ''));
    if (r.byStatus.done.length) L.push(`- **Done (${r.byStatus.done.length}):** ${r.byStatus.done.join(', ')}`);
    if (r.byStatus.partial.length) L.push(`- **Partial (${r.byStatus.partial.length}):** ${r.byStatus.partial.join(', ')}`);
    if (r.byStatus.todo.length) L.push(`- **Todo (${r.byStatus.todo.length}):** ${r.byStatus.todo.join(', ')}`);
    L.push('');
  }
  return L.join('\n');
}

// ---- main ----
const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
// Fail fast (clear, actionable error) if the disassembly source tree is missing entirely,
// rather than silently emitting an empty coverage doc.
if (!fs.existsSync(romDir)) readRom('MetalGear.asm');
const results = analyze(map);
const doc = render(results, map.tooling) + '\n';

const isCheck = process.argv.includes('--check');
if (isCheck) {
  const current = fs.existsSync(DOC_PATH) ? fs.readFileSync(DOC_PATH, 'utf8') : '';
  if (current !== doc) {
    console.error('docs/rom-coverage.md is STALE — run `node Tools/coverage/coverage.mjs` to refresh.');
    process.exit(1);
  }
  console.log('docs/rom-coverage.md is up to date.');
} else {
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  fs.writeFileSync(DOC_PATH, doc);
  // Console summary
  for (const r of results) {
    console.log(`${r.comp.id.padEnd(20)} done ${String(r.counts.done).padStart(3)}  partial ${String(r.counts.partial).padStart(3)}  todo ${String(r.counts.todo).padStart(3)}  in-scope ${String(r.inScope).padStart(3)}  ${String(r.pct).padStart(3)}%  (blended ${r.blended}%)`);
  }
  console.log(`\nWrote ${path.relative(REPO, DOC_PATH)}`);
}

if (warnings.length) {
  console.error(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.error('  - ' + w);
  if (isCheck) process.exit(1);
}
