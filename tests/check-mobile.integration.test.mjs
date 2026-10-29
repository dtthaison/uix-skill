// Gated end-to-end test for check-mobile: real iOS Simulator, Expo Go, Maestro and Metro,
// against the tiny app in tests/fixtures/mobile-app. Slow (minutes), needs network, and creates
// (then deletes) a simulator. Run with: UIX_MOBILE_IT=1 node --test tests/check-mobile.integration.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRun } from '../skills/uix-skill/scripts/lib/sim.mjs';
import { runMobileCheck } from '../skills/uix-skill/scripts/check-mobile.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'fixtures', 'mobile-app');
const xcode = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' });
const enabled = process.env.UIX_MOBILE_IT === '1' && xcode.status === 0 && xcode.stdout.trim() !== '';
const reason = process.env.UIX_MOBILE_IT !== '1'
  ? 'set UIX_MOBILE_IT=1 to run (needs Xcode simulators, Maestro, network, minutes)'
  : 'xcode-select -p failed: Xcode is not installed';

const simctlDevices = () => {
  const r = spawnSync('xcrun', ['simctl', 'list', '-j', 'devices'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const map = new Map();
  for (const [runtime, list] of Object.entries(JSON.parse(r.stdout).devices)) {
    for (const d of list) map.set(d.udid, { name: d.name, state: d.state, runtime });
  }
  return map;
};

// 3000, 3418, 3419 and 3420 are the owner's own dev servers: never pick or touch them.
const OWNER_PORTS = new Set([3000, 3418, 3419, 3420]);
const freePort = async () => {
  for (let i = 0; i < 20; i++) {
    const port = await new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.once('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const { port: p } = srv.address();
        srv.close(() => resolve(p));
      });
    });
    if (!OWNER_PORTS.has(port)) return port;
  }
  throw new Error('could not find a free port outside the owner ports');
};

const lsofBusy = (port) => spawnSync('lsof', ['-i', `:${port}`], { encoding: 'utf8' }).stdout.trim() !== '';

async function waitForStatus(port, child, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`Metro exited early with code ${child.exitCode}`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(2000) });
      if ((await r.text()).includes('packager-status:running')) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Metro did not answer /status on port ${port} within ${timeoutMs} ms`);
}

const test_ = enabled ? test : test.skip;
test_(`check-mobile end to end on a fixture Expo app${enabled ? '' : ` (skipped: ${reason})`}`, { timeout: 15 * 60 * 1000 }, async (t) => {
  const before = simctlDevices();
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'uix-mobile-it-')));
  const appDir = path.join(work, 'app');
  const out = path.join(work, 'shots');
  const created = [];
  const calls = []; // { sub, udids } for every xcrun simctl / maestro call made by the tool
  const UUID = /[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}/gi;
  const TARGET_VERBS = new Set(['boot', 'shutdown', 'delete', 'erase', 'install', 'openurl', 'terminate', 'ui', 'status_bar', 'io', 'launch', 'uninstall']);
  const recordingRun = async (cmd, args, opts) => {
    const res = await defaultRun(cmd, args, opts);
    if (cmd === 'xcrun' || cmd === 'maestro') {
      const sub = cmd === 'maestro' ? 'maestro' : args[1];
      const udids = args.join(' ').match(UUID) ?? [];
      calls.push({ sub, udids });
      if (sub === 'create') for (const u of res.stdout.match(UUID) ?? []) createdByCreate.push({ udid: u, name: args[2] });
    }
    return res;
  };
  const createdByCreate = [];
  let primaryError = null;
  let metro = null;
  const log = [];
  console.log(`integration workdir: ${work}`);
  try {
    fs.cpSync(fixture, appDir, { recursive: true, filter: (s) => !/node_modules/.test(s) });
    const inst = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: appDir, encoding: 'utf8', timeout: 5 * 60 * 1000 });
    assert.equal(inst.status, 0, `npm install failed: ${inst.stderr}`);

    const port = await freePort();
    assert.ok(!lsofBusy(port), `port ${port} is in use`);
    metro = spawn('npx', ['expo', 'start', '--port', String(port)], {
      cwd: appDir, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' },
    });
    metro.stdout.on('data', (d) => log.push(String(d)));
    metro.stderr.on('data', (d) => log.push(String(d)));
    await waitForStatus(port, metro, 120000);

    const routes = [{ name: 'home', path: '/' }, { name: 'second', path: '/second' }];
    const result = await runMobileCheck({
      app: `exp://127.0.0.1:${port}`,
      routes,
      modes: ['light', 'xxxl'],
      devices: ['iPhone SE (3rd generation)'],
      out,
      video: false,
      flow: null,
      keep: false,
      appJson: JSON.parse(fs.readFileSync(path.join(appDir, 'app.json'), 'utf8')),
      pkgJson: JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')),
    }, {
      run: recordingRun,
      cwd: appDir,
      onCreated: (s) => { created.push(s.udid); console.log(`created simulator ${s.name} ${s.udid}`); },
    });
    console.log(JSON.stringify(result, null, 2));

    assert.equal(result.shots.length, 4);
    for (const f of result.shots) {
      assert.ok(fs.existsSync(f), `${f} missing`);
      assert.ok(fs.statSync(f).size > 5 * 1024, `${f} is under 5 KB`);
    }
    const light = (n) => result.shots.find((f) => f.endsWith(`-${n}-light.png`));
    assert.ok(light('home') && light('second'), 'light shots of both routes');
    assert.ok(!fs.readFileSync(light('home')).equals(fs.readFileSync(light('second'))), 'home and second light shots are identical: the deep link did not navigate');
    // Guard against the Expo Go onboarding sheet / dev menu covering the app: the second screen has
    // no controls, so any finding there means overlay elements were read.
    assert.deepEqual(result.findings.filter((f) => f.route === 'second'), [], 'findings on the control-free second screen (overlay still showing?)');
    assert.ok(
      result.findings.some((f) => (f.rule === 'missing-label' || f.rule === 'small-target') && f.route === 'home'),
      `no missing-label/small-target finding for the unlabelled control: ${JSON.stringify(result.findings)}`,
    );
  } catch (e) {
    primaryError = e;
    throw e;
  } finally {
    if (metro?.pid) {
      try { process.kill(-metro.pid, 'SIGTERM'); } catch { /* already gone */ }
      await new Promise((r) => setTimeout(r, 1500));
      try { process.kill(-metro.pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    const ours = new Set([...created, ...createdByCreate.map((c) => c.udid)]);
    const after = simctlDevices();
    const failures = [];
    const bySub = {};
    for (const c of calls) for (const u of c.udids) (bySub[u] ??= new Set()).add(c.sub);
    const used = new Set(calls.flatMap((c) => c.udids));
    // (a) every targeted udid belongs to a simulator this run created
    for (const c of calls) {
      if (c.sub !== 'maestro' && !TARGET_VERBS.has(c.sub)) continue;
      for (const u of c.udids) if (!ours.has(u)) failures.push(`simctl ${c.sub} / maestro targeted ${u}, which this run did not create`);
    }
    // (b) pre-existing devices that vanished or changed state
    for (const [udid, was] of before) {
      const now = after.get(udid);
      if (now && now.state === was.state) continue;
      const what = now ? `${was.state} -> ${now.state}` : 'removed';
      if (used.has(udid)) failures.push(`pre-existing simulator ${was.name} ${udid} ${what} and appears in a recorded call (${[...bySub[udid]].join(',')})`);
      else t.diagnostic(`changed by another process: ${was.name} ${udid} ${what}`);
    }
    // (c) new devices: ours must be gone; unknown uix-* devices of this run id are failures
    for (const u of ours) if (after.has(u)) failures.push(`simulator ${u} created by this run still exists`);
    for (const [udid, d] of after) {
      if (before.has(udid)) continue;
      if (!ours.has(udid) && new RegExp(`^uix-.*-${process.pid}-`).test(d.name)) failures.push(`unexpected new simulator ${d.name} ${udid} with this run's id`);
      else if (!ours.has(udid)) t.diagnostic(`new simulator from another process: ${d.name} ${udid}`);
    }
    t.diagnostic(`recorded udids: ${[...used].map((u) => `${u}[${[...bySub[u]].join(',')}]${ours.has(u) ? ' (ours)' : ''}`).join('; ') || 'none'}`);
    t.diagnostic(`created udids: ${[...ours].join(', ') || 'none'}`);
    if (!primaryError && failures.length === 0) {
      fs.rmSync(appDir, { recursive: true, force: true }); // drops node_modules; the shots dir stays
    }
    console.log(`screenshots: ${out}${primaryError || failures.length ? ` (work dir kept: ${work})` : ''}`);
    if (failures.length && !primaryError) throw new Error(`ownership guard failed:\n${failures.join('\n')}`);
    if (failures.length) console.error(`ownership guard failures (in addition to the test error):\n${failures.join('\n')}`);
  }
});
