#!/usr/bin/env node
// capture-site.cjs — one-pass, whole-site design + interaction capture for replicate-ui.
// Usage: node capture-site.cjs <url> [--out site-capture] [--max 14] [--per-template 1]
//        [--pages /a,/b] [--only /a,/b] [--list] [--budget 170] [--no-video] [--concurrency 3]
//   --list     print the planned pages as JSON and exit (plan batches with it)
//   --only     capture just these paths from the plan (run long crawls in batches)
//   --budget   seconds; stop starting new pages after this and list what is left
// Output: <out>/summary.md (read this first), <out>/data.json, <out>/shots/*, <out>/video/*
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
function loadPW() {
  try { return require('playwright'); } catch {}
  const root = execSync('npm root -g').toString().trim();
  return require(path.join(root, 'playwright'));
}
const { chromium } = loadPW();

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const START = argv.find(a => !a.startsWith('--') && /^https?:|^file:/.test(a));
if (!START) { console.error('usage: node capture-site.cjs <url> [--out dir] [--max 14]'); process.exit(1); }
const OUT = opt('out', 'site-capture'), MAX = +opt('max', 14), PER = +opt('per-template', 1);
const VIDEO = !argv.includes('--no-video'), CONC = +opt('concurrency', 3);
const EXTRA = (opt('pages', '') || '').split(',').filter(Boolean);
const ONLY = (opt('only', '') || '').split(',').filter(Boolean);
const BUDGET = +opt('budget', 0) * 1000, T0 = Date.now();
const hasFfmpeg = (() => { try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true; } catch { return false; } })();
const origin = new URL(START).origin;
for (const d of ['', 'shots', 'video', 'html']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const slug = u => (new URL(u).pathname.replace(/\/$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home').slice(0, 60);
const log = (...a) => console.log('[capture]', ...a);
const hexify = v => v.replace(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/g, (m, r, g, b, a) => '#' + [r, g, b].map(x => (+x).toString(16).padStart(2, '0')).join('') + (a !== undefined && +a < 1 ? '@' + a : ''));

// Skip pages that are not design-relevant or that we must not replicate.
const SKIP = /\/(cart|checkout|account|login|signin|sign-in|register|signup|password|admin|wp-admin|wp-login|cdn-cgi|search)(\/|$)|\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|xml|json|txt)$/i;
const CONSENT_CSS = `#onetrust-banner-sdk,#onetrust-consent-sdk,.cc-window,.cookie-banner,#CybotCookiebotDialog,
[id*="cookie" i][class*="banner" i],[class*="cookie-consent" i],[id*="consent" i],[class*="consent-banner" i],
.klaviyo-form,[class*="needsclick"][role="dialog"],.privy-popup{display:none!important}`;

// ---------- discovery ----------
async function discover(ctx) {
  const urls = new Map(); // url -> priority (lower = earlier)
  const add = (u, p) => {
    try {
      const x = new URL(u, START); if (x.origin !== origin) return;
      x.hash = ''; x.search = '';
      const s = x.href; if (SKIP.test(x.pathname)) return;
      if (!urls.has(s) || urls.get(s) > p) urls.set(s, p);
    } catch {}
  };
  add(START, 0); EXTRA.forEach(p => add(p, 0));
  // sitemap(s)
  const seen = new Set();
  async function sitemap(u, depth) {
    if (seen.has(u) || depth > 2 || seen.size > 8) return; seen.add(u);
    try {
      const r = await ctx.request.get(u, { timeout: 10000 }); if (!r.ok()) return;
      const t = await r.text(); const locs = [...t.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
      if (/<sitemapindex/i.test(t)) { for (const l of locs.slice(0, 6)) await sitemap(l, depth + 1); }
      else locs.slice(0, 400).forEach(l => add(l, 3));
    } catch {}
  }
  try {
    const rb = await ctx.request.get(origin + '/robots.txt', { timeout: 8000 });
    if (rb.ok()) for (const m of (await rb.text()).matchAll(/^sitemap:\s*(\S+)/gim)) await sitemap(m[1], 0);
  } catch {}
  await sitemap(origin + '/sitemap.xml', 0);
  // links on home: nav/header/footer links get top priority
  const page = await ctx.newPage();
  try {
    await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    const links = await page.$$eval('a[href]', as => as.map(a => ({ h: a.href, nav: !!a.closest('nav,header,footer,[role=navigation]') })));
    links.forEach(l => add(l.h, l.nav ? 1 : 2));
  } catch (e) { log('home link scan failed', e.message); }
  await page.close();
  return [...urls.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0]);
}

// Group URLs into templates: /products/a and /products/b are one template.
function templateKey(u) {
  const segs = new URL(u).pathname.split('/').filter(Boolean);
  if (segs.length === 0) return '/';
  if (segs.length === 1) return '/' + segs[0];
  return '/' + segs.slice(0, -1).join('/') + '/*';
}
function pickPages(all) {
  const groups = new Map();
  for (const u of all) { const k = templateKey(u); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(u); }
  // A single-segment page that has children (/products and /products/*) stays its own template.
  const picked = [], skipped = [];
  for (const [k, list] of groups) {
    const n = k.endsWith('/*') ? PER : 1;
    list.slice(0, n).forEach(u => picked.push({ url: u, template: k, groupSize: list.length }));
    list.slice(n).forEach(u => skipped.push(u));
  }
  // keep discovery priority order, cap
  const order = new Map(all.map((u, i) => [u, i]));
  picked.sort((a, b) => order.get(a.url) - order.get(b.url));
  const final = picked.slice(0, MAX);
  return { final, skippedSameTemplate: skipped.length, overCap: picked.slice(MAX).map(p => p.url), groups: Object.fromEntries([...groups].map(([k, v]) => [k, v.length])) };
}

// ---------- in-page extractors (run in browser) ----------
const EXTRACT = () => {
  const toHex = c => {
    const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return c;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (a === 0) return null;
    const h = '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    return a < 1 ? `${h} @${+a.toFixed(2)}` : h;
  };
  const tally = {}; const bump = (k, v, w = 1) => { if (v == null || v === '' || v === 'none' || v === 'normal' || v === '0px') return; (tally[k] ||= {})[v] = (tally[k][v] || 0) + w; };
  const text = {};
  const els = [...document.body.querySelectorAll('*')].slice(0, 5000);
  for (const el of els) {
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') continue;
    const area = Math.min(r.width * r.height, 400000) / 1000 + 1;
    bump('background', toHex(s.backgroundColor), area);
    if (s.backgroundImage !== 'none' && /gradient/.test(s.backgroundImage)) bump('gradient', s.backgroundImage.slice(0, 160));
    bump('radius', s.borderRadius);
    if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') bump('border', `${s.borderTopWidth} ${s.borderTopStyle} ${toHex(s.borderTopColor)}`);
    bump('shadow', s.boxShadow);
    bump('backdrop', s.backdropFilter); bump('filter', s.filter); bump('blend', s.mixBlendMode);
    for (const p of ['paddingTop', 'paddingLeft', 'gap', 'marginBottom']) bump('space', s[p]);
    bump('transition', s.transition && !/^all( 0s)?( ease)?( 0s)?$/.test(s.transition.trim()) ? s.transition.slice(0, 200) : null);
    bump('animation', s.animationName); bump('cursor', s.cursor !== 'auto' ? s.cursor : null);
    if (s.position === 'sticky' || s.position === 'fixed') bump('pinned', `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} (${s.position})`);
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (own) {
      bump('color', toHex(s.color), el.textContent.trim().length);
      const k = [s.fontFamily.split(',')[0].replace(/["']/g, ''), s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing, s.textTransform, s.fontStyle].join(' | ');
      const t = (text[k] ||= { n: 0, tags: {}, sample: '', color: {} });
      t.n++; t.tags[el.tagName.toLowerCase()] = 1; t.color[toHex(s.color)] = 1;
      if (!t.sample) t.sample = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 50);
    }
  }
  const root = getComputedStyle(document.documentElement);
  const vars = {};
  for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.selectorText && /^(:root|html)$/.test(r.selectorText.trim())) for (const p of r.style) if (p.startsWith('--')) vars[p] = root.getPropertyValue(p).trim(); } catch {} }
  const fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family.replace(/["']/g, '')} ${f.weight} ${f.style}`);
  const sheets = [...document.querySelectorAll('link[rel~=stylesheet]')].map(l => l.href);
  const videos = [...document.querySelectorAll('video')].map(v => v.currentSrc || v.src || v.dataset.src || (v.querySelector('source[src]') || {}).src).filter(Boolean).map(u => new URL(u, location.href).href);
  const inline = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  const w = window;
  const fp = {
    gsap: !!w.gsap, ScrollTrigger: !!w.ScrollTrigger, Lenis: !!(w.Lenis || w.lenis || document.documentElement.classList.contains('lenis')),
    locomotive: !!document.querySelector('[data-scroll-container]'), three: !!w.THREE || !!document.querySelector('canvas[data-engine*=three]'),
    webgl: [...document.querySelectorAll('canvas')].some(c => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }),
    framer: !!document.querySelector('[data-framer-component-type],[data-framer-name]'), webflow: !!document.documentElement.dataset.wfPage,
    shopify: !!w.Shopify, swiper: !!w.Swiper || !!document.querySelector('.swiper'), barba: !!document.querySelector('[data-barba]'),
    swup: !!document.querySelector('#swup'), splitText: !!document.querySelector('.split-line,.char,[data-split]'),
    lottie: !!document.querySelector('lottie-player,dotlottie-player,[data-animation-path]'), spline: !!document.querySelector('spline-viewer'),
    next: !!w.__NEXT_DATA__ || !!document.querySelector('#__next'), nuxt: !!w.__NUXT__, tailwind: /\b(flex|grid) [a-z]+-\d/.test(document.body.innerHTML.slice(0, 50000)),
    smoothScrollCss: root.scrollBehavior === 'smooth', videoBg: !!document.querySelector('video[autoplay][muted],video[autoplay][loop]'),
    scripts: [...document.scripts].map(s => s.src).filter(Boolean).map(s => s.split('/').pop().split('?')[0]).filter(s => /gsap|lenis|three|swiper|barba|lottie|locomotive|splide|flickity|motion|anime|scroll/i.test(s)),
  };
  const sections = [...document.querySelectorAll('body > *, main > *, main section, [class*=section]')].filter(e => e.getBoundingClientRect().height > 120).slice(0, 25)
    .map(e => ({ tag: e.tagName.toLowerCase(), cls: [...e.classList].slice(0, 3).join('.'), h: Math.round(e.getBoundingClientRect().height), bg: toHex(getComputedStyle(e).backgroundColor) }));
  return { tally, text, vars, fonts, sheets, videos, inline, fp, sections, title: document.title, docH: document.documentElement.scrollHeight };
};

// snapshot of elements that are hidden/offset before scrolling (scroll-reveal candidates)
const REVEAL_SNAP = () => {
  const out = [];
  [...document.body.querySelectorAll('*')].slice(0, 5000).forEach((el, i) => {
    const r = el.getBoundingClientRect(); if (r.top < innerHeight || r.width < 20 || r.height < 10) return;
    const s = getComputedStyle(el);
    if (+s.opacity < 0.2 || (s.transform !== 'none' && s.transform !== 'matrix(1, 0, 0, 1, 0, 0)') || (s.clipPath && s.clipPath !== 'none')) {
      el.setAttribute('data-rc', i);
      out.push({ i, sel: el.tagName.toLowerCase() + ([...el.classList].slice(0, 2).map(c => '.' + c).join('')), opacity: s.opacity, transform: s.transform, clip: s.clipPath, transition: s.transition.slice(0, 160), anim: s.animationName });
    }
  });
  return out.slice(0, 300);
};
const REVEAL_AFTER = ids => ids.map(i => { const el = document.querySelector(`[data-rc="${i}"]`); if (!el) return null; const s = getComputedStyle(el); return { i, opacity: s.opacity, transform: s.transform, clip: s.clipPath }; });

// interactive candidates with a de-dupe signature
const HOVER_CANDS = () => {
  const sel = 'a,button,[role=button],[class*=card],[class*=btn],[class*=button],[class*=tile],[class*=product],img,summary,input,select,[tabindex]';
  const seen = {}; const out = [];
  document.querySelectorAll(sel).forEach((el, i) => {
    const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || (r.width > innerWidth * 0.98 && r.height > 500)) return;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || +s.opacity === 0) return;
    const sig = el.tagName.toLowerCase() + '.' + [...el.classList].filter(c => !/active|current|is-|js-|\d{3,}/.test(c)).slice(0, 3).sort().join('.') + (el.closest('nav,header') ? '@nav' : el.closest('footer') ? '@footer' : '');
    if (seen[sig]) return; seen[sig] = 1; el.setAttribute('data-hc', i); out.push({ i, sig, text: (el.innerText || el.alt || '').trim().slice(0, 30) });
  });
  return out;
};
const STYLE_OF = i => {
  const el = document.querySelector(`[data-hc="${i}"]`); if (!el) return null;
  const P = ['color', 'backgroundColor', 'backgroundImage', 'borderColor', 'boxShadow', 'transform', 'opacity', 'textDecorationLine', 'textDecorationColor', 'textUnderlineOffset', 'outline', 'filter', 'scale', 'translate', 'clipPath', 'letterSpacing', 'fontWeight', 'width', 'borderRadius', 'cursor', 'borderTopWidth', 'outlineStyle'];
  const grab = e => { const s = getComputedStyle(e); const o = {}; P.forEach(p => o[p] = s[p]); const b = getComputedStyle(e, '::before'), a = getComputedStyle(e, '::after'); o['::before'] = `${b.content}|${b.transform}|${b.width}|${b.opacity}|${b.backgroundColor}`; o['::after'] = `${a.content}|${a.transform}|${a.width}|${a.opacity}|${a.backgroundColor}`; return o; };
  const kids = [...el.querySelectorAll('*')].slice(0, 6);
  const s = getComputedStyle(el);
  const durs = (s.transitionDuration + ',' + kids.map(k => getComputedStyle(k).transitionDuration).join(',')).split(',').map(v => parseFloat(v) * (v.includes('ms') ? 1 : 1000)).filter(n => !isNaN(n));
  return { self: grab(el), kids: kids.map((k, j) => ({ j, tag: k.tagName.toLowerCase() + '.' + [...k.classList].slice(0, 2).join('.'), st: grab(k) })), transition: s.transition.slice(0, 200), maxDur: Math.max(0, ...durs) };
};

// ---------- CSS text analysis (shared stylesheets parsed once) ----------
function parseCSS(css) {
  const out = { hover: [], focus: [], active: [], keyframes: {}, media: new Set(), hoverGuard: /@media[^{]*\(hover:\s*hover\)/.test(css), reducedMotion: /prefers-reduced-motion/.test(css), fontFace: [] };
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/@media\s*([^{]+)\{/g)) out.media.add(m[1].trim().replace(/\s+/g, ' ').slice(0, 80));
  // keyframes via brace matching
  const kre = /@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{/g; let m;
  while ((m = kre.exec(css))) { let d = 1, j = kre.lastIndex; while (j < css.length && d) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; } out.keyframes[m[1]] = css.slice(kre.lastIndex, j - 1).replace(/\s+/g, ' ').slice(0, 300); }
  for (const f of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) { const fam = (f[1].match(/font-family:\s*([^;]+)/) || [])[1]; const w = (f[1].match(/font-weight:\s*([^;]+)/) || [])[1]; const src = (f[1].match(/url\(([^)]+)\)/) || [])[1]; if (fam) out.fontFace.push(`${fam.replace(/["']/g, '').trim()} ${w || ''} ${src ? src.replace(/["']/g, '').split('/').pop().split('?')[0] : ''}`.trim()); }
  for (const r of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const sel = r[1].trim().replace(/\s+/g, ' '), body = r[2].trim().replace(/\s+/g, ' ');
    if (!body) continue;
    if (/:hover/.test(sel)) out.hover.push(`${sel.slice(0, 140)} { ${body.slice(0, 220)} }`);
    if (/:focus/.test(sel)) out.focus.push(`${sel.slice(0, 140)} { ${body.slice(0, 160)} }`);
    if (/:active/.test(sel)) out.active.push(`${sel.slice(0, 140)} { ${body.slice(0, 160)} }`);
  }
  return out;
}

// ---------- per-page capture ----------
const G = { hoverSigs: new Set(), tapSigs: new Set(), sheetsDone: new Set(), videosDone: new Set(), css: { hover: [], focus: [], active: [], keyframes: {}, media: new Set(), fontFace: new Set(), hoverGuard: false, reducedMotion: false } };
function mergeCSS(p) { ['hover', 'focus', 'active'].forEach(k => G.css[k].push(...p[k])); Object.assign(G.css.keyframes, p.keyframes); p.media.forEach(x => G.css.media.add(x)); p.fontFace.forEach(x => G.css.fontFace.add(x)); G.css.hoverGuard ||= p.hoverGuard; G.css.reducedMotion ||= p.reducedMotion; }

async function settle(page) {
  await page.addStyleTag({ content: CONSENT_CSS }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
}

async function capturePage(browser, item, idx) {
  const s = slug(item.url), res = { ...item, slug: s };
  // ----- desktop -----
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference', ...(VIDEO ? { recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1440, height: 900 } } } : {}) });
  const page = await dctx.newPage();
  try {
    const t0 = Date.now();
    await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settle(page);
    res.loadMs = Date.now() - t0;
    await page.waitForTimeout(2500); // entrance / preloader dwell (in video)
    await page.screenshot({ path: path.join(OUT, 'shots', `${s}-desktop-fold.png`) });
    const reveal = await page.evaluate(REVEAL_SNAP);
    // stepped scroll: fires reveals + lazy content, captured on video
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < Math.min(H, 30000); y += 450) { await page.mouse.wheel(0, 450); await page.waitForTimeout(260); }
    await page.waitForTimeout(900);
    const after = await page.evaluate(REVEAL_AFTER, reveal.map(r => r.i));
    res.reveals = reveal.map((r, k) => ({ ...r, end: after[k] })).filter(r => r.end && (r.end.opacity !== r.opacity || r.end.transform !== r.transform || r.end.clip !== r.clip))
      .reduce((acc, r) => { const key = r.sel; if (!acc.find(a => a.sel === key)) acc.push(r); return acc; }, []).slice(0, 25);
    // scroll-linked (scrubbed / parallax / pinned) check: sample transforms at two scroll positions mid-page
    res.scrubbed = await page.evaluate(async () => {
      const pick = [...document.body.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 40; }).slice(0, 3000);
      window.scrollTo(0, document.documentElement.scrollHeight * 0.3); await new Promise(r => setTimeout(r, 400));
      const a = pick.map(e => getComputedStyle(e).transform + '|' + Math.round(e.getBoundingClientRect().top));
      window.scrollBy(0, 300); await new Promise(r => setTimeout(r, 400));
      const out = []; pick.forEach((e, i) => { const t = getComputedStyle(e).transform, top = Math.round(e.getBoundingClientRect().top); const [ta, pa] = a[i].split('|'); if (t !== ta && t !== 'none') out.push({ sel: e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map(c => '.' + c).join(''), kind: 'transform changes with scroll (scrub/parallax)', from: ta.slice(0, 60), to: t.slice(0, 60) }); else if (+pa === top && !(function anc(n){ for(; n && n !== document.body; n = n.parentElement){ const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; } return false; })(e) && e.getBoundingClientRect().height < innerHeight * 1.5) out.push({ sel: e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map(c => '.' + c).join(''), kind: 'stays put while page scrolls (pinned via JS?)' }); });
      return out.filter((v, i, s) => s.findIndex(x => x.sel === v.sel) === i).slice(0, 15);
    }).catch(() => []);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'shots', `${s}-desktop-full.png`), fullPage: true }).catch(() => {});
    const ex = await page.evaluate(EXTRACT); res.extract = ex;
    fs.writeFileSync(path.join(OUT, 'html', `${s}.html`), await page.evaluate(() => { const c = document.documentElement.cloneNode(true); c.querySelectorAll('script,noscript,svg path,iframe').forEach(e => e.remove()); c.querySelectorAll('[data-rc],[data-hc]').forEach(e => { e.removeAttribute('data-rc'); e.removeAttribute('data-hc'); }); return c.outerHTML.replace(/\s(data-(?!framer-name|wf)[\w-]+|style)="[^"]{200,}"/g, ''); }));
    // stylesheets: fetch once across whole crawl
    let css = ex.inline;
    for (const href of ex.sheets) if (!G.sheetsDone.has(href)) { G.sheetsDone.add(href); try { const r = await dctx.request.get(href, { timeout: 15000 }); if (r.ok()) css += '\n' + await r.text(); } catch {} }
    mergeCSS(parseCSS(css)); delete ex.inline;
    // video poster frames: headless Chromium cannot decode H.264/MP4, so heroes and card films render blank.
    // Grab one frame per new video with ffmpeg so the design read still sees them.
    res.videoFrames = [];
    if (hasFfmpeg) for (const v of [...new Set(ex.videos)].filter(v => !G.videosDone.has(v)).slice(0, 4)) {
      G.videosDone.add(v);
      const f = path.join(OUT, 'shots', `${s}-video-${res.videoFrames.length}.jpg`);
      try { execSync(`ffmpeg -loglevel error -y -ss 1 -i "${v}" -frames:v 1 -vf "scale=960:-2" "${f}"`, { timeout: 25000, stdio: 'ignore' }); if (fs.existsSync(f)) res.videoFrames.push({ src: v.split('/').pop().split('?')[0], file: path.relative(OUT, f) }); } catch {}
    }
    // custom cursor detection
    res.customCursor = await (async () => {
      const before = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); return s.position === 'fixed' && s.pointerEvents === 'none' && e.getBoundingClientRect().width < 120; }).map(e => e.getBoundingClientRect().left + ',' + getComputedStyle(e).transform));
      await page.mouse.move(300, 300); await page.waitForTimeout(150); await page.mouse.move(900, 500); await page.waitForTimeout(400);
      const after = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); return s.position === 'fixed' && s.pointerEvents === 'none' && e.getBoundingClientRect().width < 120; }).map(e => ({ v: e.getBoundingClientRect().left + ',' + getComputedStyle(e).transform, sel: e.tagName.toLowerCase() + '.' + [...e.classList].join('.') })));
      return after.filter((a, i) => before[i] !== undefined && before[i] !== a.v).map(a => a.sel);
    })().catch(() => []);
    // hover pass: only signatures not yet seen anywhere on the site
    const cands = (await page.evaluate(HOVER_CANDS)).filter(c => !G.hoverSigs.has(c.sig)).slice(0, 22);
    res.hovers = [];
    for (const c of cands) {
      G.hoverSigs.add(c.sig);
      try {
        const loc = page.locator(`[data-hc="${c.i}"]`);
        await loc.scrollIntoViewIfNeeded({ timeout: 2000 });
        await page.mouse.move(5, 5); await page.waitForTimeout(80);
        const a = await page.evaluate(STYLE_OF, c.i); if (!a) continue;
        const box = await loc.boundingBox(); if (!box) continue;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(Math.min(1400, a.maxDur + 150));
        const b = await page.evaluate(STYLE_OF, c.i);
        const diff = {};
        const noise = (k, st) => (k === 'borderColor' && parseFloat(st.borderTopWidth) === 0) || (k === 'outline' && st.outlineStyle === 'none') || (k === 'textDecorationColor' && st.textDecorationLine === 'none') || k === 'outlineStyle';
        for (const k in a.self) if (a.self[k] !== b.self[k] && !noise(k, b.self)) diff[k] = [a.self[k], b.self[k]].map(v => hexify(String(v)).slice(0, 90));
        a.kids.forEach((kd, j) => { const kb = b.kids[j]; if (!kb) return; for (const k in kd.st) if (kd.st[k] !== kb.st[k] && !noise(k, kb.st)) diff[`${kd.tag} ${k}`] = [kd.st[k], kb.st[k]].map(v => hexify(String(v)).slice(0, 90)); });
        if (Object.keys(diff).length) {
          const pad = 24, clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(box.width + pad * 2, 1400), height: Math.min(box.height + pad * 2, 880) };
          const f = `${s}-hover-${res.hovers.length}`;
          await page.screenshot({ path: path.join(OUT, 'shots', f + '-on.png'), clip }).catch(() => {});
          await page.mouse.move(5, 5); await page.waitForTimeout(Math.min(1400, a.maxDur + 150));
          await page.screenshot({ path: path.join(OUT, 'shots', f + '-off.png'), clip }).catch(() => {});
          res.hovers.push({ sig: c.sig, text: c.text, transition: a.transition, diff, shots: f });
        }
      } catch {}
    }
    // page transition probe (first page only): click a nav link, time the swap
    if (idx === 0) {
      res.transition = await (async () => {
        const href = await page.evaluate(() => { const a = [...document.querySelectorAll('nav a[href],header a[href]')].find(a => a.origin === location.origin && a.pathname !== location.pathname); return a && a.href; });
        if (!href) return null;
        let fullLoad = false; page.once('load', () => fullLoad = true);
        const t = Date.now();
        await page.evaluate(h => { const a = [...document.querySelectorAll('a')].find(x => x.href === h); a && a.click(); }, href);
        await page.waitForURL(u => u.href !== item.url, { timeout: 8000 }).catch(() => {});
        const ms = Date.now() - t; await page.waitForTimeout(1500);
        return { to: href, ms, type: fullLoad ? 'full document load' : 'client-side (SPA / barba / swup style)' };
      })().catch(() => null);
    }
  } catch (e) { res.error = e.message.slice(0, 200); }
  const vid = page.video();
  await dctx.close();
  if (vid) { try { const p = await vid.path(); const dst = path.join(OUT, 'video', `${s}.webm`); fs.renameSync(p, dst); res.video = dst; } catch {} }

  // ----- mobile (touch) -----
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const mp = await mctx.newPage();
  try {
    await mp.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await settle(mp); await mp.waitForTimeout(1500);
    await mp.screenshot({ path: path.join(OUT, 'shots', `${s}-mobile-fold.png`) });
    const H = await mp.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < Math.min(H, 20000); y += 700) { await mp.evaluate(d => window.scrollBy(0, d), 700); await mp.waitForTimeout(150); }
    await mp.evaluate(() => window.scrollTo(0, 0)); await mp.waitForTimeout(400);
    await mp.screenshot({ path: path.join(OUT, 'shots', `${s}-mobile-full.png`), fullPage: true }).catch(() => {});
    res.mobileText = await mp.evaluate(() => { const o = {}; document.querySelectorAll('h1,h2,h3,h4,p,a,button,li,span,label').forEach(e => { if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return; const s = getComputedStyle(e); const k = `${e.tagName.toLowerCase()} ${s.fontSize}/${s.lineHeight} ${s.fontWeight} ${s.letterSpacing}`; o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 12); });
    // tap pass: toggles, menus, accordions, tabs — new signatures only
    const toggles = await mp.evaluate(() => {
      const q = '[aria-expanded],[aria-controls],summary,[class*=burger i],[class*=hamburger i],[class*=menu-toggle i],[class*=nav-toggle i],[class*=accordion i] button,[role=tab],button[class*=menu i]';
      const seen = {}; return [...document.querySelectorAll(q)].map((el, i) => { const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || getComputedStyle(el).visibility === 'hidden') return null; const sig = el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 2).join('.') + '[' + (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 15) + ']'; if (seen[sig]) return null; seen[sig] = 1; el.setAttribute('data-tc', i); return { i, sig, w: Math.round(r.width), h: Math.round(r.height) }; }).filter(Boolean);
    });
    res.taps = [];
    for (const t of toggles.filter(t => !G.tapSigs.has(t.sig.replace(/\[.*\]/, ''))).slice(0, 4)) {
      G.tapSigs.add(t.sig.replace(/\[.*\]/, ''));
      try {
        const loc = mp.locator(`[data-tc="${t.i}"]`); await loc.scrollIntoViewIfNeeded({ timeout: 2000 });
        const vis0 = await mp.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden').length);
        const f = `${s}-tap-${res.taps.length}`;
        await loc.tap({ timeout: 3000 });
        const t1 = Date.now(); await mp.waitForTimeout(250); await mp.screenshot({ path: path.join(OUT, 'shots', f + '-mid.png') });
        await mp.waitForTimeout(700); await mp.screenshot({ path: path.join(OUT, 'shots', f + '-open.png') });
        const st = await mp.evaluate(i => { const el = document.querySelector(`[data-tc="${i}"]`); return { expanded: el && el.getAttribute('aria-expanded'), bodyLock: getComputedStyle(document.body).overflow, visible: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden').length }; }, t.i);
        res.taps.push({ ...t, ...st, newlyVisible: st.visible - vis0, shots: f, targetSize: `${t.w}x${t.h}` });
        await mp.goto(item.url, { waitUntil: 'domcontentloaded' }); await settle(mp);
      } catch {}
    }
  } catch (e) { res.mobileError = e.message.slice(0, 200); }
  await mctx.close();
  log(`done ${idx + 1}: ${item.url} (${res.hovers?.length || 0} hovers, ${res.reveals?.length || 0} reveals, ${res.taps?.length || 0} taps)`);
  return res;
}

// ---------- summary ----------
function top(obj, n) { return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n); }
function summarize(plan, pages) {
  const T = {}, text = {}, vars = {}, fonts = new Set(), fp = {};
  for (const p of pages) { const e = p.extract; if (!e) continue;
    for (const k in e.tally) for (const [v, c] of Object.entries(e.tally[k])) (T[k] ||= {})[v] = (T[k][v] || 0) + c;
    for (const [k, v] of Object.entries(e.text)) { const t = (text[k] ||= { n: 0, tags: {}, sample: v.sample, color: {}, pages: new Set() }); t.n += v.n; Object.assign(t.tags, v.tags); Object.assign(t.color, v.color); t.pages.add(p.slug); }
    Object.assign(vars, e.vars); e.fonts.forEach(f => fonts.add(f));
    for (const [k, v] of Object.entries(e.fp)) if (Array.isArray(v) ? v.length : v) fp[k] = Array.isArray(v) ? [...new Set([...(fp[k] || []), ...v])] : true;
  }
  const L = [];
  L.push(`# Site capture: ${origin}`, '', `Captured ${pages.length} pages (one per template) out of ${Object.values(plan.groups).reduce((a, b) => a + b, 0)} discovered. Skipped ${plan.skippedSameTemplate} pages that share a template with a captured one.${plan.overCap.length ? ` Over the page cap (rerun with --max or --pages to include): ${plan.overCap.slice(0, 10).join(', ')}` : ''}`, '');
  if (plan.unfinished && plan.unfinished.length) L.push(`**Time budget reached.** Not captured yet: ${plan.unfinished.join(', ')}. Rerun with \`--only ${plan.unfinished.join(',')} --out <another folder>\`.`, '');
  L.push('## Pages', 'Rendered markup (scripts stripped) for every page is in html/<slug>.html — grep it for structure instead of guessing.', '', '| page | template (siblings) | desktop | mobile | video | hovers | reveals | taps |', '|---|---|---|---|---|---|---|---|');
  for (const p of pages) L.push(`| ${new URL(p.url).pathname} | ${p.template} (${p.groupSize}) | shots/${p.slug}-desktop-fold.png, -full | shots/${p.slug}-mobile-fold.png, -full | ${p.video ? 'video/' + p.slug + '.webm (+ -entrance.jpg, -tiles.jpg)' : '-'} | ${p.hovers?.length || 0} | ${p.reveals?.length || 0} | ${p.taps?.length || 0} |${p.error ? ' ERROR ' + p.error : ''}`);
  const vf = pages.flatMap(p => (p.videoFrames || []).map(v => `${v.file} (${v.src})`));
  const vids = pages.reduce((n, p) => n + ((p.extract && p.extract.videos) || []).length, 0);
  if (vids) L.push('', '## Video poster frames', vf.length ? `Headless Chromium cannot play MP4, so video areas look blank in screenshots. One frame per video: ${vf.join(' · ')}` : `${vids} video element(s) found but no frames grabbed (ffmpeg missing or the host refused it). Video areas will look blank in screenshots.`);
  L.push('', '## Stack fingerprint', Object.entries(fp).map(([k, v]) => v === true ? k : `${k}: ${v.join(', ')}`).join(' · ') || 'nothing detected (plain CSS / vanilla JS)');
  const tr = pages.find(p => p.transition)?.transition; if (tr) L.push(`Page transition: ${tr.type}, ${tr.ms} ms to ${new URL(tr.to).pathname} (watch the home video end).`);
  const cc = [...new Set(pages.flatMap(p => p.customCursor || []))]; if (cc.length) L.push(`Custom cursor element(s): ${cc.join(', ')}`);
  L.push('', '## Fonts', `Loaded faces: ${[...fonts].join(' · ') || 'none reported'}`, `@font-face files: ${[...G.css.fontFace].slice(0, 20).join(' · ') || '-'}`);
  L.push('', '## Type styles (desktop, all pages, by frequency)', '| family | size | weight | line-height | tracking | case | style | uses | tags | colors | sample |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [k, v] of Object.entries(text).sort((a, b) => b[1].n - a[1].n).slice(0, 22)) L.push(`| ${k.split(' | ').join(' | ')} | ${v.n} (${v.pages.size}p) | ${Object.keys(v.tags).join(',')} | ${Object.keys(v.color).slice(0, 3).join(' ')} | ${v.sample.replace(/\|/g, '/')} |`);
  const mt = {}; pages.forEach(p => (p.mobileText || []).forEach(([k, c]) => mt[k] = (mt[k] || 0) + c));
  L.push('', '## Mobile type (tag size/line-height weight tracking: uses)', top(mt, 14).map(([k, c]) => `${k}: ${c}`).join(' · '));
  const sec = (title, k, n) => L.push('', `## ${title}`, top(T[k], n).map(([v, c]) => `${v} (${Math.round(c)})`).join(' · ') || '-');
  sec('Text colors (weighted by text length)', 'color', 14); sec('Background colors (weighted by area)', 'background', 14); sec('Gradients', 'gradient', 6);
  sec('Radii', 'radius', 12); sec('Borders', 'border', 10); sec('Shadows', 'shadow', 10); sec('Backdrop / filter / blend', 'backdrop', 5); sec('Filters', 'filter', 5); sec('Blend modes', 'blend', 4);
  sec('Spacing values (padding, gap, margin)', 'space', 24); sec('Transitions in use', 'transition', 16); sec('Animations running', 'animation', 10); sec('Cursors', 'cursor', 6); sec('Sticky / fixed elements', 'pinned', 10);
  if (Object.keys(vars).length) L.push('', '## CSS custom properties on :root', Object.entries(vars).slice(0, 80).map(([k, v]) => `${k}: ${v}`).join(' · '));
  L.push('', '## Breakpoints / media queries', [...G.css.media].slice(0, 25).join(' · ') || '-', `Hover styles guarded by (hover: hover): ${G.css.hoverGuard ? 'yes' : 'no'} · prefers-reduced-motion handled: ${G.css.reducedMotion ? 'yes' : 'no'}`);
  L.push('', '## Hover interactions (measured: real mouse hover, computed-style diff, one per component type)');
  for (const p of pages) for (const h of p.hovers || []) L.push(`- **${h.sig}** "${h.text}" on ${p.slug} — transition \`${h.transition}\` — ${Object.entries(h.diff).slice(0, 6).map(([k, [a, b]]) => `${k}: ${a} → ${b}`).join('; ')} — shots/${h.shots}-off.png / -on.png`);
  L.push('', '## Scroll reveals (hidden below the fold before scrolling, changed after)');
  const RV = new Map(); for (const p of pages) for (const r of p.reveals || []) { const k = r.sel + r.transition; if (!RV.has(k)) RV.set(k, { r, pages: [] }); RV.get(k).pages.push(p.slug); }
  for (const { r, pages: pg } of RV.values()) L.push(`- **${r.sel}** (${pg.length === pages.length ? 'every page' : pg.join(', ')}): opacity ${r.opacity}→${r.end.opacity}, transform ${r.transform.slice(0, 50)}→${r.end.transform.slice(0, 50)}${r.clip !== 'none' ? `, clip ${r.clip}→${r.end.clip}` : ''} · \`${r.transition}\`${r.anim !== 'none' ? ' · anim ' + r.anim : ''}`);
  L.push('', '## Scroll-linked motion (scrub / parallax / JS pin candidates)');
  for (const p of pages) for (const r of p.scrubbed || []) L.push(`- ${p.slug} ${r.sel}: ${r.kind}${r.from ? ` (${r.from} → ${r.to})` : ''}`);
  L.push('', '## Tap interactions (mobile, touch emulation)');
  for (const p of pages) for (const t of p.taps || []) L.push(`- ${p.slug} **${t.sig}** target ${t.targetSize}: aria-expanded=${t.expanded}, body overflow=${t.bodyLock}, +${t.newlyVisible} visible elements — shots/${t.shots}-mid.png (250ms) / -open.png`);
  const kf = Object.entries(G.css.keyframes); L.push('', `## @keyframes (${kf.length})`); kf.slice(0, 25).forEach(([k, v]) => L.push(`- ${k}: ${v}`));
  const dd = a => [...new Set(a)];
  L.push('', `## CSS :hover rules (${dd(G.css.hover).length}, from stylesheets — includes states the crawl could not trigger)`); dd(G.css.hover).slice(0, 45).forEach(r => L.push('- `' + r + '`'));
  L.push('', `## CSS :focus rules (${dd(G.css.focus).length})`); dd(G.css.focus).slice(0, 15).forEach(r => L.push('- `' + r + '`'));
  L.push('', `## CSS :active rules (${dd(G.css.active).length})`); dd(G.css.active).slice(0, 10).forEach(r => L.push('- `' + r + '`'));
  L.push('', '## Section rhythm (per page: tag.class height bg)'); for (const p of pages) if (p.extract) L.push(`- ${p.slug} (${p.extract.docH}px): ` + p.extract.sections.slice(0, 12).map(s => `${s.tag}${s.cls ? '.' + s.cls : ''} ${s.h}${s.bg ? ' ' + s.bg : ''}`).join(' → '));
  return L.join('\n');
}

// ---------- main ----------
(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const all = await discover(dctx); await dctx.close();
  const plan = pickPages(all);
  if (argv.includes('--list')) { console.log(JSON.stringify(plan.final.map(p => new URL(p.url).pathname))); await browser.close(); return; }
  if (ONLY.length) plan.final = plan.final.filter(p => ONLY.includes(new URL(p.url).pathname));
  if (!plan.final.length) { console.error('nothing to capture (check --only paths against --list)'); await browser.close(); process.exit(1); }
  plan.unfinished = [];
  log(`discovered ${all.length} urls in ${Object.keys(plan.groups).length} templates; capturing ${plan.final.length}`);
  // Home first and alone so its shared components claim their hover/tap signatures; then a pool.
  const pages = [await capturePage(browser, plan.final[0], 0)];
  const queue = plan.final.slice(1).map((p, i) => [p, i + 1]);
  await Promise.all(Array.from({ length: CONC }, async () => { while (queue.length) { const [p, i] = queue.shift(); if (BUDGET && Date.now() - T0 > BUDGET) { plan.unfinished.push(new URL(p.url).pathname); continue; } pages.push(await capturePage(browser, p, i)); } }));
  await browser.close();
  pages.sort((a, b) => plan.final.findIndex(x => x.url === a.url) - plan.final.findIndex(x => x.url === b.url));
  const G2 = { ...G.css, media: [...G.css.media], fontFace: [...G.css.fontFace] };
  fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify({ origin, plan, pages, css: G2 }, null, 1));
  for (const p of pages) if (p.video) { try { execSync(`ffmpeg -loglevel error -y -i "${p.video}" -vf "fps=2,scale=480:-1,tile=6x5" -frames:v 1 "${p.video.replace('.webm', '-tiles.jpg')}"`); execSync(`ffmpeg -loglevel error -y -t 3 -i "${p.video}" -vf "fps=8,scale=480:-1,tile=6x4" -frames:v 1 "${p.video.replace('.webm', '-entrance.jpg')}"`); } catch {} }
  fs.writeFileSync(path.join(OUT, 'summary.md'), summarize(plan, pages));
  log(`finished in ${Math.round((Date.now() - t0) / 1000)}s → ${path.join(OUT, 'summary.md')}`);
})().catch(e => { console.error(e); process.exit(1); });
