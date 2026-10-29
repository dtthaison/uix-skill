import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseColor, toHsl, contrastRatio } from '../skills/uix-skill/scripts/lib/color.mjs';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'uix-skill', 'data');

// Minimal RFC 4180 parser: quoted fields, doubled quotes, embedded commas/newlines.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return { header, rows: body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]]))), raw: body };
}

function load(name, columns) {
  const csv = parseCsv(readFileSync(join(dataDir, name), 'utf8'));
  assert.deepEqual(csv.header, columns, `${name} header`);
  csv.raw.forEach((r, i) => assert.equal(r.length, columns.length, `${name} row ${i + 2} has ${r.length} cells`));
  return csv.rows;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const col = (s) => parseColor(s);

const PAL_COLS = ['id', 'product_type', 'mood', 'bg', 'surface', 'text', 'muted', 'accent', 'accent_text', 'border', 'notes'];
const FONT_COLS = ['id', 'display', 'body', 'mono', 'mood', 'use', 'source', 'scripts'];
const STYLE_COLS = ['id', 'name', 'summary', 'best_for', 'avoid_for', 'signature_moves', 'risks'];

test('palettes: size, coverage, ids, hex cells', () => {
  const rows = load('palettes.csv', PAL_COLS);
  assert.ok(rows.length >= 60, `rows ${rows.length}`);
  assert.ok(new Set(rows.map((r) => r.product_type)).size >= 30);
  const ids = rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const r of rows) {
    assert.match(r.id, KEBAB, r.id);
    for (const k of ['bg', 'surface', 'text', 'muted', 'accent', 'accent_text', 'border']) {
      assert.match(r[k], HEX, `${r.id}.${k}`);
    }
    for (const k of ['product_type', 'mood', 'notes']) assert.ok(r[k].trim(), `${r.id}.${k} empty`);
  }
});

test('palettes: contrast floors', () => {
  const bad = [];
  for (const r of load('palettes.csv', PAL_COLS)) {
    const pairs = [['text', 'bg'], ['text', 'surface'], ['muted', 'bg'], ['accent_text', 'accent']];
    for (const [f, b] of pairs) {
      const cr = contrastRatio(col(r[f]), col(r[b]));
      if (cr < 4.5) bad.push(`${r.id}: ${f} on ${b} = ${cr.toFixed(2)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('palettes: no pure black bg/text, no purple-to-blue pair', () => {
  const bad = [];
  const inBand = (hex) => { const { h, s } = toHsl(col(hex)); return h >= 220 && h <= 320 && s >= 40; };
  for (const r of load('palettes.csv', PAL_COLS)) {
    if (r.bg.toLowerCase() === '#000000' || r.text.toLowerCase() === '#000000') bad.push(`${r.id}: pure black`);
    if (inBand(r.bg) && inBand(r.accent)) bad.push(`${r.id}: purple-blue pair`);
  }
  assert.deepEqual(bad, []);
});

test('palettes: at least 15 dark-bg rows', () => {
  const dark = load('palettes.csv', PAL_COLS).filter((r) => toHsl(col(r.bg)).l < 20);
  assert.ok(dark.length >= 15, `dark rows ${dark.length}`);
});

test('fonts: size, ids, banned fonts, source', () => {
  const rows = load('fonts.csv', FONT_COLS);
  assert.ok(rows.length >= 40, `rows ${rows.length}`);
  const ids = rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const banned = ['inter', 'arial', 'roboto', 'space grotesk'];
  for (const r of rows) {
    assert.match(r.id, KEBAB);
    for (const k of ['display', 'body']) {
      assert.ok(r[k].trim(), `${r.id}.${k} empty`);
      assert.ok(!banned.includes(r[k].trim().toLowerCase()), `${r.id}.${k} banned: ${r[k]}`);
    }
    for (const k of ['mood', 'use']) assert.ok(r[k].trim(), `${r.id}.${k} empty`);
    assert.ok(['google', 'system'].includes(r.source), `${r.id} source ${r.source}`);
    if (!r.mono.trim()) assert.ok(!/code|developer|terminal|dev tool/i.test(r.use), `${r.id}: empty mono but code-heavy use`);
  }
});

test('fonts: scripts column', () => {
  const rows = load('fonts.csv', FONT_COLS);
  const allowed = ['latin', 'latin-ext', 'vietnamese', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext'];
  const noVi = ['Young Serif', 'Outfit', 'Instrument Sans', 'DM Sans', 'Figtree', 'Gloock'];
  const yesVi = ['Fraunces', 'Be Vietnam Pro', 'Playfair Display', 'Bricolage Grotesque', 'Lora'];
  let viRows = 0;
  for (const r of rows) {
    const toks = r.scripts.split(';');
    assert.ok(r.scripts.trim(), `${r.id}.scripts empty`);
    for (const t of toks) assert.ok(allowed.includes(t), `${r.id} bad script ${t}`);
    assert.ok(toks.includes('latin'), `${r.id} lacks latin`);
    assert.equal(new Set(toks).size, toks.length, `${r.id} duplicate scripts`);
    if (noVi.includes(r.display) || noVi.includes(r.body)) assert.ok(!toks.includes('vietnamese'), `${r.id} should lack vietnamese`);
    if (yesVi.includes(r.display) && yesVi.includes(r.body)) assert.ok(toks.includes('vietnamese'), `${r.id} should have vietnamese`);
    if (toks.includes('vietnamese')) viRows++;
  }
  assert.ok(viRows >= 15, `vietnamese rows ${viRows}`);
});

test('styles: size, unique ids/names, no empty cells', () => {
  const rows = load('styles.csv', STYLE_COLS);
  assert.ok(rows.length >= 90, `rows ${rows.length}`);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'unique ids');
  assert.equal(new Set(rows.map((r) => r.name.toLowerCase())).size, rows.length, 'unique names');
  for (const r of rows) {
    assert.match(r.id, KEBAB);
    for (const k of STYLE_COLS) assert.ok(r[k].trim(), `${r.id}.${k} empty`);
  }
});

const MOTION_COLS = ['id', 'interaction', 'category', 'purpose', 'motion', 'haptic', 'rn', 'flutter', 'swiftui', 'compose', 'reduced_motion', 'source'];
const SOURCES = ['uix-recipe'];
const MOTION_MUST = ['mo-press', 'mo-push-pop', 'mo-sheet', 'mo-shared-zoom', 'mo-swipe-action', 'mo-pull-refresh', 'mo-cart-fly', 'mo-swatch-select', 'mo-tab-switch', 'mo-large-title', 'mo-stretchy-header', 'mo-skeleton-content', 'mo-list-stagger', 'mo-toast', 'mo-error-shake', 'mo-success-check', 'mo-toggle', 'mo-carousel-snap', 'mo-pinch-zoom', 'mo-keyboard-avoid'];
const MOTION_CATS = ['feedback', 'navigation', 'sheet', 'list', 'gesture', 'loading', 'commerce', 'status'];
const HAPTICS = ['none', 'selection', 'light', 'medium', 'heavy', 'success', 'warning', 'error'];
const NUM = '-?\\d+(?:\\.\\d+)?';
const SPRING = new RegExp(`^spring:dampingRatio=(${NUM}),stiffness=(${NUM})$`);
const TIMING = new RegExp(`^timing:ms=${NUM},easing=${NUM} ${NUM} ${NUM} ${NUM}$`);

test('mobile-motion: shape and enums', () => {
  const rows = load('mobile-motion.csv', MOTION_COLS);
  assert.ok(rows.length >= 36, `rows ${rows.length}`);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'unique ids');
  for (const r of rows) {
    assert.match(r.id, KEBAB);
    assert.ok(r.id.startsWith('mo-'), `${r.id} prefix`);
    for (const k of MOTION_COLS) assert.ok(r[k].trim(), `${r.id}.${k} empty`);
    assert.ok(MOTION_CATS.includes(r.category), `${r.id} category ${r.category}`);
    assert.ok(HAPTICS.includes(r.haptic), `${r.id} haptic ${r.haptic}`);
    assert.ok(/^https:\/\//.test(r.source) || SOURCES.includes(r.source), `${r.id} source ${r.source}`);
    const sp = r.motion.match(SPRING);
    if (sp) {
      const ratio = Number(sp[1]);
      assert.ok(ratio >= 0.3 && ratio <= 1.0, `${r.id} dampingRatio ${ratio}`);
      assert.ok(Number(sp[2]) > 0, `${r.id} stiffness`);
      if (ratio < 1.0) assert.ok(['navigation', 'sheet', 'gesture', 'commerce', 'feedback'].includes(r.category), `${r.id}: overshooting spring in ${r.category}`);
      assert.ok(!/fade|colou?r/i.test(r.purpose), `${r.id}: fade/colour purpose must use timing`);
    } else {
      assert.ok(TIMING.test(r.motion) || r.motion === 'native', `${r.id} motion ${r.motion}`);
    }
    if (r.motion === 'native') assert.ok(!/fade|colou?r/i.test(r.purpose), `${r.id}: fade/colour purpose must use timing`);
    if (/scroll/i.test(r.interaction)) assert.equal(r.haptic, 'none', `${r.id}: haptic on scroll`);
  }
});

test('mobile-motion: must-have ids', () => {
  const rows = load('mobile-motion.csv', MOTION_COLS);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const id of MOTION_MUST) assert.ok(byId[id], `missing ${id}`);
  assert.equal(byId['mo-error-shake'].haptic, 'error');
  assert.equal(byId['mo-success-check'].haptic, 'success');
});

const PATTERN_COLS = ['id', 'pattern', 'category', 'platform', 'when', 'rules', 'avoid', 'motion_ids', 'source'];
const PATTERN_CATS = ['navigation', 'sheet', 'list', 'form', 'loading', 'feedback', 'gesture', 'layout', 'commerce'];
const PATTERN_COMMERCE_MUST = ['mp-product-grid', 'mp-product-card', 'mp-product-gallery', 'mp-variant-picker', 'mp-sticky-add-to-cart', 'mp-cart-sheet', 'mp-free-shipping-progress', 'mp-checkout', 'mp-filters-sheet', 'mp-search', 'mp-promo-price', 'mp-pay-cod', 'mp-pay-momo', 'mp-pay-zalopay', 'mp-pay-vietqr', 'mp-chat-order'];

test('mobile-patterns: shape', () => {
  const rows = load('mobile-patterns.csv', PATTERN_COLS);
  assert.ok(rows.length >= 40, `rows ${rows.length}`);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'unique ids');
  for (const r of rows) {
    assert.match(r.id, KEBAB);
    assert.ok(r.id.startsWith('mp-'), `${r.id} prefix`);
    for (const k of PATTERN_COLS) if (k !== 'motion_ids') assert.ok(r[k].trim(), `${r.id}.${k} empty`);
    assert.ok(PATTERN_CATS.includes(r.category), `${r.id} category ${r.category}`);
    assert.ok(['ios', 'android', 'both'].includes(r.platform), `${r.id} platform`);
    assert.ok(/^https:\/\//.test(r.source) || SOURCES.includes(r.source), `${r.id} source ${r.source}`);
  }
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.ok(rows.filter((r) => r.category === 'commerce').length >= 12, 'commerce rows');
  for (const id of PATTERN_COMMERCE_MUST) {
    assert.ok(byId[id], `missing ${id}`);
    assert.equal(byId[id].category, 'commerce', `${id} category`);
  }
  for (const r of rows.filter((x) => x.id.startsWith('mp-pay-') || x.id === 'mp-chat-order')) assert.equal(r.platform, 'both', `${r.id} platform`);
});

test('mobile-patterns: motion_ids resolve', () => {
  const rows = load('mobile-patterns.csv', PATTERN_COLS);
  const motion = new Set(load('mobile-motion.csv', MOTION_COLS).map((r) => r.id));
  let withMotion = 0;
  for (const r of rows) {
    const ids = r.motion_ids === '' ? [] : r.motion_ids.split(';');
    assert.ok(ids.every(Boolean), `${r.id} motion_ids has an empty segment`);
    assert.equal(new Set(ids).size, ids.length, `${r.id} motion_ids has duplicates`);
    if (ids.length) withMotion++;
    for (const id of ids) assert.ok(motion.has(id), `${r.id} references unknown ${id}`);
  }
  assert.ok(withMotion >= 10, `rows with motion ${withMotion}`);
});

const MSTYLE_COLS = ['id', 'name', 'platform', 'summary', 'best_for', 'avoid_for', 'signature_moves', 'motion_feel', 'risks'];
const MSTYLE_MUST = ['m-soft-handmade', 'm-editorial-commerce', 'm-fresh-grocery', 'm-service-booking'];
const MSTYLE_FEELS = ['calm', 'lively', 'playful', 'snappy'];
const MSTYLE_MOVES = /spring|haptic|swipe|stretch|parallax|snap|morph|stagger|zoom|sheet/i;

test('mobile-styles: shape', () => {
  const rows = load('mobile-styles.csv', MSTYLE_COLS);
  assert.ok(rows.length >= 18, `rows ${rows.length}`);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'unique ids');
  assert.equal(new Set(rows.map((r) => r.name.toLowerCase())).size, rows.length, 'unique names');
  for (const r of rows) {
    assert.match(r.id, KEBAB);
    assert.ok(r.id.startsWith('m-'), `${r.id} prefix`);
    for (const k of MSTYLE_COLS) assert.ok(r[k].trim(), `${r.id}.${k} empty`);
    assert.ok(['ios', 'android', 'both'].includes(r.platform), `${r.id} platform ${r.platform}`);
    assert.ok(MSTYLE_FEELS.includes(r.motion_feel), `${r.id} motion_feel ${r.motion_feel}`);
    assert.match(r.signature_moves, MSTYLE_MOVES, `${r.id} signature_moves has no motion word`);
  }
  const ids = new Set(rows.map((r) => r.id));
  for (const id of MSTYLE_MUST) assert.ok(ids.has(id), `missing ${id}`);
  for (const f of MSTYLE_FEELS) assert.ok(rows.filter((r) => r.motion_feel === f).length >= 2, `motion_feel ${f} used < 2 times`);
});

const TOKEN_COLS = ['id', 'platform', 'category', 'name', 'value', 'unit', 'note', 'source', 'verified'];
const TOKEN_FLOORS = { touch: 4, type: 10, spacing: 4, bar: 4, 'safe-area': 2, radius: 3, motion: 3 };

test('mobile-tokens: shape', () => {
  const rows = load('mobile-tokens.csv', TOKEN_COLS);
  assert.ok(rows.length >= 30, `rows ${rows.length}`);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'unique ids');
  for (const r of rows) {
    assert.match(r.id, KEBAB);
    assert.ok(r.id.startsWith('mt-'), `${r.id} prefix`);
    for (const k of TOKEN_COLS) assert.ok(r[k].trim(), `${r.id}.${k} empty`);
    assert.ok(['ios', 'android'].includes(r.platform), `${r.id} platform ${r.platform}`);
    assert.ok(Object.keys(TOKEN_FLOORS).includes(r.category), `${r.id} category ${r.category}`);
    assert.match(r.value, /^-?\d+(?:\.\d+)?$/, `${r.id} value ${r.value}`);
  }
  for (const [cat, min] of Object.entries(TOKEN_FLOORS)) {
    assert.ok(rows.filter((r) => r.category === cat).length >= min, `${cat} < ${min}`);
  }
  for (const cat of ['touch', 'type', 'bar']) {
    for (const p of ['ios', 'android']) assert.ok(rows.some((r) => r.category === cat && r.platform === p), `${cat} has no ${p} row`);
  }
});

test('mobile-tokens: all verified', () => {
  const rows = load('mobile-tokens.csv', TOKEN_COLS);
  for (const r of rows) {
    assert.equal(r.verified, 'yes', `${r.id} verified`);
    assert.match(r.source, /^https:\/\//, `${r.id} source`);
  }
});

test('mobile round 1 task 5: motion and pattern rows', () => {
  const motion = Object.fromEntries(load('mobile-motion.csv', MOTION_COLS).map((r) => [r.id, r]));
  const stagger = motion['mo-list-stagger'].rn;
  // Reanimated names the start side: FadeInDown starts at translateY +25 (below) and rises; FadeInUp starts at -25 and falls.
  assert.ok(stagger.includes('FadeInDown.withInitialValues') && stagger.includes('translateY: 16') && !stagger.includes('FadeInUp'), 'stagger rn rises from below');
  const detent = motion['mo-sheet-detent'].rn;
  assert.ok(detent.includes('usePanGesture') && !/RNGH 2|Gesture\.Pan/.test(detent), 'detent rn is one RNGH version');
  const fly = motion['mo-cart-fly'];
  assert.match(fly.purpose, /arc/i);
  for (const k of ['measureInWindow', 'tabBarIcon', 'withTiming', 'fallback', 'withSequence']) assert.ok(fly.rn.includes(k), `fly rn lacks ${k}`);
  assert.ok(/Easing\.out/.test(fly.rn) && /Easing\.in/.test(fly.rn), 'both curves');
  for (const m of fly.rn.matchAll(/scale[^.;,]{0,12}?(\d\.\d+)/gi)) assert.ok(Number(m[1]) <= 1.2 || Number(m[1]) < 1, `bounce ${m[1]}`);
  const pats = Object.fromEntries(load('mobile-patterns.csv', PATTERN_COLS).map((r) => [r.id, r]));
  const confirm = pats['mp-add-to-cart-confirm'];
  assert.ok(confirm && confirm.category === 'commerce' && /View bag/.test(confirm.rules), 'add-to-cart confirm');
  assert.match(pats['mp-free-shipping-progress'].rules, /same number as the website/);
});

test('mobile-motion: swiftui cells for badge bump and shared zoom', () => {
  const byId = Object.fromEntries(load('mobile-motion.csv', MOTION_COLS).map((r) => [r.id, r]));
  assert.ok(/custom badge view/.test(byId['mo-badge-bump'].swiftui) && /TabView badge/.test(byId['mo-badge-bump'].swiftui), 'badge bump');
  assert.ok(byId['mo-shared-zoom'].swiftui.includes('.matchedTransitionSource') && byId['mo-shared-zoom'].swiftui.includes('.navigationTransition(.zoom('), 'shared zoom');
});
