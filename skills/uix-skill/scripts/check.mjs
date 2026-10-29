#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome, launchChrome } from './lib/cdp.mjs';
import { PROBE_SOURCE, evaluateFacts } from './lib/probe.mjs';

const LOAD_TIMEOUT_MS = 30000;
const SHORT_LOAD_MS = 5000;
const MAX_SHOT_HEIGHT = 16384;
const TILE_HEIGHT = 1600;
const MAX_TILES = 12;
const MAX_SCROLL_STEPS = 60;
const MAX_SCROLL_MS = 10000;
const ATTR_RE = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;
const URL_RE = /^[a-z][a-z0-9+.-]+:\/\//i;

class EnvError extends Error {}

const SCROLL_SOURCE = `(async (maxSteps, maxMs) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now();
  const step = Math.max(1, Math.round(innerHeight * 0.8));
  let steps = 0;
  let capped = false;
  for (let y = 0; ; y += step) {
    if (steps >= maxSteps || Date.now() - t0 > maxMs) { capped = true; break; }
    scrollTo({ top: y, left: 0, behavior: 'instant' });
    steps++;
    await sleep(120);
    if (y + innerHeight >= document.documentElement.scrollHeight) break;
  }
  scrollTo({ top: 0, left: 0, behavior: 'instant' });
  for (let i = 0; i < 20 && scrollY !== 0; i++) {
    scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await sleep(50);
  }
  await sleep(300);
  const pending = [...document.images].filter((i) => !i.complete);
  const done = Promise.all(pending.map((i) => new Promise((r) => {
    i.addEventListener('load', r, { once: true });
    i.addEventListener('error', r, { once: true });
  })));
  await Promise.race([done, sleep(5000)]);
  return { steps, capped };
})(${MAX_SCROLL_STEPS}, ${MAX_SCROLL_MS})`;

const themeSource = (attr, v, apply) => `((attr, v, apply) => {
  const el = attr === 'class'
    ? (document.body.classList.contains(v) ? document.body : document.documentElement)
    : (document.body.hasAttribute(attr) ? document.body : document.documentElement);
  try {
  if (apply) {
    window.__uixTheme = { el, prev: attr === 'class' ? el.classList.contains(v) : el.getAttribute(attr) };
    if (attr === 'class') el.classList.add(v); else el.setAttribute(attr, v);
  } else if (window.__uixTheme) {
    const { el: t, prev } = window.__uixTheme;
    if (attr === 'class') { if (!prev) t.classList.remove(v); }
    else if (prev === null) t.removeAttribute(attr); else t.setAttribute(attr, prev);
  }
  return null;
  } catch (err) { return String(err.message || err); }
})(${JSON.stringify(attr)}, ${JSON.stringify(v)}, ${apply})`;

async function probe(cdp, width) {
  const res = await cdp.send('Runtime.evaluate', { expression: PROBE_SOURCE, returnByValue: true });
  if (res.exceptionDetails) throw new Error(`Probe failed: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
  return evaluateFacts(res.result.value, width);
}

function resolveTarget(target) {
  if (URL_RE.test(target)) return target;
  if (!existsSync(target)) throw new EnvError(`Could not load ${target}: file not found`);
  return pathToFileURL(path.resolve(target)).href;
}

function chromeOrThrow() {
  const env = process.env.CHROME_PATH;
  if (env && !existsSync(env)) throw new EnvError(`CHROME_PATH is set to ${env}, which does not exist.`);
  const p = findChrome();
  if (!p) throw new EnvError('Chrome not found. Install Google Chrome or set CHROME_PATH to its executable.');
  return p;
}

export async function runCheck(target, { widths = [375, 768, 1280], outDir = '.uix/shots', loadTimeoutMs = LOAD_TIMEOUT_MS, themes = null } = {}) {
  const url = resolveTarget(target);
  const chromePath = chromeOrThrow();
  await fs.mkdir(outDir, { recursive: true });
  const cdp = await launchChrome({ chromePath });
  try {
    const shots = [];
    const findings = [];
    const notes = [];
    let loadWait = loadTimeoutMs;
    let width = 0;
    const consoleMsg = (text) => findings.push({ rule: 'console-error', severity: 'warn', message: text, width });
    cdp.on('Runtime.exceptionThrown', (p) => consoleMsg(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'Uncaught exception'));
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') consoleMsg(p.args.map((a) => a.value ?? a.description ?? '').join(' '));
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const w of widths) {
      width = w;
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 768 });
      let timer;
      const loaded = new Promise((res) => {
        cdp.on('Page.loadEventFired', () => res(true));
        timer = setTimeout(() => res(false), loadWait);
      });
      try {
        const nav = await cdp.send('Page.navigate', { url });
        if (nav.errorText) throw new EnvError(`Could not load ${target}: ${nav.errorText}`);
        if (!(await loaded)) {
          const rs = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
          if (rs.result?.value !== 'interactive' && rs.result?.value !== 'complete') {
            throw new EnvError(`Could not load ${target}: timed out after ${Math.round(loadWait / 1000)} s`);
          }
          notes.push(`load event timed out at ${w}; probed after DOMContentLoaded`);
          loadWait = Math.min(loadWait, SHORT_LOAD_MS);
        }
      } finally {
        clearTimeout(timer);
      }
      await new Promise((r) => setTimeout(r, 500));
      const scroll = await cdp.send('Runtime.evaluate', { expression: SCROLL_SOURCE, awaitPromise: true, returnByValue: true });
      if (scroll.result?.value?.capped) notes.push(`scroll pass stopped at the cap (${MAX_SCROLL_STEPS} steps or ${MAX_SCROLL_MS / 1000} s) at ${w}; content below was not revealed`);
      findings.push(...(await probe(cdp, w)));

      const { cssContentSize } = await cdp.send('Page.getLayoutMetrics');
      const full = { x: 0, y: 0, width: Math.max(w, Math.ceil(cssContentSize.width)), height: Math.ceil(cssContentSize.height), scale: 1 };
      const shoot = (clip) => cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
      let shot = null;
      try {
        shot = await shoot(full);
      } catch {
        try {
          shot = await shoot({ ...full, height: Math.min(full.height, MAX_SHOT_HEIGHT) });
          notes.push(`full-page screenshot failed at ${w}; saved the first ${MAX_SHOT_HEIGHT} px`);
        } catch (err) {
          notes.push(`screenshot failed at ${w}: ${err.message}`);
        }
      }
      if (!shot) continue;
      const file = path.join(outDir, `${w}.png`);
      await fs.writeFile(file, Buffer.from(shot.data, 'base64'));
      shots.push(file);

      const total = Math.ceil(full.height / TILE_HEIGHT);
      if (total < 2) continue;
      if (total > MAX_TILES) notes.push(`page is ${full.height} px tall at ${w}; saved the first ${MAX_TILES} tiles only`);
      for (let n = 0; n < Math.min(total, MAX_TILES); n++) {
        const y = n * TILE_HEIGHT;
        try {
          const tile = await shoot({ ...full, y, height: Math.min(TILE_HEIGHT, full.height - y) });
          const tileFile = path.join(outDir, `${w}-${n}.png`);
          await fs.writeFile(tileFile, Buffer.from(tile.data, 'base64'));
          shots.push(tileFile);
        } catch (err) {
          notes.push(`tile ${n} failed at ${w}: ${err.message}`);
        }
      }
    }

    if (themes) {
      const baseKeys = new Set(findings.filter((f) => f.width === width).map((f) => `${f.rule}\0${f.selector ?? ''}\0${f.message}\0${f.count ?? ''}`));
      for (const v of themes.values) {
        const set = await cdp.send('Runtime.evaluate', { expression: themeSource(themes.attr, v, true), returnByValue: true });
        if (set.result?.value) notes.push(`could not apply theme ${themes.attr}=${v}: ${set.result.value}`);
        await new Promise((r) => setTimeout(r, 300));
        const found = await probe(cdp, width);
        await cdp.send('Runtime.evaluate', { expression: themeSource(themes.attr, v, false), returnByValue: true });
        for (const f of found) {
          if (!baseKeys.has(`${f.rule}\0${f.selector ?? ''}\0${f.message}\0${f.count ?? ''}`)) findings.push({ ...f, theme: v });
        }
      }
    }
    return { shots, findings, notes };
  } finally {
    await cdp.close();
  }
}

async function main(argv) {
  let target = null;
  let widths = [375, 768, 1280];
  let outDir = '.uix/shots';
  let themes = null;
  let bad = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--widths') widths = (argv[++i] || '').split(',').map(Number);
    else if (argv[i] === '--out') outDir = argv[++i];
    else if (argv[i] === '--themes') {
      const m = /^([^=]+)=(.+)$/.exec(argv[++i] || '');
      const values = m ? m[2].split(',').map((v) => v.trim()) : [];
      if (!m || !ATTR_RE.test(m[1]) || values.some((v) => !v)) bad = true;
      else themes = { attr: m[1], values };
    }
    else if (!target) target = argv[i];
  }
  if (bad || !target || !outDir || widths.length === 0 || widths.some((w) => !Number.isInteger(w) || w <= 0)) {
    process.stderr.write('usage: check.mjs <url|file> [--widths 375,768,1280] [--out .uix/shots] [--themes attr=v1,v2]\n');
    return 2;
  }
  try {
    const { shots, findings, notes } = await runCheck(target, { widths, outDir, themes });
    process.stdout.write(JSON.stringify({ shots, findings, notes }, null, 2) + '\n');
    return findings.some((f) => f.severity === 'error') ? 1 : 0;
  } catch (err) {
    process.stderr.write(`check.mjs: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
