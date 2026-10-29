import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_IDS } from '../skills/uix-skill/scripts/rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'uix-skill');
const read = (p) => readFileSync(join(root, p), 'utf8');
const CANON = ['Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components', "Do's and Don'ts"];

function sections(md, level) {
  const re = new RegExp(`^${level} (.+)$`, 'gm');
  const heads = [...md.matchAll(re)].map((m) => ({ title: m[1].trim(), start: m.index }));
  return heads.map((h, i) => ({ title: h.title, body: md.slice(h.start, heads[i + 1]?.start ?? md.length) }));
}

test('anti-slop.md covers every rule id and tags the rest as judgment', () => {
  const secs = sections(read('references/anti-slop.md'), '###');
  const titles = secs.map((s) => s.title);
  for (const id of RULE_IDS) assert.ok(titles.includes(id), `missing section for ${id}`);
  for (const t of titles) {
    if (!RULE_IDS.includes(t)) assert.ok(/ \(judgment\)$/.test(t), `"${t}" must end with (judgment)`);
  }
  for (const s of secs) {
    assert.ok(s.body.includes('**Why:**'), `${s.title} lacks **Why:**`);
    assert.ok(s.body.includes('**Fix:**'), `${s.title} lacks **Fix:**`);
  }
  const judgment = titles.filter((t) => t.endsWith('(judgment)')).length;
  assert.ok(judgment >= 9, 'at least 9 judgment rules');
});

test('example DESIGN.md files have frontmatter and canonical section order', () => {
  const dir = join(root, 'data', 'examples');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 3);
  for (const f of files) {
    const md = readFileSync(join(dir, f), 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
    assert.ok(fm, `${f} has frontmatter`);
    for (const key of ['name:', 'colors:', 'typography:']) assert.ok(fm[1].includes(key), `${f} frontmatter lacks ${key}`);
    const titles = sections(md.slice(fm[0].length), '##').map((s) => s.title);
    assert.equal(new Set(titles).size, titles.length, `${f} duplicate headings`);
    let last = -1;
    for (const t of titles) {
      const i = CANON.indexOf(t);
      assert.ok(i > last, `${f}: "${t}" is unknown or out of order`);
      last = i;
    }
    assert.ok(/\{[a-z]+\.[\w-]+\}/.test(md), `${f} uses token references`);
  }
});

test('motion.md has the 4 questions and reduced motion', () => {
  const md = read('references/motion.md');
  for (const q of ['Is it needed?', 'What does it communicate?', 'Which easing?', 'How long?']) assert.ok(md.includes(q), q);
  assert.ok(md.includes('prefers-reduced-motion'));
});

test('references stay under 400 lines', () => {
  for (const f of ['anti-slop', 'design-md', 'motion', 'components-a11y', 'images']) {
    const n = read(`references/${f}.md`).split('\n').length;
    assert.ok(n < 400, `${f}.md has ${n} lines`);
  }
});

// ---- Task 7: directions and layouts ----
import { parseColor, toHsl } from '../skills/uix-skill/scripts/lib/color.mjs';

function csvRows(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1) rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) rows.push([...row, f]);
  const [h, ...b] = rows;
  return b.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const table = (n) => csvRows(read(`data/${n}.csv`));
const line = (body, label) => (new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, 'm').exec(body) || [])[1]?.trim();
const fences = (body) => [...body.matchAll(/^```.*\n([\s\S]*?)^```/gm)];

const dirs = () => sections(read('references/directions.md'), '##');

test('directions.md: >= 20 complete, unique directions with valid ids', () => {
  const ds = dirs();
  assert.ok(ds.length >= 20, `only ${ds.length} directions`);
  assert.equal(new Set(ds.map((d) => d.title)).size, ds.length, 'duplicate names');
  const fonts = new Set(table('fonts').map((r) => r.id));
  const pals = new Set(table('palettes').map((r) => r.id));
  const styles = new Set(table('styles').map((r) => r.id));
  for (const d of ds) {
    for (const l of ['Feel', 'Type', 'Palette', 'Style', 'Layout', 'Motion', 'Best for', 'Avoid when']) {
      assert.ok(line(d.body, l), `${d.title} lacks **${l}:**`);
    }
    assert.ok(fonts.has(line(d.body, 'Type')), `${d.title}: unknown Type`);
    assert.ok(pals.has(line(d.body, 'Palette')), `${d.title}: unknown Palette`);
    assert.ok(styles.has(line(d.body, 'Style')), `${d.title}: unknown Style`);
    const m = line(d.body, 'Motion');
    assert.ok((/ease-out|ease-in-out|\blinear\b|\bspring\b|cubic-bezier/i.test(m) || /^(none|almost none|no motion)/i.test(m)) && !/bounce|elastic|overshoot|scale\(0\)/i.test(m.replace(/\bno bounc\w*/gi, '')), `${d.title}: Motion off-policy`);
    for (const [, n] of m.matchAll(/(\d+)\s*ms/g)) assert.ok(+n >= 150 && +n <= 500, `${d.title}: ${n}ms out of range`);
  }
});

test('directions.md: variety (reuse caps, dark palettes, app directions)', () => {
  const ds = dirs();
  for (const key of ['Palette', 'Type']) {
    const counts = {};
    for (const d of ds) { const v = line(d.body, key); counts[v] = (counts[v] || 0) + 1; }
    for (const [v, n] of Object.entries(counts)) assert.ok(n <= 2, `${key} ${v} used ${n} times`);
  }
  const bg = Object.fromEntries(table('palettes').map((r) => [r.id, r.bg]));
  const dark = ds.filter((d) => toHsl(parseColor(bg[line(d.body, 'Palette')])).l < 20).length;
  assert.ok(dark >= 6, `only ${dark} dark directions`);
  const apps = ds.filter((d) => /dashboard|\bapp\b|console|admin/i.test(line(d.body, 'Best for'))).length;
  assert.ok(apps >= 6, `only ${apps} app/dashboard directions`);
});

test('layouts-web.md: >= 15 structures with one wireframe each', () => {
  const ss = sections(read('references/layouts-web.md'), '##');
  assert.ok(ss.length >= 15, `only ${ss.length}`);
  for (const s of ss) {
    for (const l of ['Use when', 'Hero', "Don't"]) assert.ok(line(s.body, l), `${s.title} lacks **${l}:**`);
  }
  const heads = ss.map((s) => s.title.toLowerCase());
  for (const k of ['split hero', 'editorial long-read', 'product tour', 'pricing-led', 'docs-style', 'index']) {
    assert.ok(heads.some((h) => h.includes(k)), `missing structure: ${k}`);
  }
  const centered = ss.filter((s) => /full(-|\s)?(width)?\b.*centered|centered.*\bfull(-|\s)?(width)?\b/i.test(line(s.body, 'Hero'))).length;
  assert.ok(centered <= 3, `${centered} structures open with a full-width centered hero`);
});

test('layouts-app.md: required shells with density notes', () => {
  const ss = sections(read('references/layouts-app.md'), '##');
  const heads = ss.map((s) => s.title.toLowerCase());
  for (const k of ['dashboard', 'list/detail', 'table + filters', 'settings', 'form/wizard', 'empty state', 'auth', 'onboarding']) {
    assert.ok(heads.some((h) => h.includes(k)), `missing shell: ${k}`);
  }
  for (const s of ss) {
    for (const l of ['Use when', 'Density', "Don't"]) assert.ok(line(s.body, l), `${s.title} lacks **${l}:**`);
    assert.ok(/\d+\s*px/.test(line(s.body, 'Density')), `${s.title}: Density needs a px value`);
  }
});

test('layout wireframes: exactly one fenced block per section, max 60 columns', () => {
  for (const f of ['layouts-web', 'layouts-app']) {
    for (const s of sections(read(`references/${f}.md`), '##')) {
      const fs = fences(s.body);
      assert.equal(fs.length, 1, `${f}: "${s.title}" has ${fs.length} fenced blocks`);
      for (const l of fs[0][1].split('\n')) assert.ok([...l].length <= 60, `${f}: "${s.title}" line over 60 cols: ${l}`);
    }
  }
});

test('directions and layouts respect size budgets', () => {
  const n = (f) => read(`references/${f}.md`).split('\n').length;
  assert.ok(n('directions') < 450, `directions ${n('directions')}`);
  assert.ok(n('layouts-web') < 350, `layouts-web ${n('layouts-web')}`);
  assert.ok(n('layouts-app') < 350, `layouts-app ${n('layouts-app')}`);
});

test('directions.md states the reduced-motion rule', () => {
  assert.ok(read('references/directions.md').includes('prefers-reduced-motion'));
});

test('no banned advice in directions or layouts (outside Dont / Avoid when lines)', () => {
  const banned = /glow|glass|gradient|nested card|pure black|#000000|bounce|elastic|scale\(0\)|transition:\s*all|\p{Extended_Pictographic}/iu;
  const negated = /\b(no|never|not|without|avoid)\b/i;
  for (const f of ['directions', 'layouts-web', 'layouts-app']) {
    read(`references/${f}.md`).split('\n').forEach((l, i) => {
      if (/^\*\*(Don't|Avoid when):\*\*/.test(l)) return;
      if (banned.test(l) && !negated.test(l)) assert.fail(`${f}.md:${i + 1} banned term: ${l}`);
    });
  }
});

// ---- stack guides ----
const WEB_STACKS = ['angular', 'astro', 'html-tailwind', 'laravel', 'nextjs', 'nuxt-ui', 'nuxtjs', 'react', 'shadcn', 'svelte', 'threejs', 'vue'];
const NATIVE_STACKS = ['avalonia', 'flutter', 'javafx', 'jetpack-compose', 'react-native', 'swiftui', 'uno', 'uwp', 'winui', 'wpf'];
const STACK_HEADS = ['Setup tokens from DESIGN.md', 'Components', 'Motion', 'Accessibility', 'Gotchas', 'How to check'];
const REDUCED_TERMS = {
  swiftui: ['accessibilityReduceMotion'],
  'jetpack-compose': ['ANIMATOR_DURATION_SCALE'],
  flutter: ['disableAnimations'],
  'react-native': ['AccessibilityInfo'],
  wpf: ['SystemParameters'],
  uwp: ['UISettings', 'AnimationsEnabled'],
  winui: ['UISettings', 'AnimationsEnabled'],
  uno: ['UISettings', 'AnimationsEnabled'],
  javafx: ['no built-in'],
  avalonia: ['no built-in'],
};
const stackFile = (id) => read(`references/stacks/${id}.md`);

test('stacks: exactly the 22 guides', () => {
  const files = readdirSync(join(root, 'references', 'stacks')).sort();
  assert.deepEqual(files, [...WEB_STACKS, ...NATIVE_STACKS].map((s) => `${s}.md`).sort());
});

test('stacks: frontmatter, headings in order, under 150 lines', () => {
  for (const id of [...WEB_STACKS, ...NATIVE_STACKS]) {
    const md = stackFile(id);
    const web = WEB_STACKS.includes(id);
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
    assert.ok(fm, `${id}: frontmatter`);
    assert.equal(fm[1].trim(), `stack: ${id}\nkind: ${web ? 'web' : 'native'}\ncheck: ${web ? 'browser' : 'code'}`, `${id}: frontmatter values`);
    const heads = sections(md, '##').map((s) => s.title);
    assert.deepEqual(heads, STACK_HEADS, `${id}: headings`);
    // react-native carries the Expo, RNGH and Maestro detail (mobile round 1), so it gets a larger cap.
    const cap = id === 'react-native' || id === 'swiftui' ? 175 : 150;
    assert.ok(md.split('\n').length < cap, `${id}: ${md.split('\n').length} lines`);
  }
});

test('stacks: check scripts match the kind', () => {
  for (const id of WEB_STACKS) {
    const md = stackFile(id);
    assert.ok(md.includes('scripts/check.mjs') && md.includes('scripts/rules.mjs'), `${id}`);
  }
  for (const id of NATIVE_STACKS) {
    const md = stackFile(id);
    assert.ok(md.includes('scripts/rules.mjs'), `${id}: rules.mjs`);
    assert.ok(!md.includes('scripts/check.mjs'), `${id}: must not name check.mjs`);
  }
});

test('stacks: Motion section names the reduced-motion mechanism', () => {
  for (const id of [...WEB_STACKS, ...NATIVE_STACKS]) {
    const motion = sections(stackFile(id), '##').find((s) => s.title === 'Motion').body;
    const terms = REDUCED_TERMS[id] ?? ['prefers-reduced-motion'];
    for (const t of terms) assert.ok(motion.includes(t), `${id}: Motion lacks "${t}"`);
  }
});

// ---- Task 9: SKILL.md router ----
import { existsSync } from 'node:fs';

const skillMd = () => read('SKILL.md');
const skillParts = () => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(skillMd());
  assert.ok(m, 'SKILL.md has frontmatter');
  return { fm: m[1], body: m[2] };
};
const fmKeys = (fm) => [...fm.matchAll(/^([A-Za-z][\w-]*):/gm)].map((x) => x[1]);
const fmValue = (fm, key) => {
  const m = new RegExp(`^${key}:\\s*(.*(?:\\n[ \\t]+.*)*)`, 'm').exec(fm);
  let v = m[1].replace(/\n[ \t]+/g, ' ').trim();
  if (/^(["']).*\1$/s.test(v)) v = v.slice(1, -1);
  return v;
};

test('SKILL.md: frontmatter has exactly name and description', () => {
  const { fm } = skillParts();
  assert.deepEqual(fmKeys(fm), ['name', 'description']);
  assert.equal(fmValue(fm, 'name'), 'uix-skill');
});

test('SKILL.md: description <= 1024 chars, body <= 180 lines', () => {
  const { fm, body } = skillParts();
  const d = fmValue(fm, 'description');
  assert.ok(d.length > 100 && d.length <= 1024, `description ${d.length}`);
  const n = body.replace(/\n$/, '').split('\n').length;
  assert.ok(n <= 180, `body ${n} lines`);
});

test('SKILL.md: every referenced references/, data/, scripts/ path exists', () => {
  const { body } = skillParts();
  const paths = [...body.matchAll(/\b((?:references|data|scripts)\/[\w./<>-]*)/g)].map((m) => m[1].replace(/[.,;:]+$/, ''));
  assert.ok(paths.length >= 15, `only ${paths.length} paths`);
  for (const p of paths) {
    if (p.includes('<')) continue;
    assert.ok(existsSync(join(root, p)), `missing path: ${p}`);
  }
});

test('SKILL.md: commands, widths and repair rounds', () => {
  const { body } = skillParts();
  for (const c of ['init', 'build', 'audit', 'polish', 'motion']) assert.ok(body.includes(`/uix ${c}`), `/uix ${c}`);
  for (const w of ['375', '768', '1280']) assert.ok(body.includes(w), w);
  assert.ok(/(max(imum)?|at most) 2 (repair )?rounds/i.test(body), '2 repair rounds');
  for (const s of ['scripts/rules.mjs', 'scripts/check.mjs', 'scripts/images.mjs']) assert.ok(body.includes(s), s);
});

test('SKILL.md: stack-detection table names all 22 stack ids', () => {
  const { body } = skillParts();
  const rows = body.split('\n').filter((l) => l.startsWith('|'));
  for (const id of [...WEB_STACKS, ...NATIVE_STACKS]) {
    assert.ok(rows.some((r) => r.includes(`\`${id}\``)), `stack table lacks ${id}`);
  }
});

test('SKILL.md: stack-detection row order', () => {
  const rows = skillParts().body.split('\n').filter((l) => l.startsWith('|'));
  const idx = (id) => rows.findIndex((r) => r.trimEnd().endsWith(`| \`${id}\` |`));
  for (const [a, bs] of [
    ['nuxt-ui', ['nuxtjs']], ['shadcn', ['nextjs', 'react']], ['laravel', ['vue', 'react']],
    ['react-native', ['react']], ['nextjs', ['react']], ['uno', ['winui']], ['wpf', ['uwp']],
  ]) {
    assert.ok(idx(a) > 0, `${a} row missing`);
    for (const b of bs) assert.ok(idx(a) < idx(b), `${a} must come before ${b}`);
  }
});

test('references use <skill>/scripts paths, never bare node scripts/', () => {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  for (const f of walk(join(root, 'references')).filter((p) => p.endsWith('.md'))) {
    assert.ok(!readFileSync(f, 'utf8').includes('node scripts/'), f);
  }
});

test('mobile guides', () => {
  const HEADS = {
    'mobile-foundations.md': ['Platform differences', 'Layout and touch', 'Type', 'Safe areas and keyboard', 'Dark mode', 'Liquid Glass', 'Icons'],
    'mobile-motion.md': ['The 4 questions on mobile', 'Two tiers', 'Springs', 'Interruptibility and velocity', 'Haptics', 'Reduced motion', 'Performance'],
    'mobile-patterns.md': ['Navigation model', 'Sheets', 'Lists', 'Loading, empty, error', 'Forms and keyboard', 'Commerce flow', 'Vietnam notes'],
  };
  for (const [f, heads] of Object.entries(HEADS)) {
    const md = read(`references/${f}`);
    const n = md.split('\n').length;
    assert.ok(n >= 80 && n <= 150, `${f} has ${n} lines`);
    const titles = sections(md, '##').map((s) => s.title);
    for (const h of heads) assert.ok(titles.includes(h), `${f} lacks ## ${h}`);
    for (const m of md.matchAll(/data\/(mobile-[a-z]+\.csv)/g)) read(`data/${m[1]}`);
    assert.ok(!md.includes('scripts/check.mjs'), `${f} names scripts/check.mjs`);
  }
  const motion = read('references/mobile-motion.md');
  assert.ok(motion.includes('calm') && motion.includes('lively') && motion.includes('mobile-motion.csv'));
  assert.match(motion, /snappy[^\n]*calm/);
  assert.match(motion, /calm[^\n]*1\.0/);
  const patterns = read('references/mobile-patterns.md');
  assert.ok(patterns.includes('vi-VN') && patterns.includes('1.4'));
  const found = read('references/mobile-foundations.md');
  assert.match(found, /Liquid Glass[^\n]*navigation[^\n]*controls[^\n]*only|Liquid Glass[^\n]*only[^\n]*navigation[^\n]*controls/);
  assert.ok(read('references/design-md.md').includes('Motion tier'));
});

// ---- Task 13: mobile wiring ----
test('SKILL.md mobile', () => {
  const { body } = skillParts();
  const WEB_ROWS = [
    '| Any build, polish or audit | `references/anti-slop.md`, `references/components-a11y.md` |',
    '| `init`, or any DESIGN.md write | `references/design-md.md` |',
    '| `init` (offering directions) | `references/directions.md`, then the chosen rows of `data/fonts.csv`, `data/palettes.csv`, `data/styles.csv` |',
    '| Marketing, content, catalog page | `references/layouts-web.md` |',
    '| Dashboard, table, form, settings, auth | `references/layouts-app.md` |',
    '| Any motion, or `/uix motion` | `references/motion.md` |',
    '| Any image slot | `references/images.md` |',
    '| Sample DESIGN.md shape | `data/examples/ledger.md`, `field-notes.md` or `harbor.md`. One only. |',
    '| Every task | One `references/stacks/<id>.md`. For `shadcn` or `nuxt-ui`, also the host guide (see Stack detection). |',
  ];
  const lines = body.split('\n');
  for (const r of WEB_ROWS) assert.ok(lines.includes(r), `web row changed: ${r}`);
  const rowWith = (p) => lines.find((l) => l.startsWith('|') && l.includes(p));
  const a = rowWith('references/mobile-foundations.md');
  assert.ok(a && a.includes('references/mobile-patterns.md'), 'foundations+patterns row');
  assert.ok(rowWith('references/mobile-motion.md'), 'motion row');
  assert.ok(rowWith('data/mobile-styles.csv'), 'styles row');
  for (const s of ['`react-native`', '`flutter`', '`swiftui`', '`jetpack-compose`']) assert.ok(/Mobile stack/.test(body) && body.includes(s));
  assert.match(body, /"Mobile stack"[^\n]*`react-native`[^\n]*`flutter`[^\n]*`swiftui`[^\n]*`jetpack-compose`/);
  for (const t of ['calm or lively', 'check-mobile.mjs', 'fonts.csv', '`scripts`', 'unverified:']) assert.ok(body.includes(t), t);
});

test('stacks: mobile guides', () => {
  const COL = { 'react-native': 'rn', flutter: 'flutter', swiftui: 'swiftui', 'jetpack-compose': 'compose' };
  for (const [id, col] of Object.entries(COL)) {
    const md = stackFile(id);
    const motion = sections(md, '##').find((s) => s.title === 'Motion').body;
    assert.ok(motion.includes('mobile-motion.csv') && motion.includes(`\`${col}\``), `${id}: motion column`);
    const how = sections(md, '##').find((s) => s.title === 'How to check').body;
    if (id === 'react-native') {
      assert.ok(how.includes('scripts/check-mobile.mjs') && how.includes('.uix/mobile-routes.json'), 'rn check');
      assert.ok(!md.includes('applies the **web** rules'), 'rn stale web-rules claim');
    } else {
      assert.ok(how.includes('simctl io') || how.includes('screencap'), `${id}: recipe`);
      for (const m of ['light', 'dark', 'xxxl']) assert.ok(how.includes(m), `${id}: mode ${m}`);
      assert.ok(!how.includes('booted'), `${id}: no booted alias`);
    }
  }
  for (const id of ['flutter', 'swiftui']) assert.ok(stackFile(id).includes('simctl io'), id);
});

test('react-native.md check recipe', () => {
  const md = stackFile('react-native');
  assert.ok(!/rules\.mjs[^\n]*\bsrc app\b/.test(md), 'hard-coded src app');
  assert.ok(md.indexOf('scripts/rules.mjs') < md.indexOf('scripts/check-mobile.mjs'));
  assert.ok(md.includes('CI=1') && md.includes('--ios'));
  const { body } = skillParts();
  assert.ok(body.includes('instead of `references/motion.md`') && body.includes('instead of `data/styles.csv`'));
});

// ---- Mobile round 1, Task 4: guides ----
test('react-native.md: round-1 load-bearing facts', () => {
  const md = stackFile('react-native');
  for (const n of ['67.3', '74.8', '47.6', '52.9', '31.2', '34.6']) assert.ok(md.includes(n), `damping ${n}`);
  assert.ok(md.includes('npx expo install react-native-worklets'), 'worklets line');
  assert.ok(md.includes('npx expo install --check') && md.includes('--legacy-peer-deps') && md.includes('bundledNativeModules.json'), 'install fallback');
  assert.ok(md.includes('src/app/'), 'router root');
  assert.ok(/`CI=1` disables (file )?watching/i.test(md) && /restart Metro/i.test(md), 'CI=1 warning');
  assert.ok(md.includes('--only') && md.includes('--devices') && md.includes('mktemp -d'), 'check flags');
  assert.ok(md.includes('useLocalSearchParams') && md.includes('__DEV__'), 'dev state params');
  const dl = sections(md, '###').find((s) => s.title === 'Deep links in Expo Go');
  assert.ok(dl, 'deep-link section');
  for (const t of ['Linking.getInitialURL()', 'router.replace', 'route-not-navigated', '__DEV__', 'redirectSystemPath', 'getLinkingURL']) assert.ok(dl.body.includes(t), `deep links: ${t}`);
  assert.ok(md.includes('reset=1') && /effect that depends on the param/.test(md), 'reset and param effect');
  assert.ok(md.split('\n').length < 175, 'react-native.md under 175 lines');
  for (const t of ['usePanGesture', 'usePinchGesture', 'useTapGesture', 'useSimultaneousGestures', 'react-native-gesture-handler/ReanimatedSwipeable', 'onDeactivate', 'e.canceled', '3.3']) assert.ok(md.includes(t), `RNGH: ${t}`);
  for (const t of ['host.exp.Exponent', 'openLink: exp://127.0.0.1:', 'selected: true', 'data/examples/buy-flow.yaml']) assert.ok(md.includes(t), `Maestro: ${t}`);
  assert.ok(/Reduce Motion[^\n]*code review/i.test(md), 'reduce motion is code review');
  assert.ok(md.includes('maxFontSizeMultiplier') && md.includes('1.3'), 'display cap');
});

test('buy-flow.yaml example is a Maestro flow', () => {
  const y = read('data/examples/buy-flow.yaml');
  assert.ok(/^appId: host\.exp\.Exponent$/m.test(y));
  assert.ok(/^---$/m.test(y));
  const first = y.split(/^---$/m)[1].trim().split('\n').find((l) => !l.startsWith('#'));
  assert.match(first, /^- openLink: exp:\/\/127\.0\.0\.1:\d+\/--\/\?reset=1$/);
  assert.ok(y.includes('selected: true') && y.includes('swipe'));
});

test('design-md.md and mobile-foundations.md: round-1 rules', () => {
  const d = read('references/design-md.md');
  assert.ok(/<role>-dark/.test(d) && /dp\/pt/.test(d) && /between Components and Do's and Don'ts/.test(d), 'design-md');
  const f = read('references/mobile-foundations.md');
  assert.ok(f.includes('maxFontSizeMultiplier') && f.includes('1.3') && /body[^\n]*uncapped/i.test(f), 'foundations cap');
});

test('SKILL.md: round-1 mobile one-liners, body <= 180 lines', () => {
  const { body } = skillParts();
  assert.ok(body.replace(/\n$/, '').split('\n').length <= 180, 'body over 180 lines');
  assert.ok(/already chose[^\n]*skips the offer/i.test(body), 'step 4 skip');
  assert.ok(/check-mobile\.mjs`? too|`check-mobile\.mjs` too/.test(body) && body.includes('mktemp -d'), 'audit out');
  assert.ok(body.includes('--only') && body.includes('--devices'), 'mobile repair loop');
  assert.ok(/route-not-navigated[^\n]*never a clean/i.test(body), 'route-not-navigated');
});

// ---- Task 4 fix round 1 ----
test('react-native.md: damping table matches ratio x 2 x sqrt(stiffness)', () => {
  const md = stackFile('react-native');
  const rows = [...md.matchAll(/^\| (\d+) \| ([\d.]+) \| ([\d.]+) \|$/gm)];
  assert.equal(rows.length, 3);
  for (const [, k, a, b] of rows) {
    assert.equal(a, (0.9 * 2 * Math.sqrt(+k)).toFixed(1), `${k} @0.9`);
    assert.equal(b, (2 * Math.sqrt(+k)).toFixed(1), `${k} @1.0`);
  }
  assert.ok(!/stiffness: 1400, damping: 67 \}/.test(md), 'snippet uses 67.3');
  assert.ok(md.includes('damping: 67.3'));
});

test('react-native.md: RNGH 3 names', () => {
  const md = stackFile('react-native');
  assert.ok(!md.includes('Gesture.Pan('));
  assert.ok(md.includes("from 'react-native-gesture-handler/ReanimatedSwipeable'"));
  assert.ok(md.includes('every other member names the first route; the first has no `sameAs`'));
  assert.ok(md.includes("when Maestro's output names a debug folder"));
});

test('buy-flow.yaml: pushed page flow shape', () => {
  const y = read('data/examples/buy-flow.yaml');
  assert.match(y, /extendedWaitUntil:\n(?:    .*\n)*?    timeout: (9\d{4}|[1-9]\d{5,})\n/, 'first wait >= 90000');
  const steps = y.split(/^---$/m)[1].split(/^(?=- )/m).filter((s) => s.startsWith('- '));
  const wait = steps.find((s) => s.startsWith('- extendedWaitUntil'));
  assert.ok(+/timeout: (\d+)/.exec(wait)[1] >= 90000, 'first wait');
  const i = steps.findIndex((s) => /id: "add-to-bag"/.test(s));
  assert.ok(i > 0);
  assert.ok(!/tab-bag/.test(steps[i + 1]), 'no tab-bag tap right after add-to-bag');
  assert.ok(y.includes('toast-view-bag'));
  assert.ok(/scrollUntilVisible:[\s\S]*?timeout: \d+/.test(y), 'scroll timeout');
  assert.ok(y.includes('skip this tap if your swipe removes the row'));
});

test('mobile round 1 task 5: judgment rules and motion guide', () => {
  const titles = sections(read('references/anti-slop.md'), '###').map((s) => s.title);
  for (const id of ['primary-choice-below-fold', 'sticky-bar-covers-content', 'xxxl-overflow', 'truncated-meaningful-label']) {
    assert.ok(titles.includes(`${id} (judgment)`), `missing ${id}`);
  }
  assert.ok(read('references/anti-slop.md').split('\n').length < 400);
  const motion = read('references/mobile-motion.md');
  assert.match(motion, /\| Drop \|/);
  assert.match(motion, /1\.15/);
  assert.match(motion, /120 ?ms/);
  assert.match(motion, /Shared element by hand/);
});

// ---- Mobile round 2, Task 5: testing guide ----
test('mobile-testing.md, pointer and judgment rules', () => {
  const md = read('references/mobile-testing.md');
  const n = md.split('\n').length;
  assert.ok(n >= 80 && n <= 150, `mobile-testing.md has ${n} lines`);
  const titles = sections(md, '##').map((s) => s.title);
  const heads = ['See the app safely', 'Expo Go or a development build', 'Interaction checks with Maestro', 'What cannot be automated'];
  assert.deepEqual(titles.filter((t) => heads.includes(t)), heads);
  for (const t of ['DeviceHub', 'doubleTapOn', 'longPressOn', 'pinch']) assert.ok(md.includes(t), t);
  assert.ok(skillParts().body.includes('references/mobile-testing.md'));
  const slop = read('references/anti-slop.md');
  for (const s of ['xxxl-hides-primary-control (judgment)', 'row-control-off-center (judgment)']) assert.ok(slop.includes(`### ${s}`), s);
  assert.ok(slop.split('\n').length < 400);
  assert.ok(read('references/mobile-foundations.md').includes('xxxl-hides-primary-control'));
});

test('swiftui.md: project, check and gotcha facts', () => {
  const md = stackFile('swiftui');
  assert.ok(md.split('\n').length < 175, 'swiftui.md under 175 lines');
  for (const t of ['xcodegen', '--native', 'safeAreaInset', 'dynamicTypeSize', 'sensoryFeedback', 'LaunchScreens.swift', 'accessibilityReduceMotion', 'simctl io', 'toolbarVisibility', 'matchedTransitionSource', 'swiftui-project.yml', 'colorset-Contents.json']) assert.ok(md.includes(t), `swiftui.md: ${t}`);
});

test('swiftui examples: project.yml, color set, launch hook', () => {
  const dir = join(root, 'data', 'examples');
  const yml = readFileSync(join(dir, 'swiftui-project.yml'), 'utf8');
  assert.match(yml, /^targets:/m);
  assert.ok(yml.includes('UIAppFonts') && yml.includes('GENERATE_INFOPLIST_FILE'));
  const cs = JSON.parse(readFileSync(join(dir, 'colorset-Contents.json'), 'utf8'));
  assert.ok(cs.colors.some((c) => (c.appearances || []).some((a) => a.appearance === 'luminosity' && a.value === 'dark')), 'dark luminosity appearance');
  const swift = readFileSync(join(dir, 'LaunchScreens.swift'), 'utf8');
  assert.ok(swift.includes('ProcessInfo.processInfo.arguments') && swift.includes('-screen') && swift.includes('-seed'));
});

// ---- SwiftUI Task 4: cross-stack guides ----
test('cross-stack guides name the native forms', () => {
  const d = read('references/design-md.md');
  assert.ok(/px means pt/.test(d) && d.includes('SF Symbols') && d.includes('Material Symbols') && d.includes('mobile-motion.csv'), 'design-md native mapping');
  const f = read('references/mobile-foundations.md');
  assert.ok(f.includes('.dynamicTypeSize(...DynamicTypeSize.accessibility2)'), 'foundations dynamicTypeSize');
  const p = read('references/mobile-patterns.md');
  assert.ok(p.includes('.safeAreaInset(edge: .bottom)') && /Pushed detail screens hide the tab bar/.test(p) && /floating tab bar/.test(p), 'patterns buy bar');
  const i = read('references/images.md');
  assert.ok(/## Native apps/.test(i) && i.includes('asset catalog') && i.includes('sips -s format png') && /at build time/.test(i) && /hotlink/.test(i), 'images native');
  const t = read('references/mobile-testing.md');
  assert.ok(t.includes('appId: <bundle id>') && t.includes('--native') && t.includes('xcrun simctl io <udid> recordVideo') && /stagger/.test(t), 'testing native');
  const n = t.split('\n').length;
  assert.ok(n >= 80 && n <= 150, `mobile-testing.md has ${n} lines`);
  for (const f2 of ['mobile-foundations', 'mobile-patterns']) {
    const c = read(`references/${f2}.md`).split('\n').length;
    assert.ok(c >= 80 && c <= 150, `${f2} ${c}`);
  }
  const { body } = skillParts();
  const line = body.split('\n').find((l) => l.startsWith('- Other mobile stacks'));
  assert.ok(line && line.includes('check-mobile.mjs --native') && line.includes('--out "$(mktemp -d)"'), 'SKILL other mobile line');
  assert.ok(body.replace(/\n$/, '').split('\n').length <= 180, 'body over 180 lines');
});
