import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanSource, scanProject, fontsFromDesignMd, RULE_IDS } from '../skills/uix-skill/scripts/rules.mjs';

const CLI = 'skills/uix-skill/scripts/rules.mjs';
const only = (text, p, rule, opts = {}) =>
  scanSource(text, { path: p, ...opts }).filter((f) => f.rule === rule);

test('banned-font', () => {
  const css = 'a {}\nbody {\n  font-family: Inter, sans-serif;\n}\nh1 { font-family: "Fraunces", Inter; }\n';
  const f = only(css, 'a.css', 'banned-font');
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 3);
  assert.equal(f[0].severity, 'warn');
  assert.equal(f[0].file, 'a.css');
  assert.equal(only(`<p class="font-['Inter']">x</p>`, 'a.html', 'banned-font').length, 1);
  assert.equal(only(css, 'a.css', 'banned-font', { allowFonts: ['Inter'] }).length, 0);
  assert.equal(only(`import { Inter } from 'next/font/google'`, 'a.tsx', 'banned-font').length, 1);
});

test('ai-gradient', () => {
  assert.equal(only('a{background:linear-gradient(90deg, #7c3aed, #2563eb)}', 'a.css', 'ai-gradient')[0].severity, 'error');
  assert.equal(only('a{background:linear-gradient(#f5f5f4, #e7e5e4)}', 'a.css', 'ai-gradient').length, 0);
  assert.equal(only('<div class="bg-gradient-to-r from-purple-500 to-blue-500">', 'a.html', 'ai-gradient').length, 1);
  assert.equal(only('<div class="from-purple-500">', 'a.html', 'ai-gradient').length, 0);
});

test('pure-black', () => {
  assert.equal(only('<div class="bg-[#000]">', 'a.html', 'pure-black').length, 1);
  assert.equal(only('<p class="text-black">', 'a.html', 'pure-black').length, 1);
  assert.equal(only('a { box-shadow: 0 1px 0 #000; }', 'a.css', 'pure-black').length, 0);
  assert.equal(only('a { color: #000000; }', 'a.css', 'pure-black').length, 1);
  assert.equal(only('a { background: rgb(0, 0, 0); }', 'a.css', 'pure-black').length, 1);
});

test('bounce and overshoot easing', () => {
  assert.equal(only('<i class="animate-bounce">', 'a.html', 'bounce-easing').length, 1);
  assert.equal(only('gsap.to(x, { ease: "bounce.out" })', 'a.js', 'bounce-easing').length, 1);
  assert.equal(only('a { transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1); }', 'a.css', 'overshoot-easing').length, 1);
  assert.equal(only('a { transition-timing-function: cubic-bezier(0.2, 0, 0, 1); }', 'a.css', 'overshoot-easing').length, 0);
});

test('scale-zero', () => {
  assert.equal(only('<motion.div initial={{ scale: 0 }} />', 'a.jsx', 'scale-zero').length, 1);
  assert.equal(only('<div class="scale-50">', 'a.html', 'scale-zero').length, 0);
  assert.equal(only('a { transform: scale(0.96); }', 'a.css', 'scale-zero').length, 0);
  assert.equal(only('a { transform: scale(0); }', 'a.css', 'scale-zero').length, 1);
  assert.equal(only('<div class="scale-0">', 'a.html', 'scale-zero').length, 1);
  assert.equal(only('<div class="scale-0.5 scale-05">', 'a.html', 'scale-zero').length, 0);
  assert.equal(only('<X scale={0} />', 'a.jsx', 'scale-zero').length, 1);
});

test('transition-all', () => {
  assert.equal(only('a { transition: all .2s; }', 'a.css', 'transition-all').length, 1);
  assert.equal(only('<div class="transition-all">', 'a.html', 'transition-all').length, 1);
  assert.equal(only('a { transition: opacity .2s; }', 'a.css', 'transition-all').length, 0);
});

test('outline-none', () => {
  assert.equal(only('<a class="outline-none focus-visible:ring-2">', 'a.html', 'outline-none').length, 0);
  assert.equal(only('<a class="outline-none">', 'a.html', 'outline-none').length, 1);
  assert.equal(only('button { outline: none; }', 'a.css', 'outline-none').length, 1);
  assert.equal(only('button:focus-visible { outline: none; }', 'a.css', 'outline-none').length, 0);
});

test('emoji-icon', () => {
  const f = only('<button>🚀 Launch</button>', 'a.html', 'emoji-icon');
  assert.equal(f.length, 1);
  assert.equal(only('<button>Launch</button>', 'a.html', 'emoji-icon').length, 0);
  assert.equal(only('a::after { content: "🚀"; }', 'a.css', 'emoji-icon').length, 0);
});

test('native rules', () => {
  assert.equal(only('Text("Hi").font(.system(size: 10))', 'a.swift', 'tiny-text').length, 1);
  assert.equal(only('Text("Hi").font(.system(size: 16))', 'a.swift', 'tiny-text').length, 0);
  assert.equal(only('val c = Color(0xFF000000)', 'a.kt', 'pure-black').length, 1);
  assert.equal(only('<TextBlock FontFamily="Arial" />', 'a.xaml', 'banned-font').length, 1);
  assert.equal(only('Text("x", style: TextStyle(fontSize: 9))', 'a.dart', 'tiny-text').length, 1);
  assert.equal(only('Text("🚀")', 'a.swift', 'emoji-icon').length, 1);
});

test('fixtures', async () => {
  const dir = 'tests/fixtures/src/';
  const scan = async (name, opts) => scanSource(await fs.readFile(dir + name, 'utf8'), { path: dir + name, ...opts });
  const g = await scan('ai-gradient.css');
  assert.deepEqual(g.map((f) => [f.rule, f.line]), [['ai-gradient', 2]]);
  const b = await scan('banned-font.css');
  assert.deepEqual(b.map((f) => [f.rule, f.line]), [['banned-font', 2]]);
  assert.equal((await scan('emoji-icon.html')).length, 1);
  assert.equal((await scan('tiny-text.swift')).filter((f) => f.rule === 'tiny-text').length, 1);
  assert.equal((await scan('pure-black.kt'))[0].rule, 'pure-black');
  assert.equal((await scan('banned-font.xaml'))[0].rule, 'banned-font');
});

test('fontsFromDesignMd', async () => {
  const text = await fs.readFile('tests/fixtures/src/design.md', 'utf8');
  assert.deepEqual(fontsFromDesignMd(text), ['Public Sans', 'Space Grotesk']);
  assert.deepEqual(fontsFromDesignMd('no frontmatter'), []);
});

test('scanProject skips node_modules and reports no-reduced-motion once', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-proj-'));
  try {
    await fs.mkdir(path.join(root, 'node_modules/x'), { recursive: true });
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'node_modules/x/a.css'), 'a { font-family: Inter; }');
    await fs.writeFile(path.join(root, 'src/app.css'), 'a { transition: opacity .2s; }');
    const f = await scanProject([root]);
    assert.deepEqual(f.map((x) => x.rule), ['no-reduced-motion']);
    assert.equal(f[0].file, path.join(root, 'src/app.css'));
    assert.equal(f[0].line, undefined);
    await fs.writeFile(path.join(root, 'src/b.css'), '@media (prefers-reduced-motion: reduce) {}');
    assert.equal((await scanProject([root])).length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('performance on a 200 KB single line', () => {
  const css = 'a{color:red}'.repeat(16000) + 'b{transform:scale(0)}';
  const t = Date.now();
  const f = scanSource(css, { path: 'big.css' });
  assert.ok(Date.now() - t < 2000);
  const s = f.filter((x) => x.rule === 'scale-zero');
  assert.equal(s.length, 1);
  assert.equal(s[0].line, 1);
});

test('RULE_IDS', () => {
  assert.equal(new Set(RULE_IDS).size, RULE_IDS.length);
  for (const id of ['banned-font', 'ai-gradient', 'pure-black', 'bounce-easing', 'overshoot-easing', 'scale-zero',
    'transition-all', 'outline-none', 'emoji-icon', 'tiny-text', 'no-reduced-motion']) assert.ok(RULE_IDS.includes(id), id);
});

test('CLI', async () => {
  const r = spawnSync('node', [CLI, 'tests/fixtures/src/ai-gradient.css'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).findings[0].rule, 'ai-gradient');
  assert.equal(spawnSync('node', [CLI], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync('node', [CLI, '--design', 'nope.md', 'tests/fixtures/src/design.md'], { encoding: 'utf8' }).status, 2);
  const banned = (design) => {
    const r = spawnSync('node', [CLI, ...design, 'tests/fixtures/src/banned-font.css'], { encoding: 'utf8' });
    return JSON.parse(r.stdout).findings.filter((f) => f.rule === 'banned-font').length;
  };
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-design-'));
  try {
    const withInter = path.join(tmp, 'inter.md');
    await fs.writeFile(withInter, '---\ntypography:\n  body:\n    fontFamily: "Inter"\n---\n');
    assert.equal(banned(['--design', withInter]), 0);
    assert.equal(banned(['--design', 'tests/fixtures/src/design.md']), 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
  assert.equal(spawnSync('node', [CLI, 'tests/fixtures/src/nonexistent'], { encoding: 'utf8' }).status, 2);
});

test('CLI works when invoked through a symlink', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-link-'));
  try {
    const link = path.join(tmp, 'rules.mjs');
    await fs.symlink(path.resolve(CLI), link);
    const r = spawnSync('node', [link, 'tests/fixtures/src/ai-gradient.css'], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).findings[0].rule, 'ai-gradient');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('scanProject: huge, minified and unreadable files are skipped and reported', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-skip-'));
  try {
    await fs.writeFile(path.join(root, 'huge.css'), 'a{color:#000}'.repeat(100000));
    await fs.writeFile(path.join(root, 'app.min.js'), 'a{color:#000}');
    await fs.writeFile(path.join(root, 'ok.css'), 'a{color:#000}');
    const secret = path.join(root, 'locked.css');
    await fs.writeFile(secret, 'a{color:#000}');
    await fs.chmod(secret, 0o000);
    const skipped = [];
    const f = await scanProject([root], { skipped });
    const by = Object.fromEntries(skipped.map((s) => [path.basename(s.file), s.reason]));
    assert.equal(by['huge.css'], 'too-large');
    assert.equal(by['app.min.js'], 'minified');
    if (process.getuid?.() !== 0) assert.equal(by['locked.css'], 'unreadable');
    assert.ok(f.every((x) => path.basename(x.file) === 'ok.css' || x.rule === 'no-reduced-motion'));
    assert.ok(f.some((x) => x.rule === 'pure-black' && path.basename(x.file) === 'ok.css'));
    await fs.chmod(secret, 0o644);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('scanProject: caps findings per rule per file and survives many findings', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-cap-'));
  try {
    await fs.writeFile(path.join(root, 'many.css'), 'a{color:#000}\n'.repeat(60000));
    const f = await scanProject([root]);
    const black = f.filter((x) => x.rule === 'pure-black');
    assert.equal(black.length, 21);
    assert.match(black[20].message, /\d+ more pure-black hits in this file suppressed/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('CLI: output carries skipped array', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-cli-'));
  try {
    await fs.writeFile(path.join(root, 'x.min.css'), 'a{}');
    const r = spawnSync('node', [CLI, root], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.findings, []);
    assert.deepEqual(out.skipped.map((s) => s.reason), ['minified']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('walk skips extra build dirs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-walk-'));
  try {
    for (const d of ['out', 'Pods', 'storybook-static', 'vendor', '.dart_tool']) {
      await fs.mkdir(path.join(root, d));
      await fs.writeFile(path.join(root, d, 'a.css'), 'a{color:#000}');
    }
    assert.deepEqual(await scanProject([root]), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('emoji-icon allowlist: arrows, symbols and comments', () => {
  for (const ch of ['↗', '→', '➔', '⌘', '⌥', '⇧', '✓', '✔', '✗', '✕', '★', '☆', '•']) {
    assert.equal(only(`<a>Open ${ch}</a>`, 'a.html', 'emoji-icon').length, 0, ch);
  }
  assert.equal(only('// 🚀 launch\nconst a = 1;', 'a.js', 'emoji-icon').length, 0);
  assert.equal(only('/* 🎉 */ const a = 1;', 'a.js', 'emoji-icon').length, 0);
  assert.equal(only('<div>{/* ✨ note */}</div>', 'a.jsx', 'emoji-icon').length, 0);
  for (const ch of ['🧶', '🎉', '✨', '🚀']) assert.equal(only(`<b>${ch}</b>`, 'a.html', 'emoji-icon').length, 1, ch);
  assert.equal(only('<a href="https://x.test">🧶</a>', 'a.html', 'emoji-icon').length, 1);
});

test('outline-none downgrades to warn in CSS files when a global ring exists', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-ring-'));
  await fs.writeFile(path.join(dir, 'g.css'), '.s { outline: none; }\n:focus-visible { outline: 2px solid #c33; }\n');
  await fs.writeFile(path.join(dir, 'c.tsx'), "export const A = () => <input style={{ outline: 'none' }} />;\nexport const B = () => <i className=\"outline-none\" />;\n");
  const f = (await scanProject([dir])).filter((x) => x.rule === 'outline-none');
  const css = f.filter((x) => x.file.endsWith('.css'));
  assert.deepEqual(css.map((x) => x.severity), ['warn']);
  assert.match(css[0].message, /global :focus-visible ring restores it; check specificity/);
  const tsx = f.filter((x) => x.file.endsWith('.tsx'));
  assert.deepEqual(tsx.map((x) => x.severity), ['error', 'error']);
  const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-ring-'));
  await fs.writeFile(path.join(dir2, 'g.css'), '.s { outline: none; }\n:focus-visible { outline: none; }\n');
  const g = (await scanProject([dir2])).filter((x) => x.rule === 'outline-none');
  assert.ok(g.length >= 1 && g.every((x) => x.severity === 'error'));
});

test('global ring detection ignores comments, descendants and print media', async () => {
  const run = async (css) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-ring-'));
    await fs.writeFile(path.join(dir, 'g.css'), `.s { outline: none; }\n${css}\n`);
    return (await scanProject([dir])).filter((x) => x.rule === 'outline-none')[0].severity;
  };
  assert.equal(await run('/* :focus-visible { outline: 2px solid red; } */'), 'error');
  assert.equal(await run('.card :focus-visible { outline: 2px solid red; }'), 'error');
  assert.equal(await run('@media print { :focus-visible { outline: 2px solid red; } }'), 'error');
  assert.equal(await run(':root :focus-visible { outline: 2px solid red; }'), 'warn');
  assert.equal(await run('a, *:focus-visible { outline: 2px solid red; }'), 'warn');
  assert.equal(await run('@media (min-width: 1px) { html :focus-visible { outline: 2px solid red; } }'), 'warn');
});

const RN_IDS = {
  'rn-scrollview-map': 'error', 'rn-js-driver': 'error', 'rn-linear-motion': 'warn', 'rn-no-press-feedback': 'warn',
  'rn-small-target': 'warn', 'rn-icon-no-label': 'error', 'rn-font-scaling-off': 'warn', 'rn-hardcoded-inset': 'warn',
  'rn-no-reduced-motion': 'warn',
};

test('routing: RN file gets native rules, not web rules', () => {
  const src = "import { View } from 'react-native';\nexport const A = () => <View className=\"transition-all\" style={{ backgroundColor: '#000000' }} />;\n";
  const f = scanSource(src, { path: 'a.tsx' });
  assert.equal(f.filter((x) => x.rule === 'transition-all').length, 0);
  assert.equal(f.filter((x) => x.rule === 'pure-black').length, 1);
});

test('routing: web tsx unchanged, native specifiers route to native', () => {
  const body = "export const A = () => <div className=\"transition-all scale-0\" />;\n";
  for (const head of ['', "import x from 'react-native-web';\n", "// import { View } from 'react-native'\n", "const s = 'react-native';\n"]) {
    const ids = scanSource(head + body, { path: 'a.tsx' }).map((f) => f.rule);
    assert.ok(ids.includes('transition-all') && ids.includes('scale-zero'), head);
    assert.ok(!ids.some((r) => r.startsWith('rn-')));
  }
  for (const head of ["import { Link } from 'expo-router';\n", "import Animated from 'react-native-reanimated';\n", "const x = require('react-native/Libraries/Foo');\n", "import 'expo';\n"]) {
    assert.ok(!scanSource(head + body, { path: 'a.tsx' }).some((f) => f.rule === 'transition-all'), head);
  }
});

test('rn rules: fires/ok fixtures', async () => {
  const dir = 'tests/fixtures/src/mobile/';
  for (const [id, severity] of Object.entries(RN_IDS)) {
    const fires = await fs.readFile(`${dir}${id}.fires.tsx`, 'utf8');
    const want = fires.split('\n').flatMap((l, i) => (l.endsWith('// FIRES') ? [i + 1] : []));
    assert.ok(want.length > 0, id);
    const got = scanSource(fires, { path: `${id}.fires.tsx` }).filter((f) => f.rule === id);
    assert.deepEqual(got.map((f) => f.line), want, id);
    assert.equal(got[0].severity, severity, id);
    for (const suffix of ['ok', 'ok2', 'ok3', 'ok4']) {
      const file = `${dir}${id}.${suffix}.tsx`;
      const ok = await fs.readFile(file, 'utf8').catch(() => null);
      if (ok !== null) assert.equal(scanSource(ok, { path: file }).filter((f) => f.rule === id).length, 0, file);
    }
  }
});

test('rn-no-reduced-motion is per file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-rn-'));
  try {
    const motion = "import Animated, { withTiming } from 'react-native-reanimated';\nexport const t = () => withTiming(1);\n";
    await fs.writeFile(path.join(root, 'a.tsx'), motion);
    await fs.writeFile(path.join(root, 'b.tsx'), "import { useReducedMotion } from 'react-native-reanimated';\nexport const r = () => useReducedMotion();\n");
    const f = await scanProject([root]);
    assert.deepEqual(f.map((x) => [x.rule, path.basename(x.file), x.line]), [['rn-no-reduced-motion', 'a.tsx', 2]]);
    const none = scanSource("import { View } from 'react-native';\nexport const x = 1; // withTiming(1)\n", { path: 'c.tsx' });
    assert.equal(none.filter((x) => x.rule === 'rn-no-reduced-motion').length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('emoji-icon: native ts/js data files without JSX are skipped', () => {
  const data = "import { Platform } from 'react-native';\nexport const msg: Array<string> = ['Done 🎉'];\n";
  assert.equal(only(data, 'i18n.ts', 'emoji-icon').length, 0);
  assert.equal(only(data, 'i18n.js', 'emoji-icon').length, 0);
  const jsx = "import { Text } from 'react-native';\nexport const A = () => <Text>{'Done 🎉'}</Text>;\n";
  assert.equal(only(jsx, 'a.tsx', 'emoji-icon').length, 1);
  const jsxInJs = "import { Text } from 'react-native';\nexport const A = () => <Text>{'Done 🎉'}</Text>;\n";
  assert.equal(only(jsxInJs, 'a.js', 'emoji-icon').length, 1);
  const onlyInString = "import { View } from 'react-native';\n// <View/>\nexport const m = '<b>Done 🎉</b>';\n";
  assert.equal(only(onlyInString, 'a.ts', 'emoji-icon').length, 0);
  assert.equal(only("let a = '🎉';\n", 'a.swift', 'emoji-icon').length, 1);
});

test('emoji-icon: project with native files drops emoji in JSX-free ts data files, web project keeps them', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-rn-'));
  try {
    await fs.writeFile(path.join(root, 'i18n.ts'), "export const m = { offer: '🎉 Sale' };\n");
    assert.equal((await scanProject([root])).filter((x) => x.rule === 'emoji-icon').length, 1);
    await fs.writeFile(path.join(root, 'App.tsx'), "import { View } from 'react-native';\nexport const A = () => <View />;\n");
    assert.equal((await scanProject([root])).filter((x) => x.rule === 'emoji-icon').length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RULE_IDS includes the rn ids', () => {
  for (const id of Object.keys(RN_IDS)) assert.ok(RULE_IDS.includes(id), id);
  assert.equal(new Set(RULE_IDS).size, RULE_IDS.length);
});

test('rn-no-press-feedback: pressed late in a long child render prop does not fire', () => {
  const pad = '{/* ' + 'a'.repeat(700) + ' */}';
  const src = `import { Pressable } from 'react-native';\nconst x = <Pressable onPress={go}>{({ pressed }) => (<View>${pad}<Text style={{ opacity: pressed ? 0.5 : 1 }}>Go</Text></View>)}` + 'z'.repeat(2000);
  assert.equal(scanSource(src, { path: 'a.tsx' }).filter((f) => f.rule === 'rn-no-press-feedback').length, 0);
});

test('rn rules stay linear on a 200 KB file', () => {
  const mk = (k) => "import { Pressable } from 'react-native';\n" + '<Pressable onPress={x}>'.repeat(4500 * k) + '<ScrollView>'.repeat(1000 * k);
  const best = (src) => {
    let m = Infinity;
    for (let i = 0; i < 5; i++) {
      const t = process.hrtime.bigint();
      scanSource(src, { path: 'big.tsx' });
      m = Math.min(m, Number(process.hrtime.bigint() - t) / 1e6);
    }
    return m;
  };
  const t1 = best(mk(1));
  const t2 = best(mk(2));
  assert.ok(t2 < 3 * t1 + 50, `n=${t1.toFixed(1)}ms 2n=${t2.toFixed(1)}ms`);
  const maps = (k) => "import { ScrollView } from 'react-native';\n" + '<ScrollView>{a.map(f)}{b.c.map(g)}{load().map(h)}{xs.map(i)}</ScrollView>\n'.repeat(2500 * k);
  const m1 = best(maps(1));
  const m2 = best(maps(2));
  assert.ok(m2 < 3 * m1 + 50, `maps n=${m1.toFixed(1)}ms 2n=${m2.toFixed(1)}ms`);
  const sv = (k) => "import { ScrollView } from 'react-native';\n" + '<ScrollView>'.repeat(6000 * k) + 'x'.repeat(30000) + '</ScrollView>';
  const s1 = best(sv(1));
  const s2 = best(sv(2));
  assert.ok(s2 < 3 * s1 + 50, `scrollview n=${s1.toFixed(1)}ms 2n=${s2.toFixed(1)}ms`);
});

test('rn-hardcoded-inset: Platform ios ? 20 fires, either order', async () => {
  const f = await fs.readFile('tests/fixtures/src/mobile/rn-hardcoded-inset.fires2.tsx', 'utf8');
  assert.deepEqual(only(f, 'a.tsx', 'rn-hardcoded-inset').map((x) => x.line), [3]);
  const head = "import { View } from 'react-native';\n";
  assert.equal(only(head + "const s = { marginTop: Platform.OS === 'android' ? 0 : 20 };", 'a.tsx', 'rn-hardcoded-inset').length, 1);
  assert.equal(only(head + 'const s = { marginTop: 20 };', 'a.tsx', 'rn-hardcoded-inset').length, 0);
});

test('routing: import-shaped specifiers only', () => {
  const body = 'export const A = () => <div className="transition-all" />;\n';
  const native = [
    "const x = require('react-native');\n",
    'import { Link } from "expo-router";\n',
    "export { View } from 'react-native';\n",
    "import type { ViewStyle } from 'react-native';\n",
    "import {\n  View,\n  Text,\n} from 'react-native';\n",
    "const u = 'http://a'; import x from 'react-native';\n",
  ];
  const web = [
    "import 'react-native-web';\n",
    "/*\nold:\nimport x from 'react-native'\n*/\n",
    "const doc = `\nimport x from 'react-native'\n`;\n",
  ];
  const hit = (h) => scanSource(h + body, { path: 'a.tsx' }).some((f) => f.rule === 'transition-all');
  for (const h of native) assert.equal(hit(h), false, h);
  for (const h of web) assert.equal(hit(h), true, h);
});

const SWIFT_IDS = {
  'swiftui-linear': ['warn', '.swift'],
  'swiftui-fixed-font': ['warn', '.swift'],
  'compose-linear': ['warn', '.kt'],
  'flutter-linear': ['warn', '.dart'],
  'flutter-no-text-scale': ['error', '.dart'],
};

test('native rules: fires/ok fixtures', async () => {
  const dir = 'tests/fixtures/src/mobile/';
  for (const [id, [severity, ext]] of Object.entries(SWIFT_IDS)) {
    const fires = await fs.readFile(`${dir}${id}.fires${ext}`, 'utf8');
    const want = fires.split('\n').flatMap((l, i) => (l.endsWith('// FIRES') ? [i + 1] : []));
    assert.ok(want.length > 0, id);
    const got = scanSource(fires, { path: `${id}.fires${ext}` }).filter((f) => f.rule === id);
    assert.deepEqual(got.map((f) => f.line), want, id);
    assert.equal(got[0].severity, severity, id);
    for (const suffix of ['ok', 'ok2']) {
      const file = `${dir}${id}.${suffix}${ext}`;
      const ok = await fs.readFile(file, 'utf8').catch(() => null);
      if (ok !== null) assert.equal(scanSource(ok, { path: file }).filter((f) => f.rule === id).length, 0, file);
      if (suffix === 'ok') assert.notEqual(ok, null, file);
    }
  }
});

test('swift/compose/flutter rule edge cases', () => {
  assert.equal(only('Text("a").font(.system(size: 17, weight: .bold))', 'a.swift', 'swiftui-fixed-font').length, 1);
  assert.equal(only('Text("a").font(.system(size: 17, design: .serif))', 'a.swift', 'swiftui-fixed-font').length, 1);
  assert.equal(only('Text("a").font(.system(.body))', 'a.swift', 'swiftui-fixed-font').length, 0);
  assert.equal(only('Text("a").font(Font.custom("Fraunces", size: 17, relativeTo: .body))', 'a.swift', 'swiftui-fixed-font').length, 0);
  assert.equal(only('x.animation(Animation.linear(duration: 0.3), value: v)', 'a.swift', 'swiftui-linear').length, 1);
  assert.equal(only('withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) { r = 1 }', 'a.swift', 'swiftui-linear').length, 0);
  assert.equal(only('val s = tween<Float>(300, easing = LinearEasing)', 'a.kt', 'compose-linear').length, 1);
  assert.equal(only('infiniteRepeatable(animation = tween(900, easing = LinearEasing))', 'a.kt', 'compose-linear').length, 0);
  assert.equal(only('final c = Curves.linear;', 'a.dart', 'flutter-linear').length, 1);
  assert.equal(only('AnimationController(vsync: this)..repeat(); final c = Curves.linear;', 'a.dart', 'flutter-linear').length, 0);
  assert.equal(only('MediaQuery(data: d.copyWith(textScaleFactor: 1.0), child: c)', 'a.dart', 'flutter-no-text-scale').length, 1);
  assert.equal(only('MediaQuery(data: d.copyWith(textScaleFactor: 1), child: c)', 'a.dart', 'flutter-no-text-scale').length, 1);
  assert.equal(only('MediaQuery(data: d.copyWith(textScaler: TextScaler.noScaling), child: c)', 'a.dart', 'flutter-no-text-scale').length, 1);
  assert.equal(only('d.copyWith(textScaler: TextScaler.linear(1.2))', 'a.dart', 'flutter-no-text-scale').length, 0);
  assert.equal(only('d.copyWith(textScaleFactor: 1.5)', 'a.dart', 'flutter-no-text-scale').length, 0);
});

test('tiny-text covers Compose, Flutter and SwiftUI', () => {
  assert.equal(only('Text("x", fontSize = 10.sp)', 'a.kt', 'tiny-text').length, 1);
  assert.equal(only('Text("x", fontSize = 12.sp)', 'a.kt', 'tiny-text').length, 0);
  assert.equal(only('TextStyle(fontSize: 9)', 'a.dart', 'tiny-text').length, 1);
  assert.equal(only('TextStyle(fontSize: 14)', 'a.dart', 'tiny-text').length, 0);
  assert.equal(only('.font(.system(size: 10))', 'a.swift', 'tiny-text').length, 1);
});

test('rules do not cross languages', () => {
  assert.equal(only('let e = LinearEasing', 'a.swift', 'compose-linear').length, 0);
  assert.equal(only('x.animation(.linear(duration: 1), value: v)', 'a.kt', 'swiftui-linear').length, 0);
  assert.equal(only('final c = Curves.linear;', 'a.swift', 'flutter-linear').length, 0);
});

test('swiftui-no-reduce-motion project rule', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-sw-'));
  try {
    await fs.writeFile(path.join(root, 'A.swift'), 'struct A: View { var body: some View { Text("a").onTapGesture { withAnimation(.spring()) { x.toggle() } } } }\n');
    const f = await scanProject([root]);
    assert.deepEqual(f.map((x) => x.rule), ['swiftui-no-reduce-motion']);
    assert.equal(f[0].line, undefined);
    assert.equal(f[0].file, path.join(root, 'A.swift'));
    await fs.writeFile(path.join(root, 'B.swift'), '@Environment(\\.accessibilityReduceMotion) var reduce\n');
    assert.equal((await scanProject([root])).length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('RULE_IDS includes the swift/compose/flutter ids', () => {
  for (const id of [...Object.keys(SWIFT_IDS), 'swiftui-no-reduce-motion']) assert.ok(RULE_IDS.includes(id), id);
  assert.equal(new Set(RULE_IDS).size, RULE_IDS.length);
});

test('pure-black in Swift color context', () => {
  for (const c of ['.foregroundColor(.black)', '.foregroundStyle(.black)', '.background(.black)', '.fill(.black)', '.stroke(.black)', '.tint(.black)', 'UIColor.black']) {
    assert.equal(only(`Text("a")${c}`, 'a.swift', 'pure-black').length, 1, c);
  }
  for (const c of ['.fontWeight(.black)', '.shadow(color: .black.opacity(0.1), radius: 4)', '.font(.system(size: 1, weight: .black))', 'let w = Font.Weight.black']) {
    assert.equal(only(`Text("a")${c}`, 'a.swift', 'pure-black').length, 0, c);
  }
  assert.equal(only('x.background(.black)', 'a.kt', 'pure-black').length, 0);
});

test('swiftui-animation-no-value', () => {
  const n = (s) => only(s, 'a.swift', 'swiftui-animation-no-value');
  assert.equal(n('Text("a").animation(.easeIn)').length, 1);
  assert.equal(n('Text("a").animation(.easeIn(duration: 1))').length, 1);
  assert.equal(n('Text("a").animation(.spring, value: x)').length, 0);
  assert.equal(n('Text("a").animation(.spring(response: 0.3), value: x.y)').length, 0);
  assert.equal(n('Toggle("a", isOn: $flag.animation(.easeOut))').length, 0);
  assert.equal(n('Toggle("a", isOn: binding.animation(.easeOut))').length, 0);
  assert.equal(n('withAnimation(.spring) { x = 1 }').length, 0);
  assert.equal(n('Text("a").animation(.spring) { content in content.opacity(0.5) }').length, 0);
  assert.equal(n('Text("a").animation(.spring)\n{ content in content }').length, 0);
  assert.equal(n('Text("a").transition(.move(edge: .bottom).animation(.easeOut))').length, 0);
  assert.equal(n('Text("a").transition(.asymmetric(insertion: .scale, removal: .opacity).animation(.spring))').length, 0);
  assert.equal(n('Text("a").transition(.slide).animation(.easeIn)').length, 1);
});

test('swiftui-fill-no-clip', () => {
  const n = (s) => only(s, 'a.swift', 'swiftui-fill-no-clip');
  assert.equal(n('Image("a").resizable().scaledToFill().frame(width: 10)').length, 1);
  assert.equal(n('Image("a").resizable().aspectRatio(contentMode: .fill).frame(width: 10)').length, 1);
  assert.equal(n('Image("a").scaledToFill().frame(width: 10).clipped()').length, 0);
  assert.equal(n('Image("a").scaledToFill().frame(width: 10).clipShape(RoundedRectangle(cornerRadius: 8))').length, 0);
  assert.equal(n('Image("a").scaledToFill().frame(width: 10).clipped(antialiased: true)').length, 0);
  assert.equal(n('Image("a").aspectRatio(1, contentMode: .fill).frame(width: 10)').length, 1);
  assert.equal(n('Image("a").aspectRatio(1, contentMode: .fill).frame(width: 10).clipped()').length, 0);
  assert.equal(n('Image("a").scaledToFill()' + ' '.repeat(320) + '.clipped()').length, 1);
});
