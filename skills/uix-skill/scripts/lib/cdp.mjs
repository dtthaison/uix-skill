import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
];
const PATH_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

export function findChrome() {
  const env = process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  for (const p of CANDIDATES) if (existsSync(p)) return p;
  const exts = process.platform === 'win32' ? ['.exe', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const n of PATH_NAMES) {
      for (const e of exts) {
        const p = path.join(dir, n + e);
        if (dir && existsSync(p)) return p;
      }
    }
  }
  for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
    if (!base) continue;
    const p = path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe');
    if (existsSync(p)) return p;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readPort(file, child, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error('Chrome exited before DevTools was ready');
    try {
      const [port] = (await fs.readFile(file, 'utf8')).split('\n');
      if (port) return Number(port);
    } catch {}
    await sleep(50);
  }
  throw new Error('Timed out waiting for Chrome DevTools (10 s)');
}

export async function launchChrome({ chromePath }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uix-chrome-'));
  let child;
  let ws;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try { ws?.close(); } catch {}
    if (child && child.exitCode === null) {
      const exited = new Promise((r) => child.once('exit', r));
      child.kill('SIGKILL');
      await exited;
    }
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  try {
    child = spawn(chromePath, [
      '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
    ], { stdio: 'ignore' });
    const spawnError = new Promise((_, rej) => child.once('error', rej));
    const port = await Promise.race([readPort(path.join(dir, 'DevToolsActivePort'), child, 10000), spawnError]);
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (!page) throw new Error('Chrome has no page target');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('DevTools connection failed')), { once: true });
    });
    let nextId = 1;
    const pending = new Map();
    const handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (p) msg.error ? p.rej(new Error(`${p.method}: ${msg.error.message}`)) : p.res(msg.result);
      } else if (msg.method) {
        for (const fn of handlers.get(msg.method) || []) fn(msg.params);
      }
    });
    ws.addEventListener('close', () => {
      for (const p of pending.values()) p.rej(new Error('DevTools connection closed'));
      pending.clear();
    });
    return {
      send: (method, params = {}) => new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, { res, rej, method });
        ws.send(JSON.stringify({ id, method, params }));
      }),
      on: (event, fn) => {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(fn);
      },
      close,
    };
  } catch (err) {
    await close();
    throw err;
  }
}
