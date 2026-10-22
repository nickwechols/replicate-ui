#!/usr/bin/env node
// compare-captures.cjs — diff two capture-site.cjs runs (reference vs build) and list what the build is missing.
// Usage: node compare-captures.cjs <reference-capture-dir> <build-capture-dir> [--out compare.md] [--top 5]
// Reads <dir>/data.json from each run. Exit code 0 always; read the report.
'use strict';
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const [REF, BUILD] = argv.filter(a => !a.startsWith('--') && !['--out', '--top'].includes(argv[argv.indexOf(a) - 1]));
if (!REF || !BUILD) { console.error('usage: node compare-captures.cjs <reference-dir> <build-dir> [--out compare.md] [--top 5]'); process.exit(1); }
const TOP = +opt('top', 5), OUT = opt('out', path.join(BUILD, 'compare.md'));
const load = d => JSON.parse(fs.readFileSync(path.join(d, 'data.json'), 'utf8'));
const ref = load(REF), build = load(BUILD);

function aggregate(run) {
  const T = {}, text = {}, hovers = [], reveals = [], vars = {};
  for (const p of run.pages) {
    const e = p.extract; if (!e) continue;
    for (const k in e.tally) for (const [v, c] of Object.entries(e.tally[k])) (T[k] ||= {})[v] = (T[k][v] || 0) + c;
    for (const [k, v] of Object.entries(e.text)) { const [, size, weight, lh, ls, tt, st] = k.split(' | '); const kk = [size, weight, lh, ls, tt, st].join(' | '); text[kk] = (text[kk] || 0) + v.n; }
    Object.assign(vars, e.vars || {});
    (p.hovers || []).forEach(h => hovers.push({ sig: h.sig, props: Object.keys(h.diff).map(k => k.split(' ').pop()), transition: h.transition }));
    (p.reveals || []).forEach(r => reveals.push(r));
  }
  return { T, text, hovers, reveals, vars, css: run.css || {} };
}
const R = aggregate(ref), B = aggregate(build);
const top = (o, n) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
const hex = s => { const m = /^#([0-9a-f]{6})/i.exec(s || ''); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const near = (a, b) => { const x = hex(a), y = hex(b); if (!x || !y) return a === b; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 10 && (a.includes('@') === b.includes('@')); };

let total = 0, hit = 0;
const L = [`# Capture comparison`, '', `Reference: ${ref.origin} (${ref.pages.length} pages) · Build: ${build.origin} (${build.pages.length} pages)`, '', 'A ✗ is a top value in the reference that the build does not use anywhere. Fix those first; extra values in the build are listed so stray one-offs can be removed.', ''];
function section(title, key, fuzzy) {
  const rt = top(R.T[key], TOP), bAll = Object.keys(B.T[key] || {});
  if (!rt.length) return;
  L.push(`## ${title}`);
  for (const v of rt) { total++; const ok = bAll.some(b => fuzzy ? near(v, b) : b === v); if (ok) hit++; L.push(`- ${ok ? '✓' : '✗'} \`${v}\``); }
  const extra = top(B.T[key], TOP).filter(b => !Object.keys(R.T[key] || {}).some(r => fuzzy ? near(r, b) : r === b));
  if (extra.length) L.push(`- extra in build: ${extra.map(e => '`' + e + '`').join(', ')}`);
  L.push('');
}
section('Text colours', 'color', true); section('Background colours', 'background', true);
section('Radii', 'radius'); section('Borders', 'border', false); section('Shadows', 'shadow');
section('Spacing values', 'space'); section('Transitions', 'transition');

L.push('## Type styles (size | weight | line-height | tracking | case | style; family ignored)');
const bt = Object.keys(B.text);
for (const k of top(R.text, TOP + 3)) { total++; const ok = bt.includes(k); if (ok) hit++; L.push(`- ${ok ? '✓' : '✗'} \`${k}\``); }
L.push('');

L.push('## Hover behaviour (which properties change per component type)');
if (!R.hovers.length) L.push('- reference has no measured hovers');
for (const h of R.hovers) {
  total++;
  const m = B.hovers.find(b => h.props.every(p => b.props.includes(p)));
  if (m) hit++;
  L.push(`- ${m ? '✓' : '✗'} ${h.sig}: changes ${h.props.join(', ')} with \`${h.transition}\`${m ? ` (build: ${m.sig}, \`${m.transition}\`)` : ''}`);
}
L.push('');

L.push('## Motion');
const kfR = Object.keys(R.css.keyframes || {}), kfB = Object.keys(B.css.keyframes || {});
L.push(`- scroll reveals: reference ${R.reveals.length}, build ${B.reveals.length}`);
L.push(`- @keyframes: reference ${kfR.length} (${kfR.slice(0, 8).join(', ') || '-'}), build ${kfB.length} (${kfB.slice(0, 8).join(', ') || '-'})`);
L.push(`- reduced motion handled: reference ${R.css.reducedMotion ? 'yes' : 'no'}, build ${B.css.reducedMotion ? 'yes' : 'no'}`);
L.push(`- hover guarded by (hover: hover): reference ${R.css.hoverGuard ? 'yes' : 'no'}, build ${B.css.hoverGuard ? 'yes' : 'no'}`);
L.push('');
L.push(`## Score`, `${hit} of ${total} reference values matched (${total ? Math.round(hit / total * 100) : 0}%).`, '', 'Then compare the fold screenshots side by side per template, at desktop and phone. Numbers catch drift; only eyes catch feel.');
fs.writeFileSync(OUT, L.join('\n'));
console.log(`[compare] ${hit}/${total} matched → ${OUT}`);
