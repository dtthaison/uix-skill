import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateFacts, RENDERED_RULE_IDS } from '../skills/uix-skill/scripts/lib/probe.mjs';
import { findChrome } from '../skills/uix-skill/scripts/lib/cdp.mjs';
import { runCheck } from '../skills/uix-skill/scripts/check.mjs';
import { RULE_IDS } from '../skills/uix-skill/scripts/rules.mjs';

const CLI = 'skills/uix-skill/scripts/check.mjs';
const base = { scrollWidth: 375, innerWidth: 375, texts: [], targets: [], images: [], headings: [], clipped: [] };
const text = (color, bgLayers, fontSize = 16, fontWeight = 400, extra = {}) => ({
  selector: 'p', color, bgLayers, hasBgImage: false, fontSize, fontWeight, ...extra,
});
const rules = (f) => f.map((x) => x.rule);

test('h-overflow', () => {
  const f = evaluateFacts({ ...base, scrollWidth: 420 }, 375);
  assert.deepEqual(rules(f), ['h-overflow']);
  assert.equal(f[0].width, 375);
  assert.equal(f[0].severity, 'error');
  assert.deepEqual(evaluateFacts(base, 375), []);
});

test('low-contrast thresholds', () => {
  const bg = ['rgba(0,0,0,0)', '#ffffff'];
  assert.deepEqual(rules(evaluateFacts({ ...base, texts: [text('#777777', bg)] }, 375)), ['low-contrast']);
  assert.deepEqual(evaluateFacts({ ...base, texts: [text('#777777', bg, 24)] }, 375), []);
  assert.deepEqual(evaluateFacts({ ...base, texts: [text('#777777', bg, 19, 700)] }, 375), []);
  assert.deepEqual(evaluateFacts({ ...base, texts: [text('#777777', bg, 16, 400, { hasBgImage: true })] }, 375), []);
});

test('transparent background chain', () => {
  const bg = ['rgba(0,0,0,0)', '#111111'];
  assert.deepEqual(evaluateFacts({ ...base, texts: [text('#eeeeee', bg)] }, 375), []);
  assert.deepEqual(rules(evaluateFacts({ ...base, texts: [text('#333333', bg)] }, 375)), ['low-contrast']);
});

test('dedupes per rule and selector', () => {
  const t = text('#777777', ['#ffffff']);
  assert.equal(evaluateFacts({ ...base, texts: [t, t] }, 375).length, 1);
});

test('small-target only at 375', () => {
  const f = { ...base, targets: [{ selector: 'a', w: 20, h: 20 }] };
  assert.deepEqual(rules(evaluateFacts(f, 375)), ['small-target']);
  assert.deepEqual(evaluateFacts(f, 1280), []);
});

test('small-target skips inline links in running text', () => {
  const f = { ...base, targets: [{ selector: 'a.in', w: 30, h: 16, inline: true }, { selector: 'a.nav', w: 30, h: 16, inline: false }] };
  const out = evaluateFacts(f, 375);
  assert.deepEqual(out.map((x) => x.selector), ['a.nav']);
});

test('img-no-alt, clipped', () => {
  const f = evaluateFacts({ ...base, images: [{ selector: 'img', alt: null }, { selector: 'img.b', alt: '' }], clipped: ['p.x'] }, 375);
  assert.deepEqual(rules(f), ['img-no-alt', 'text-clipped']);
  assert.equal(f[0].severity, 'error');
  assert.equal(f[1].severity, 'warn');
});

test('eyebrow-every-heading', () => {
  const h = (p) => ({ selector: 'h2', prevIsEyebrow: p });
  const f = evaluateFacts({ ...base, headings: [h(true), h(true), h(true), h(false)] }, 1280);
  assert.deepEqual(rules(f), ['eyebrow-every-heading']);
  assert.deepEqual(evaluateFacts({ ...base, headings: [h(true), h(true), h(false), h(false)] }, 1280), []);
});

test('RULE_IDS includes rendered ids', () => {
  for (const id of RENDERED_RULE_IDS) assert.ok(RULE_IDS.includes(id), id);
  assert.equal(new Set(RULE_IDS).size, RULE_IDS.length);
  assert.equal(RENDERED_RULE_IDS.length, 8);
});

test('low-contrast groups by color pair and names both colors', () => {
  const bg = ['rgba(0,0,0,0)', '#f2faf7'];
  const t = (sel, txt) => text('#6c8e92', bg, 16, 400, { selector: sel, sample: txt });
  const f = evaluateFacts({ ...base, texts: [t('a.x', 'one'), t('a.y', 'two'), t('a.z', 'three'), text('#111111', bg)] }, 1280);
  assert.equal(f.length, 1);
  assert.equal(f[0].count, 3);
  assert.equal(f[0].selector, 'a.x');
  assert.deepEqual(f[0].selectors, ['a.x', 'a.y', 'a.z']);
  assert.equal(f[0].sample, 'one');
  assert.match(f[0].message, /^Contrast 3\.\d\d:1 is below 4\.5:1 \(#6c8e92 on #f2faf7\)$/);
  assert.equal(f[0].width, 1280);
  const long = evaluateFacts({ ...base, texts: [t('a', 'x'.repeat(80))] }, 1280);
  assert.equal(long[0].sample.length, 40);
});

test('eyebrow-every-heading ignores footer, nav and aside h2s', () => {
  const h = (p, c = false) => ({ selector: 'h2', prevIsEyebrow: p, inChrome: c });
  const hs = [h(true), h(true), h(true), h(false, true), h(false, true), h(false, true)];
  assert.deepEqual(rules(evaluateFacts({ ...base, headings: hs }, 1280)), ['eyebrow-every-heading']);
});

test('small-target spacing exception (WCAG 2.5.8)', () => {
  const link = (y) => ({ selector: `a.${y}`, x: 0, y, w: 100, h: 20, inline: false });
  const apart = evaluateFacts({ ...base, targets: [link(0), link(30)] }, 375);
  assert.deepEqual(apart, []);
  const close = evaluateFacts({ ...base, targets: [link(0), link(20)] }, 375);
  assert.deepEqual(rules(close), ['small-target', 'small-target']);
  const big = { selector: 'button', x: 0, y: 21, w: 100, h: 44, inline: false };
  assert.deepEqual(rules(evaluateFacts({ ...base, targets: [link(0), big] }, 375)), ['small-target']);
});

test('heavy-image', () => {
  const img = (nw, rw, extra = {}) => ({ selector: 'img', alt: '', src: 'https://x.test/a.jpg', loaded: true, naturalWidth: nw, renderedWidth: rw, dpr: 1, ...extra });
  const f = evaluateFacts({ ...base, images: [img(2400, 300), img(2400, 300), img(1000, 600)] }, 1280);
  assert.deepEqual(rules(f), ['heavy-image']);
  assert.equal(f[0].severity, 'warn');
  assert.equal(f[0].count, 2);
  assert.equal(f[0].message, 'Image is 2400px wide but shown at 300px; serve a resized version.');
  assert.deepEqual(evaluateFacts({ ...base, images: [img(900, 100)] }, 1280), []);
  assert.deepEqual(evaluateFacts({ ...base, images: [img(2400, 300, { loaded: false })] }, 1280), []);
  assert.deepEqual(evaluateFacts({ ...base, images: [img(2400, 1200, { dpr: 2 })] }, 1280), []);
});

test('small-target: undersized neighbours are compared circle to circle', () => {
  const a = { selector: 'a.a', x: 0, y: 0, w: 20, h: 20, inline: false };
  const b = { selector: 'a.b', x: 21, y: 0, w: 200, h: 20, inline: false };
  assert.deepEqual(evaluateFacts({ ...base, targets: [a, b] }, 375), []);
});

const chrome = findChrome();
const itc = chrome ? test : test.skip;
const fx = (n) => `tests/fixtures/html/${n}.html`;
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'uix-check-'));
const at = (res, rule, w) => res.findings.filter((f) => f.rule === rule && (w === undefined || f.width === w));

itc('clean page: 3 PNGs, no errors', async () => {
  const outDir = await tmp();
  const res = await runCheck(fx('clean'), { outDir });
  for (const w of [375, 768, 1280]) await fs.access(path.join(outDir, `${w}.png`));
  assert.equal(res.shots.length, 3);
  assert.deepEqual(res.findings.filter((f) => f.severity === 'error'), []);
});

itc('overflow fixture', async () => {
  const res = await runCheck(fx('overflow'), { outDir: await tmp() });
  assert.equal(at(res, 'h-overflow', 375).length, 1);
  assert.equal(at(res, 'h-overflow', 1280).length, 0);
});

itc('oklch colors are normalized', async () => {
  const res = await runCheck(fx('contrast'), { outDir: await tmp(), widths: [1280] });
  const sel = at(res, 'low-contrast').map((f) => f.selector);
  assert.deepEqual(sel, ['p#bad']);
  assert.equal(at(res, 'img-no-alt').length, 1);
});

itc('transparent chain verdicts', async () => {
  const res = await runCheck(fx('transparent'), { outDir: await tmp(), widths: [1280] });
  assert.deepEqual(at(res, 'low-contrast').map((f) => f.selector), ['p#bad']);
});

itc('eyebrows fixture', async () => {
  const res = await runCheck(fx('eyebrows'), { outDir: await tmp(), widths: [1280] });
  assert.equal(at(res, 'eyebrow-every-heading').length, 1);
});

itc('CLI: bad CHROME_PATH exits 2', () => {
  const r = spawnSync('node', [CLI, fx('clean')], { encoding: 'utf8', env: { ...process.env, CHROME_PATH: '/nonexistent' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /CHROME_PATH/);
});

itc('CLI: unreachable target exits 2', async () => {
  const r = spawnSync('node', [CLI, 'http://127.0.0.1:9/', '--out', await tmp()], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Could not load/);
});

itc('CLI: missing file exits 2; ok run prints JSON', async () => {
  const r = spawnSync('node', [CLI, 'nope.html'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Could not load nope\.html/);
  const ok = spawnSync('node', [CLI, fx('clean'), '--widths', '1280', '--out', await tmp()], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.deepEqual(JSON.parse(ok.stdout).findings, []);
});

itc('load timeout: probes after DOMContentLoaded and notes it', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/hang.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.write('x'); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>t</title><p>hello</p><img src="/hang.png" alt="">');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const res = await runCheck(`http://127.0.0.1:${server.address().port}/`, { outDir: await tmp(), widths: [375, 768], loadTimeoutMs: 1500 });
    assert.equal(res.shots.filter((f) => !/-\d+\.png$/.test(f)).length, 2);
    assert.equal(res.notes.length, 2);
    assert.match(res.notes[0], /load event timed out at 375/);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

itc('scrolls before probing: reveal-on-scroll content is checked', async () => {
  const res = await runCheck(fx('reveal'), { outDir: await tmp(), widths: [1280] });
  assert.deepEqual(at(res, 'low-contrast').map((f) => f.selector), ['p#late']);
});

const pngHeight = async (file) => (await fs.readFile(file)).readUInt32BE(20);

itc('tall page: full shot plus tiles of at most 1600 px', async () => {
  const outDir = await tmp();
  const res = await runCheck(fx('tall'), { outDir, widths: [1280] });
  const names = res.shots.map((s) => path.basename(s));
  assert.deepEqual(names.slice(0, 4), ['1280.png', '1280-0.png', '1280-1.png', '1280-2.png']);
  const full = await pngHeight(res.shots[0]);
  assert.ok(full > 4000);
  const tiles = res.shots.slice(1);
  const heights = await Promise.all(tiles.map(pngHeight));
  assert.equal(heights[0], 1600);
  assert.equal(heights.reduce((a, b) => a + b, 0), full);
  assert.ok(heights.every((h) => h <= 1600));
});

itc('themes: attribute swap finds theme-only contrast failure', async () => {
  const base = await runCheck(fx('themes'), { outDir: await tmp(), widths: [1280] });
  assert.deepEqual(at(base, 'low-contrast'), []);
  const out = await tmp();
  const res = await runCheck(fx('themes'), { outDir: out, widths: [1280], themes: { attr: 'data-skin', values: ['good', 'bad'] } });
  const lc = at(res, 'low-contrast');
  assert.ok(lc.length >= 1);
  assert.ok(lc.every((f) => f.theme === 'bad'));
  assert.equal(res.shots.length, 1);
});

itc('CLI: --themes parses; malformed exits 2', async () => {
  for (const v of ['data-skin', 'data-skin=', '=a,b']) {
    const r = spawnSync('node', [CLI, fx('clean'), '--themes', v, '--out', await tmp()], { encoding: 'utf8' });
    assert.equal(r.status, 2, v);
    assert.match(r.stderr, /usage/);
  }
  const ok = spawnSync('node', [CLI, fx('themes'), '--widths', '1280', '--themes', 'data-skin=bad', '--out', await tmp()], { encoding: 'utf8' });
  assert.equal(ok.status, 1);
  assert.equal(JSON.parse(ok.stdout).findings[0].theme, 'bad');
});

itc('dev overlays are skipped', async () => {
  const res = await runCheck(fx('devoverlay'), { outDir: await tmp(), widths: [1280] });
  assert.deepEqual(at(res, 'low-contrast'), []);
});

itc('heavy-image fixture', async () => {
  const res = await runCheck(fx('heavy'), { outDir: await tmp(), widths: [1280] });
  const h = at(res, 'heavy-image');
  assert.equal(h.length, 1);
  assert.equal(h[0].count, 2);
});

itc('scroll pass is instant even with scroll-behavior: smooth', async () => {
  const res = await runCheck(fx('smooth'), { outDir: await tmp(), widths: [1280] });
  assert.deepEqual(at(res, 'low-contrast'), []);
});

itc('selectors never use unstable ids', async () => {
  const res = await runCheck(fx('ids'), { outDir: await tmp(), widths: [1280] });
  const sels = at(res, 'low-contrast').flatMap((f) => f.selectors);
  assert.ok(sels.length >= 1);
  for (const s of sels) assert.ok(!/#:r1:|#123/.test(s), s);
});

itc('themes: same pair on more elements is not deduped away', async () => {
  const res = await runCheck(fx('themes2'), { outDir: await tmp(), widths: [1280], themes: { attr: 'data-skin', values: ['more'] } });
  const t = at(res, 'low-contrast').filter((f) => f.theme === 'more');
  assert.equal(t.length, 1);
  assert.equal(t[0].count, 2);
});

itc('CLI: invalid theme attribute name exits 2', async () => {
  const r = spawnSync('node', [CLI, fx('clean'), '--themes', '1x=a', '--out', await tmp()], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
