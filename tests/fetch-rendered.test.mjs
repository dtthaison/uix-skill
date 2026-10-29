import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { findChrome } from '../skills/uix-skill/scripts/lib/cdp.mjs';

const chrome = findChrome();
const itc = chrome ? test : test.skip;
const CLI = 'bin/fetch-rendered.mjs';

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const listen = (server) => new Promise((res) => server.listen(0, '127.0.0.1', () => res(server.address().port)));

itc('fetch-rendered: prints text injected by a script after load', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><body><div id="app"></div><script>setTimeout(() => { document.getElementById("app").textContent = "rendered-by-script-4821"; }, 200);</script></body>');
  });
  const port = await listen(server);
  try {
    const r = await run([`http://127.0.0.1:${port}/`, '--wait-ms', '1000']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /rendered-by-script-4821/);
  } finally {
    server.close();
  }
});

itc('fetch-rendered: a closed port exits 2', async () => {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((res) => server.close(res));
  const r = await run([`http://127.0.0.1:${port}/`, '--wait-ms', '200']);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.trim(), 'a message on stderr');
});

test('fetch-rendered: a bad CHROME_PATH exits 2 naming Chrome', async () => {
  const r = await run(['http://127.0.0.1:1/'], { CHROME_PATH: '/nonexistent/chrome' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /chrome/i);
});

test('fetch-rendered: a non-numeric --wait-ms exits 2', async () => {
  const r = await run(['http://127.0.0.1:1/', '--wait-ms', 'abc']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /wait-ms/);
});
