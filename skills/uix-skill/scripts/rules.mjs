#!/usr/bin/env node
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WEB_RULES, MOTION_RE, REDUCED_MOTION_RE } from './lib/rules-web.mjs';
import { NATIVE_RULES, RN_RULES, NATIVE_PROJECT_RULES, isNativeJs, hasJsx } from './lib/rules-native.mjs';
import { walkFiles } from './lib/walk.mjs';
import { RENDERED_RULE_IDS } from './lib/probe.mjs';
import { MOBILE_RULE_IDS } from './lib/hierarchy.mjs';

export { WEB_RULES, NATIVE_RULES, RN_RULES, NATIVE_PROJECT_RULES };

const WEB_EXT = ['.css', '.scss', '.html', '.jsx', '.tsx', '.js', '.ts', '.vue', '.svelte', '.astro', '.blade.php'];
const JS_EXT = ['.js', '.jsx', '.ts', '.tsx'];
const NATIVE_EXT = ['.swift', '.kt', '.dart', '.xaml', '.axaml', '.fxml', '.java', '.cs'];

export const RULE_IDS = [...new Set([...WEB_RULES, ...NATIVE_RULES, ...RN_RULES, ...NATIVE_PROJECT_RULES].map((r) => r.id).concat('no-reduced-motion', RENDERED_RULE_IDS, MOBILE_RULE_IDS))];

const hasExt = (p, list) => list.some((e) => p.toLowerCase().endsWith(e));

function lineIndex(text) {
  const nl = [];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) nl.push(i);
  return (offset) => {
    let lo = 0;
    let hi = nl.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nl[mid] < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

export function scanSource(text, { path, allowFonts = [] }) {
  const ext = [...WEB_EXT, ...NATIVE_EXT].filter((e) => path.toLowerCase().endsWith(e)).sort((a, b) => b.length - a.length)[0];
  if (!ext) return [];
  const rules = JS_EXT.includes(ext) && isNativeJs(text) ? [...NATIVE_RULES, ...RN_RULES] : WEB_EXT.includes(ext) ? WEB_RULES : NATIVE_RULES;
  const ctx = { path, allowFonts, lineAt: lineIndex(text) };
  const findings = [];
  for (const rule of rules) {
    if (rule.exts && !rule.exts.includes(ext)) continue;
    for (const h of rule.test(text, ctx)) {
      findings.push({ rule: rule.id, severity: rule.severity, message: h.message, file: path, line: h.line });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_PER_RULE = 20;

function capPerRule(findings, file) {
  const seen = new Map();
  const out = [];
  for (const f of findings) {
    const n = (seen.get(f.rule) || 0) + 1;
    seen.set(f.rule, n);
    if (n <= MAX_PER_RULE) out.push(f);
  }
  for (const [rule, n] of seen) {
    if (n <= MAX_PER_RULE) continue;
    const base = findings.find((f) => f.rule === rule);
    out.push({ rule, severity: base.severity, message: `${n - MAX_PER_RULE} more ${rule} hits in this file suppressed`, file, line: base.line });
  }
  return out;
}

async function readScannable(file, skipped) {
  if (/\.min\.[^/\\]+$/i.test(file)) {
    skipped.push({ file, reason: 'minified' });
    return null;
  }
  try {
    if ((await fs.stat(file)).size > MAX_FILE_BYTES) {
      skipped.push({ file, reason: 'too-large' });
      return null;
    }
    return await fs.readFile(file, 'utf8');
  } catch {
    skipped.push({ file, reason: 'unreadable' });
    return null;
  }
}

const RING_SELECTORS = new Set([':focus-visible', '*:focus-visible', ':root :focus-visible', 'html :focus-visible']);
const RING_VALUE_RE = /(?<![\w-])outline\s*:\s*(?!\s*(?:none|0)(?![\w.]))[^;}\s]/i;

function stripPrintMedia(css) {
  let out = '';
  let i = 0;
  for (const m of css.matchAll(/@media[^{]*\bprint\b[^{]*\{/g)) {
    if (m.index < i) continue;
    out += css.slice(i, m.index);
    let depth = 1;
    i = m.index + m[0].length;
    while (i < css.length && depth > 0) depth += css[i++] === '{' ? 1 : css[i - 1] === '}' ? -1 : 0;
  }
  return out + css.slice(i);
}

function hasGlobalRing(css) {
  const clean = stripPrintMedia(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const global = m[1].split(',').some((sel) => RING_SELECTORS.has(sel.trim().replace(/\s+/g, ' ')));
    if (global && RING_VALUE_RE.test(m[2])) return true;
  }
  return false;
}
const RING_NOTE = ' (a global :focus-visible ring restores it; check specificity)';

export async function scanProject(paths, { allowFonts = [], skipped = [] } = {}) {
  const findings = [];
  let motionFile = null;
  let reduced = false;
  let globalRing = false;
  const projState = {};
  let nativeProject = false;
  const dataEmoji = new Set();
  for await (const file of walkFiles(paths)) {
    if (!hasExt(file, WEB_EXT) && !hasExt(file, NATIVE_EXT)) continue;
    const text = await readScannable(file, skipped);
    if (text === null) continue;
    const nativeJs = hasExt(file, JS_EXT) && isNativeJs(text);
    const web = hasExt(file, WEB_EXT) && !nativeJs;
    if (nativeJs) nativeProject = true;
    const dataFile = /\.[tj]s$/i.test(file) && !nativeJs && !hasJsx(text);
    for (const f of capPerRule(scanSource(text, { path: file, allowFonts }), file)) {
      findings.push(f);
      if (dataFile && f.rule === 'emoji-icon') dataEmoji.add(f);
    }
    if (/\.s?css$/i.test(file) && hasGlobalRing(text)) globalRing = true;
    for (const rule of NATIVE_PROJECT_RULES) {
      if (!rule.exts.some((e) => file.toLowerCase().endsWith(e))) continue;
      if (JS_EXT.some((e) => rule.exts.includes(e)) && hasExt(file, JS_EXT) && !nativeJs) continue;
      const st = (projState[rule.id] ??= { file: null, handled: false });
      if (!st.file && rule.uses.test(text)) st.file = file;
      if (rule.handles.test(text)) st.handled = true;
    }
    if (web) {
      if (!motionFile && MOTION_RE.test(text)) motionFile = file;
      if (REDUCED_MOTION_RE.test(text)) reduced = true;
    }
  }
  // A React Native project's .ts/.js files with no JSX hold copy and data; their emoji are not icons.
  if (nativeProject && dataEmoji.size) {
    for (let i = findings.length - 1; i >= 0; i--) if (dataEmoji.has(findings[i])) findings.splice(i, 1);
  }
  if (globalRing) {
    for (const f of findings) {
      if (f.rule !== 'outline-none' || !/\.s?css$/i.test(f.file)) continue;
      f.severity = 'warn';
      if (!/suppressed$/.test(f.message)) f.message += RING_NOTE;
    }
  }
  for (const rule of NATIVE_PROJECT_RULES) {
    const st = projState[rule.id];
    if (st?.file && !st.handled) findings.push({ rule: rule.id, severity: rule.severity, message: rule.message, file: st.file });
  }
  if (motionFile && !reduced) {
    findings.push({
      rule: 'no-reduced-motion',
      severity: 'warn',
      message: 'Motion is used but nothing respects prefers-reduced-motion.',
      file: motionFile,
    });
  }
  return findings;
}

export function fontsFromDesignMd(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return [];
  const fonts = new Set();
  for (const line of fm[1].split(/\r?\n/)) {
    const m = /^\s*fontFamily\s*:\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const v = m[1];
    const q = v[0] === '"' || v[0] === "'" ? v[0] : null;
    const name = q ? v.slice(1, v.indexOf(q, 1) === -1 ? undefined : v.indexOf(q, 1)) : v;
    if (name) fonts.add(name);
  }
  return [...fonts];
}

async function main(argv) {
  let design = null;
  const paths = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--design') design = argv[++i];
    else paths.push(argv[i]);
  }
  if (paths.length === 0 || design === undefined) {
    process.stderr.write('usage: rules.mjs [--design DESIGN.md] <path...>\n');
    return 2;
  }
  try {
    const allowFonts = design ? fontsFromDesignMd(await fs.readFile(design, 'utf8')) : [];
    const skipped = [];
    const findings = await scanProject(paths, { allowFonts, skipped });
    process.stdout.write(JSON.stringify({ findings, skipped }, null, 2) + '\n');
    return findings.some((f) => f.severity === 'error') ? 1 : 0;
  } catch (err) {
    process.stderr.write(`rules.mjs: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
