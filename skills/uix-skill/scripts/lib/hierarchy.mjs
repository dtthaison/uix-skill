// Maestro hierarchy -> findings for check-mobile.
// How check-mobile uses them: references/mobile-testing.md.
import { defaultSleep, assertUdid } from './sim.mjs';

export const MOBILE_RULE_IDS = ['missing-label', 'app-error', 'flow-failed', 'route-not-navigated'];

// First load of a project: pass timeoutMs 90000; later reads use the 45 s default.
// Returns as soon as `until(tree)` holds or the screen is an app-error. On timeout the
// last parsed tree (or null) comes back with an `unverified:` note.
export async function readHierarchy(run, udid, { sleep = defaultSleep, now = Date.now, timeoutMs = 45000, intervalMs = 3000, until } = {}) {
  assertUdid(udid);
  let started = null; // the clock starts once the first run returns: it may have waited in the maestro queue
  let reason = 'no output from maestro hierarchy';
  let last = null;
  for (;;) {
    const r = await run('maestro', ['--device', udid, 'hierarchy'], { timeoutMs: 60000 });
    started ??= now();
    const err = `${r.stderr ?? ''}${r.stdout ?? ''}`;
    if (r.code !== 0) {
      if (/is not connected/i.test(err)) return { tree: null, note: `unverified: maestro: device ${udid} not connected` };
      const first = String(r.stderr ?? '').trim().split(/\r?\n/)[0].trim().slice(0, 120);
      reason = first ? `maestro hierarchy exited ${r.code}: ${first}` : `maestro hierarchy exited ${r.code}`;
    } else if (!r.stdout.trim()) {
      reason = 'maestro hierarchy printed nothing';
    } else {
      let tree;
      try {
        tree = JSON.parse(r.stdout);
      } catch {
        reason = 'maestro hierarchy output was not JSON';
      }
      if (tree !== undefined) {
        if (!tree || typeof tree !== 'object' || (!tree.attributes && !tree.children)) {
          reason = 'unexpected hierarchy shape';
        } else {
          last = tree;
          if (!until || until(tree) || detectAppError(tree)) return { tree };
          reason = 'expected content did not appear';
        }
      }
    }
    if (now() - started + intervalMs > timeoutMs) return { tree: last, note: `unverified: ${reason} (gave up after ${Math.round(timeoutMs / 1000)}s)` };
    await sleep(intervalMs);
  }
}

const attr = (n, k) => String(n?.attributes?.[k] ?? '');
const kidsOf = (n) => n?.children ?? [];

function parseBounds(s) {
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(s);
  if (!m) return null;
  return { x1: +m[1], y1: +m[2], w: +m[3] - +m[1], h: +m[4] - +m[2] };
}

// The label text (accessibilityText, else title, else text), or '' when there is none.
const hasLabel = (n, ignoreText) => attr(n, 'accessibilityText') || attr(n, 'title') || (!ignoreText && attr(n, 'text')) || '';

function collectLabels(n, out = []) {
  const t = attr(n, 'accessibilityText');
  if (t && out[out.length - 1] !== t) out.push(t);
  for (const c of kidsOf(n)) collectLabels(c, out);
  return out;
}

// Android red-box labels (Dismiss, Minimize, Log N of M) are not verified yet; this is the iOS shape.
export function detectAppError(tree, route) {
  const app = kidsOf(tree)[0] ?? tree;
  const labels = collectLabels(app);
  const head = labels.findIndex((t) => /^Log \d+ of \d+$/.test(t));
  if (head < 0 || !labels.includes('Dismiss') || !labels.includes('Minimize')) return null;
  const title = labels[head + 1] ?? 'Error';
  const detail = labels[head + 2];
  return {
    rule: 'app-error',
    severity: 'error',
    route,
    message: detail && !['Sources', 'Dismiss'].includes(detail) ? `${title}: ${detail}` : title,
  };
}

// The hierarchy has no role or class key; honour one if a capture ever carries it.
const isInteractive = (n) => attr(n, 'clickable') === 'true' || /^(button|switch|link)$/i.test(attr(n, 'role') || attr(n, 'accessibilityRole'));
// A labelled leaf that is one line tall and much wider than tall is a text line, not a control.
const isTextLine = (n, label, b) => Boolean(label) && !attr(n, 'resource-id') && Math.min(b.w, b.h) < 24 && b.w >= 4 * b.h;

// Android: drop every systemui subtree (and wrappers it leaves empty), skip Expo Go's Tools button,
// work in dp (each bound rounded after px * 160 / density), 48 dp minimum, trust `clickable` and `class`.
function pruneSystemUi(n) {
  if (attr(n, 'resource-id').startsWith('com.android.systemui:')) return null;
  const kids = kidsOf(n);
  if (!kids.length) return n;
  const kept = kids.map(pruneSystemUi).filter(Boolean);
  return kept.length ? { ...n, children: kept } : null;
}
const isToolsButton = (n) => attr(n, 'accessibilityText') === 'Tools' && !attr(n, 'text') && /(^|\.)ImageView$/.test(attr(n, 'class'));
const isToolsWrapper = (n) => isToolsButton(n) || (kidsOf(n).length === 1 && !attr(n, 'text') && !attr(n, 'accessibilityText') && isToolsWrapper(kidsOf(n)[0]));
const androidInteractive = (n) => attr(n, 'clickable') === 'true' || /(Button|Switch|CheckBox|RadioButton|SeekBar)$/.test(attr(n, 'class'));
const androidLabel = (n) => attr(n, 'accessibilityText') || attr(n, 'text') || kidsOf(n).map(androidLabel).find(Boolean) || '';

function androidFindings(tree, route, density) {
  const err = detectAppError(tree, route);
  if (err) return [err];
  const dp = (v) => Math.round((v * 160) / density);
  const findings = [];
  const seen = new Set();
  const visit = (n, scroll = null) => {
    if (isToolsWrapper(n)) return;
    const kids = kidsOf(n);
    if (androidInteractive(n)) {
      const p = parseBounds(attr(n, 'bounds'));
      let big = false; // a screen-sized clickable (scrim, root) with text must not hide the controls under it
      if (p) {
        const x1 = dp(p.x1), y1 = dp(p.y1);
        const b = { x1, y1, w: dp(p.x1 + p.w) - x1, h: dp(p.y1 + p.h) - y1 };
        big = b.w > 600 || b.h > 600;
        const label = androidLabel(n);
        const lo = Math.min(b.w, b.h);
        const key = `${b.x1},${b.y1},${b.w},${b.h}`;
        if (b.w > 0 && b.h > 0 && lo >= 8 && Math.max(b.w, b.h) / lo <= 20) {
          const add = (rule, severity, message) => {
            if (seen.has(`${rule}|${key}`)) return;
            seen.add(`${rule}|${key}`);
            findings.push({ rule, severity, message, route, bounds: `[${b.x1},${b.y1}][${b.x1 + b.w},${b.y1 + b.h}]` });
          };
          // bounds hold only the visible part: a control cut by its scroll area's edge looks thin
          // touching exactly one edge: a control that fills the scroller across an axis is whole, not cut
          const clipW = scroll && ((p.x1 === scroll.x1) !== (p.x1 + p.w === scroll.x1 + scroll.w));
          const clipH = scroll && ((p.y1 === scroll.y1) !== (p.y1 + p.h === scroll.y1 + scroll.h));
          const clipped = b.w <= b.h ? clipW : clipH;
          if (lo < 48 && !clipped) add('small-target', 'warn', `Touch target ${b.w}x${b.h} dp is under 48x48 (${label || 'unlabelled'}).`);
          if (!label && b.w <= 64 && b.h <= 64) add('missing-label', 'warn', `Interactive element ${b.w}x${b.h} dp has no text or accessibility label (lower confidence: may be decorative)`);
        }
      }
      if (androidLabel(n) && !big) return; // a labelled control (card-sized or smaller): everything inside is one of its parts
    }
    const sp = attr(n, 'scrollable') === 'true' ? parseBounds(attr(n, 'bounds')) : null;
    kids.forEach((c) => visit(c, sp ?? scroll));
  };
  const pruned = pruneSystemUi(tree);
  if (!pruned) return [];
  visit(pruned);
  return findings;
}

export function findingsFromHierarchy(tree, { route, native = false, platform = 'ios', density = 160 } = {}) {
  if (platform === 'android') return androidFindings(tree, route, density);
  const app = kidsOf(tree)[0] ?? tree;
  const err = detectAppError(tree, route);
  if (err) return [err];
  const findings = [];
  const addFinding = (rule, severity, message, b) => findings.push({ rule, severity, message, route, bounds: `[${b.x1},${b.y1}][${b.x1 + b.w},${b.y1 + b.h}]` });

  const seen = new Set();
  const check = (kind, label, b, n) => {
    const lo = Math.min(b.w, b.h);
    if (lo < 8 || Math.max(b.w, b.h) / lo > 20) return; // scroll indicators, drag handles, hairlines
    const key = `${b.x1},${b.y1},${b.w},${b.h}`;
    const add = (rule, ...rest) => { if (!seen.has(`${rule}|${key}`)) { seen.add(`${rule}|${key}`); addFinding(rule, ...rest); } };
    const name = label || 'unlabelled';
    if (kind === 'control' && lo < 44 && (isInteractive(n) || !isTextLine(n, label, b))) add('small-target', 'warn', `Touch target ${b.w}x${b.h} pt is under 44x44 (${name}).`, b);
    if (!label && kind === 'switch') add('missing-label', 'error', `Switch ${b.w}x${b.h} pt has no accessibility label.`, b);
    else if (!label && b.w <= 64 && b.h <= 64) add('missing-label', 'warn', `Interactive element ${b.w}x${b.h} pt has no text or accessibility label (lower confidence: may be decorative)`, b);
  };

  // A glyph part: unlabelled leaf inside a labelled ancestor that sits below the app node and is not the app's own box.
  const appBounds = attr(app, 'bounds');
  // Native: the ancestor must also be at least 44x44, so a small labelled wrapper does not hide a small icon.
  const inLabelled = (b, anc) => anc.some((a) => {
    const ab = attr(a, 'bounds');
    const p = parseBounds(ab);
    return ab !== appBounds && p && (!native || Math.min(p.w, p.h) >= 44) && b.x1 >= p.x1 && b.y1 >= p.y1 && b.x1 + b.w <= p.x1 + p.w && b.y1 + b.h <= p.y1 + p.h;
  });

  const visit = (n, anc = []) => {
    if (attr(n, 'resource-id') === 'gearshape.fill') return;
    const kids = kidsOf(n);
    const b = parseBounds(attr(n, 'bounds'));
    const k = kids[0];
    if (kids.length === 1 && k && attr(k, 'bounds') === attr(n, 'bounds') && !kidsOf(k).length) {
      if (attr(k, 'resource-id') === 'gearshape.fill') return;
      const isSwitch = /^[01]$/.test(attr(k, 'value')) && !attr(k, 'accessibilityText');
      if (isSwitch && b && b.w > 0 && b.h > 0) check('switch', hasLabel(n, true), b, n);
      return; // static text or image: never flagged
    }
    if (!kids.length) {
      if (b && b.w > 0 && b.h > 0) {
        const label = hasLabel(n, false);
        // Native (iOS reports no roles): a labelled leaf without a resource-id is text; any leaf inside a labelled control is part of it.
        if (native && ((label && !attr(n, 'resource-id')) || inLabelled(b, anc))) return;
        if (label || !inLabelled(b, anc)) check('control', label, b, n);
      }
      return;
    }
    const next = n !== app && attr(n, 'accessibilityText') ? [...anc, n] : anc;
    kids.forEach((c) => visit(c, next));
  };
  visit(app);
  return findings;
}
