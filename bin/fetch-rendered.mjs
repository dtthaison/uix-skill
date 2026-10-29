#!/usr/bin/env node
// Dev tool: print a page's rendered document.body.innerText (for JS-rendered docs sites).
// Usage: node bin/fetch-rendered.mjs <url> [--wait-ms 3000]
import { existsSync } from 'node:fs';
import { findChrome, launchChrome } from '../skills/uix-skill/scripts/lib/cdp.mjs';

class EnvError extends Error {}
const LOAD_TIMEOUT_MS = 30000;

function parseArgs(argv) {
  let url = null, waitMs = 3000;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--wait-ms') {
      waitMs = Number(argv[++i]);
      if (!Number.isFinite(waitMs) || waitMs < 0) throw new EnvError('--wait-ms needs a number of milliseconds.');
    } else if (!url) url = argv[i];
    else throw new EnvError(`Unexpected argument ${argv[i]}.`);
  }
  if (!url) throw new EnvError('Usage: node bin/fetch-rendered.mjs <url> [--wait-ms 3000]');
  return { url, waitMs };
}

async function main() {
  const { url, waitMs } = parseArgs(process.argv.slice(2));
  const envPath = process.env.CHROME_PATH;
  if (envPath && !existsSync(envPath)) throw new EnvError(`CHROME_PATH is set to ${envPath}, which does not exist.`);
  const chromePath = findChrome();
  if (!chromePath) throw new EnvError('Chrome not found. Install Google Chrome or set CHROME_PATH to its executable.');
  const cdp = await launchChrome({ chromePath });
  try {
    await cdp.send('Page.enable');
    let timer;
    const loaded = new Promise((res) => {
      cdp.on('Page.loadEventFired', () => res(true));
      timer = setTimeout(() => res(false), LOAD_TIMEOUT_MS);
    });
    const nav = await cdp.send('Page.navigate', { url });
    if (nav.errorText) throw new EnvError(`Could not load ${url}: ${nav.errorText}`);
    const ok = await loaded;
    clearTimeout(timer);
    if (!ok) throw new EnvError(`Could not load ${url}: timed out after ${LOAD_TIMEOUT_MS / 1000} s`);
    await new Promise((r) => setTimeout(r, waitMs));
    const res = await cdp.send('Runtime.evaluate', { expression: 'document.body ? document.body.innerText : ""', returnByValue: true });
    process.stdout.write(`${res.result?.value ?? ''}\n`);
  } finally {
    await cdp.close();
  }
}

main().catch((err) => {
  console.error(err instanceof EnvError ? err.message : `fetch-rendered failed: ${err.message}`);
  process.exit(2);
});
