import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, realpathSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EnvError, pickDevices, createSession, openUrl, screenshot, setAppearance, setContentSize, setStatusBar, settle, defaultRun, killLiveChildren, liveChildCount, trackChild, sparesKill,
} from '../skills/uix-skill/scripts/lib/sim.mjs';
import { readHierarchy, findingsFromHierarchy, MOBILE_RULE_IDS } from '../skills/uix-skill/scripts/lib/hierarchy.mjs';
import {
  parseArgs, loadRoutes, filterRoutes, deepLink, preflight, runMobileCheck, makeSignalCleanup, androidEntry, installSignalHandlers, removeStalePartials, main, FIRST_FLOW, ROOT_WAIT, ROOT_WAIT_LONG, OPENURL_RETRY_MS, openUrlRetry,
} from '../skills/uix-skill/scripts/check-mobile.mjs';
import { RULE_IDS } from '../skills/uix-skill/scripts/rules.mjs';

const fx = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mobile');
const load = (n) => JSON.parse(readFileSync(join(fx, n), 'utf8'));
const devicetypes = load('devicetypes.json');
const runtimes = load('runtimes.json');

const uuid = (n) => `0000000${n}-0000-4000-8000-000000000000`;
const U1 = uuid(1);
const U2 = uuid(2);
const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });

// Recording fake: respond(cmd, args) may return a result or undefined (-> ok).
function fakeRun(respond = () => undefined) {
  // Android: the emulator console answers `emu avd name` with the AVD the serial was started for.
  const names = [];
  const byName = new Map();
  const avdReply = (cmd, args) => {
    if (cmd === 'sh' && args[0] === '-c') { const m = / create avd -n '([^']+)'/.exec(args[1]); if (m) names.push(m[1]); }
    if (args[2] === 'wait-for-device' && !byName.has(args[1])) byName.set(args[1], names[byName.size]);
    return args[2] === 'emu' && args[3] === 'avd' && args[4] === 'name' && byName.has(args[1]) ? `${byName.get(args[1])}\nOK\n` : null;
  };
  const calls = [];
  const run = async (cmd, args, opts) => {
    calls.push([cmd, args]);
    const named = avdReply(cmd, args);
    return respond(cmd, args, opts) ?? (named === null ? ok() : ok(named));
  };
  run.calls = calls;
  return run;
}
const sub = (calls, verb) => calls.filter(([, a]) => a[0] === 'simctl' && a[1] === verb);

test('pickDevices: default pair on the newest iOS runtime', () => {
  const picks = pickDevices(devicetypes, runtimes);
  assert.equal(picks.length, 2);
  assert.match(picks[0].name, /iPhone SE|iPhone 17e/);
  assert.equal(picks[1].name, 'iPhone 17 Pro Max');
  assert.equal(picks[0].runtimeId, 'com.apple.CoreSimulator.SimRuntime.iOS-27-0');
  assert.match(picks[1].typeId, /iPhone-17-Pro-Max$/);
});

test('pickDevices: unknown device and missing runtime throw EnvError', () => {
  assert.throws(() => pickDevices(devicetypes, runtimes, ['iPhone 99 Zeta']), (e) => e instanceof EnvError && /iPhone 99 Zeta/.test(e.message));
  assert.throws(() => pickDevices(devicetypes, { runtimes: [] }), (e) => e instanceof EnvError && /runtime/.test(e.message));
});

test('createSession: create, boot, bootstatus order; names end with runId', async () => {
  let n = 0;
  const run = fakeRun((c, a) => (a[1] === 'create' ? ok(uuid(++n) + '\n') : undefined));
  const devices = pickDevices(devicetypes, runtimes);
  const s = await createSession(run, { devices, runId: 'r1' });
  assert.deepEqual(s.sims.map((x) => x.udid), [U1, U2]);
  assert.ok(s.sims.every((x) => x.name.endsWith('-r1') && x.name.startsWith('uix-')));
  const verbs = run.calls.map(([, a]) => a[1] + (a[1] === 'bootstatus' ? '' : ''));
  assert.deepEqual(verbs, ['create', 'boot', 'bootstatus', 'create', 'boot', 'bootstatus']);
  assert.deepEqual(run.calls[2][1], ['simctl', 'bootstatus', U1, '-b']);
});

test('createSession: cleanup removes exactly the created UDIDs, keep is a no-op', async () => {
  let n = 0;
  const run = fakeRun((c, a) => {
    if (a[1] === 'create') return ok(uuid(++n) + '\n');
    if (a[1] === 'list') return ok(JSON.stringify({ devices: { x: [{ name: 'uix-iPhone-other', udid: 'OTHER' }] } }));
    return undefined;
  });
  const s = await createSession(run, { devices: pickDevices(devicetypes, runtimes), runId: 'r1' });
  run.calls.length = 0;
  await s.cleanup(true);
  assert.equal(run.calls.length, 0);
  await s.cleanup();
  assert.deepEqual(run.calls.map(([, a]) => a.slice(1)), [
    ['shutdown', U1], ['delete', U1], ['shutdown', U2], ['delete', U2],
  ]);
  assert.ok(!JSON.stringify(run.calls).includes('OTHER'));
});

test('createSession: cleanup tolerates already-gone devices', async () => {
  let n = 0;
  const run = fakeRun((c, a) => {
    if (a[1] === 'create') return ok(uuid(++n));
    if (a[1] === 'shutdown') return { code: 164, stdout: '', stderr: 'Unable to shutdown device in current state: Shutdown' };
    if (a[1] === 'delete') return { code: 148, stdout: '', stderr: 'Invalid device' };
    return undefined;
  });
  const s = await createSession(run, { devices: pickDevices(devicetypes, runtimes), runId: 'r1' });
  await assert.doesNotReject(s.cleanup());
});

test('createSession: failure on second create cleans up the first and rethrows', async () => {
  let n = 0;
  const run = fakeRun((c, a) => {
    if (a[1] === 'create') return ++n === 2 ? { code: 1, stdout: '', stderr: 'boom' } : ok(U1);
    return undefined;
  });
  await assert.rejects(createSession(run, { devices: pickDevices(devicetypes, runtimes), runId: 'r1' }), /boom|create/);
  const gone = run.calls.filter(([, a]) => a[1] === 'delete').map(([, a]) => a[2]);
  assert.deepEqual(gone, [U1]);
});

test('createSession: boot failure cleans up the device just created', async () => {
  const run = fakeRun((c, a) => (a[1] === 'create' ? ok(U1) : a[1] === 'boot' ? { code: 1, stdout: '', stderr: 'no boot' } : undefined));
  await assert.rejects(createSession(run, { devices: pickDevices(devicetypes, runtimes), runId: 'r1' }));
  assert.deepEqual(run.calls.filter(([, a]) => a[1] === 'delete').map(([, a]) => a[2]), [U1]);
});

test('no helper passes "booted"', async () => {
  const run = fakeRun();
  await openUrl(run, 'U', 'exp://x');
  await screenshot(run, 'U', '/tmp/x.png');
  await setAppearance(run, 'U', 'dark');
  await setContentSize(run, 'U', 'accessibility-extra-large');
  await setStatusBar(run, 'U');
  assert.equal(run.calls.length, 5);
  for (const [, a] of run.calls) {
    assert.ok(!a.includes('booted'));
    assert.ok(a.includes('U'));
  }
  const s = await createSession(fakeRun((c, a) => (a[1] === 'create' ? ok(U1) : undefined)), { devices: pickDevices(devicetypes, runtimes), runId: 'r' });
  await s.cleanup();
});

function clock() {
  const t = { ms: 0 };
  t.sleep = async (ms) => { t.ms += ms; };
  t.now = () => t.ms;
  return t;
}

test('settle: a failing screenshot throws EnvError naming the udid', async () => {
  const t = clock();
  const run = fakeRun(() => ({ code: 1, stdout: '', stderr: 'nope' }));
  await assert.rejects(settle(run, 'DEV-9', { file: 'a.png', sleep: t.sleep, read: async () => Buffer.from('stale') }), (e) => e instanceof EnvError && /DEV-9/.test(e.message));
});

test('settle: identical screenshots settle after minMs', async () => {
  const t = clock();
  const run = fakeRun();
  const r = await settle(run, 'U', { file: 'a.png', sleep: t.sleep, read: async () => Buffer.from('same') });
  assert.equal(r.settled, true);
  assert.ok(t.ms >= 1500);
  assert.ok(sub(run.calls, 'io').length >= 2);
});

test('settle: ever-changing bytes stop at capMs unsettled', async () => {
  const t = clock();
  let i = 0;
  const r = await settle(fakeRun(), 'U', { file: 'a.png', sleep: t.sleep, read: async () => Buffer.from(String(i++)) });
  assert.equal(r.settled, false);
  assert.ok(t.ms >= 5000 && t.ms <= 5000 + 500);
});

test('readHierarchy: bad output gives tree null and an unverified note', async () => {
  for (const res of [ok(''), ok('not json {'), { code: 1, stdout: '', stderr: 'Device with id X is not connected' }]) {
    const t = clock();
    const r = await readHierarchy(fakeRun(() => res), 'U', { sleep: t.sleep, now: t.now, timeoutMs: 9000, intervalMs: 3000 });
    assert.equal(r.tree, null);
    assert.match(r.note, /^unverified:/);
  }
});

test('readHierarchy: polls with --device and retries until JSON', async () => {
  const t = clock();
  let n = 0;
  const run = fakeRun(() => (++n < 3 ? ok('') : ok(JSON.stringify(load('hierarchy-empty.json')))));
  const r = await readHierarchy(run, 'U', { sleep: t.sleep, now: t.now });
  assert.ok(r.tree);
  assert.equal(n, 3);
  assert.deepEqual(run.calls[0], ['maestro', ['--device', 'U', 'hierarchy']]);
  assert.equal(t.ms, 6000);
});

const pairs = (f) => f.map((x) => [x.rule, x.severity]);

test('findingsFromHierarchy: exact findings on the real sample', () => {
  const f = findingsFromHierarchy(load('hierarchy-sample.json'), { route: '/' });
  assert.deepEqual(pairs(f), [
    ['small-target', 'warn'], ['missing-label', 'warn'],
    ['small-target', 'warn'],
    ['small-target', 'warn'],
    ['small-target', 'warn'], ['missing-label', 'warn'],
    ['missing-label', 'error'],
  ]);
  const ml = f.filter((x) => x.rule === 'missing-label');
  assert.deepEqual(ml.map((x) => /lower confidence: may be decorative\)$/.test(x.message)), [true, true, false]);
  assert.ok(f.every((x) => x.route === '/'));
  assert.deepEqual(findingsFromHierarchy(load('hierarchy-empty.json'), { route: '/' }), []);
});

test('findingsFromHierarchy: LogBox red box yields only app-error', () => {
  const f = findingsFromHierarchy(load('hierarchy-redbox.json'), { route: '/boom' });
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'app-error');
  assert.equal(f[0].severity, 'error');
  assert.equal(f[0].route, '/boom');
  assert.match(f[0].message, /Render Error/);
  assert.match(f[0].message, /uix spike boom/);
});

test('findingsFromHierarchy: the word Error alone is not an app-error', () => {
  const node = (t, b = '[0,0][100,100]', kids = []) => ({ attributes: { accessibilityText: t, bounds: b }, children: kids });
  const tree = node('', '[0,0][0,0]', [node('app', '[0,0][400,800]', [node('Error', '[0,0][200,100]')])]);
  assert.deepEqual(findingsFromHierarchy(tree, { route: '/' }), []);
});

const leafTree = (...leaves) => ({ attributes: { bounds: '[0,0][0,0]' }, children: [{ attributes: { accessibilityText: 'app', bounds: '[0,0][402,874]' }, children: leaves.map(([bounds, label = '', extra = {}]) => ({ attributes: { accessibilityText: label, bounds, ...extra }, children: [] })) }] });
const hf = (...leaves) => findingsFromHierarchy(leafTree(...leaves), { route: '/r' });

test('findingsFromHierarchy: slivers give no finding', () => {
  assert.deepEqual(hf(['[10,10][13,121]']), []); // 3x111 scroll indicator
  assert.deepEqual(hf(['[10,10][376,13]']), []); // 366x3 hairline
  assert.deepEqual(hf(['[10,10][17,40]']), []); // 7 wide
});

test('findingsFromHierarchy: a 30x30 clickable unlabelled node is still flagged', () => {
  assert.deepEqual(pairs(hf(['[10,10][40,40]', '', { clickable: 'true' }])), [['small-target', 'warn'], ['missing-label', 'warn']]);
  assert.deepEqual(pairs(hf(['[10,10][40,40]'])), [['small-target', 'warn'], ['missing-label', 'warn']]);
});

test('findingsFromHierarchy: small-target message names the label, else unlabelled', () => {
  assert.match(hf(['[10,10][40,40]', 'Đóng', { clickable: 'true' }])[0].message, /\(Đóng\)\.$/);
  assert.match(hf(['[10,10][40,40]'])[0].message, /\(unlabelled\)\.$/);
});

test('findingsFromHierarchy: a plain text line is not a small-target', () => {
  assert.deepEqual(hf(['[10,10][243,30]', 'Some line of text']), []); // 233x20
  assert.equal(hf(['[10,10][243,30]', 'Link', { clickable: 'true' }])[0].rule, 'small-target');
});

test('findingsFromHierarchy: the same bounds twice give one finding per rule', () => {
  const f = hf(['[10,10][40,40]'], ['[10,10][40,40]']);
  assert.deepEqual(pairs(f), [['small-target', 'warn'], ['missing-label', 'warn']]);
});

test('MOBILE_RULE_IDS are registered in RULE_IDS', () => {
  assert.deepEqual(MOBILE_RULE_IDS, ['missing-label', 'app-error', 'flow-failed', 'route-not-navigated']);
  for (const id of MOBILE_RULE_IDS) assert.ok(RULE_IDS.includes(id));
});

const tree1 = () => JSON.parse(JSON.stringify(load('hierarchy-empty.json')));

test('readHierarchy: until matches, times out with last tree, and stops at a red box', async () => {
  const sample = JSON.stringify(load('hierarchy-sample.json'));
  const red = JSON.stringify(load('hierarchy-redbox.json'));
  let t = clock();
  let n = 0;
  let r = await readHierarchy(fakeRun(() => ok(++n < 3 ? JSON.stringify(tree1()) : sample)), 'U', { sleep: t.sleep, now: t.now, until: (tr) => JSON.stringify(tr).includes('Close dialog') });
  assert.equal(n, 3);
  assert.ok(r.tree && !r.note);
  t = clock();
  r = await readHierarchy(fakeRun(() => ok(JSON.stringify(tree1()))), 'U', { sleep: t.sleep, now: t.now, timeoutMs: 9000, until: () => false });
  assert.ok(r.tree);
  assert.match(r.note, /^unverified:/);
  t = clock();
  n = 0;
  r = await readHierarchy(fakeRun(() => ok(++n < 2 ? JSON.stringify(tree1()) : red)), 'U', { sleep: t.sleep, now: t.now, until: () => false });
  assert.equal(n, 2);
  assert.equal(findingsFromHierarchy(r.tree, { route: '/' })[0].rule, 'app-error');
  assert.equal(r.note, undefined);
});

test('readHierarchy: budget uses one clock (timeout 9000, gap 3000 -> 4 tries)', async () => {
  const t = clock();
  const run = fakeRun(() => ok(''));
  await readHierarchy(run, 'U', { sleep: t.sleep, now: t.now, timeoutMs: 9000, intervalMs: 3000 });
  assert.equal(run.calls.length, 4);
});

test('readHierarchy: not connected fails fast; bad shape is unverified', async () => {
  const run = fakeRun(() => ({ code: 1, stdout: '', stderr: 'Device with id U is not connected' }));
  const r = await readHierarchy(run, 'U', { sleep: clock().sleep, now: clock().now });
  assert.equal(run.calls.length, 1);
  assert.deepEqual(r, { tree: null, note: 'unverified: maestro: device U not connected' });
  const t = clock();
  const r2 = await readHierarchy(fakeRun(() => ok('42')), 'U', { sleep: t.sleep, now: t.now, timeoutMs: 6000 });
  assert.equal(r2.tree, null);
  assert.match(r2.note, /unexpected hierarchy shape/);
});

test('helpers reject an empty or booted udid', async () => {
  const run = fakeRun();
  for (const bad of ['', 'booted', undefined]) {
    assert.throws(() => openUrl(run, bad, 'x'), /udid/);
    assert.throws(() => screenshot(run, bad, 'f'), /udid/);
    assert.throws(() => setAppearance(run, bad, 'dark'), /udid/);
    assert.throws(() => setContentSize(run, bad, 'x'), /udid/);
    assert.throws(() => setStatusBar(run, bad), /udid/);
    await assert.rejects(readHierarchy(run, bad), /udid/);
  }
  assert.equal(run.calls.length, 0);
});

test('createSession: non-UUID create output cleans up the rest and throws', async () => {
  let n = 0;
  const run = fakeRun((c, a) => (a[1] === 'create' ? ok(++n === 1 ? U1 : 'garbage text') : undefined));
  await assert.rejects(createSession(run, { devices: pickDevices(devicetypes, runtimes), runId: 'r' }), EnvError);
  assert.deepEqual(run.calls.filter(([, a]) => a[1] === 'delete').map(([, a]) => a[2]), [U1]);
});

test('createSession: cleanup survives a rejecting run', async () => {
  let n = 0;
  let bad = false;
  const run = fakeRun((c, a) => {
    if (bad) throw new Error('spawn died');
    return a[1] === 'create' ? ok(uuid(++n)) : undefined;
  });
  const s = await createSession(run, { devices: pickDevices(devicetypes, runtimes), runId: 'r' });
  bad = true;
  await assert.doesNotReject(s.cleanup());
  assert.equal(run.calls.filter(([, a]) => a[1] === 'delete').length, 2);
});

test('pickDevices: falls back to 17e when no runtime supports SE', () => {
  const rts = JSON.parse(JSON.stringify(runtimes));
  for (const r of rts.runtimes) r.supportedDeviceTypes = (r.supportedDeviceTypes ?? []).filter((d) => !/iPhone-SE-3rd/.test(d.identifier));
  assert.equal(pickDevices(devicetypes, rts)[0].name, 'iPhone 17e');
});

// ---------- check-mobile.mjs (Task 11) ----------
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'uix-skill', 'scripts', 'check-mobile.mjs');
const scratch = () => mkdtempSync(join(tmpdir(), 'uix-cm-'));
const writeTmp = (name, content) => {
  const f = join(scratch(), name);
  writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content));
  return f;
};

test('parseArgs: defaults', () => {
  assert.deepEqual(parseArgs(['--app', 'exp://127.0.0.1:8081']), {
    app: 'exp://127.0.0.1:8081', routes: '.uix/mobile-routes.json', devices: null, modes: ['light', 'dark', 'xxxl'],
    out: '.uix/mobile-shots', video: false, flow: null, keep: false, only: null,
  });
});

test('parseArgs: every flag; devices split on comma', () => {
  const a = parseArgs(['--app', 'exp://h:1', '--routes', 'r.json', '--devices', 'iPhone SE (3rd generation),iPhone 17 Pro Max',
    '--modes', 'light,xxxl', '--out', 'o', '--video', '--flow', 'f.yaml', '--keep']);
  assert.deepEqual(a, {
    app: 'exp://h:1', routes: 'r.json', devices: ['iPhone SE (3rd generation)', 'iPhone 17 Pro Max'], modes: ['light', 'xxxl'],
    out: 'o', video: true, flow: 'f.yaml', keep: true, only: null,
  });
});

test('parseArgs: errors', () => {
  assert.match(parseArgs([]).error, /--app/);
  assert.match(parseArgs(['--app', 'exp://h:1', '--modes', 'light,sepia']).error, /sepia/);
  assert.match(parseArgs(['--app', 'exp://h:1', '--bogus']).error, /--bogus/);
  assert.match(parseArgs(['--app']).error, /--app/);
});

test('loadRoutes: accepts routes-ok.json', async () => {
  const r = await loadRoutes(join(fx, 'routes-ok.json'));
  assert.deepEqual(r.map((x) => x.name), ['home', 'shop-filters']);
});

test('loadRoutes: rejects every bad shape with EnvError', async () => {
  const cases = [
    [join(fx, 'routes-bad.json'), /path/],
    [join(fx, 'nope.json'), /read|nope/],
    [writeTmp('a.json', '{"name":"x"}'), /array/],
    [writeTmp('b.json', '[]'), /empty/],
    [writeTmp('c.json', '[{"path":"/"}]'), /name/],
    [writeTmp('d.json', '[{"name":"a","path":"/"},{"name":"a","path":"/x"}]'), /duplicate/i],
    [writeTmp('e.json', '[{"name":"a","path":"shop"}]'), /start with/],
    [writeTmp('f.json', 'not json'), /JSON|json/],
  ];
  for (const [file, re] of cases) await assert.rejects(loadRoutes(file), (e) => e instanceof EnvError && re.test(e.message), file);
});

test('deepLink: joins with /-- and tolerates a trailing slash', () => {
  assert.equal(deepLink('exp://127.0.0.1:8081', '/shop?sheet=filters'), 'exp://127.0.0.1:8081/--/shop?sheet=filters');
  assert.equal(deepLink('exp://127.0.0.1:8081/', '/'), 'exp://127.0.0.1:8081/--/');
});

// Fake Metro: /status header + manifest.
const CWD = realpathSync(scratch());
function fakeFetch({ root = CWD, slug = 'demo', runtimeVersion = 'exposdk:58.0.0', dead = false, html = false, statusCode = 200, server = null, apiBad = false, iosClientUrl = 'https://x.test/Expo-Go-58.tar.gz', androidClientUrl = 'https://x.test/Expo-Go-58.apk' } = {}) {
  const calls = [];
  const f = async (url, opts = {}) => {
    calls.push([url, opts]);
    if (dead && !/api\.expo\.dev|x\.test/.test(url)) throw new Error('ECONNREFUSED');
    const res = (body, headers = {}, status = 200) => ({
      ok: status < 200 || status > 299 ? false : true, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null },
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      json: async () => body, arrayBuffer: async () => new TextEncoder().encode('tgz').buffer,
    });
    if (url.endsWith('/status')) return html ? res('<html><body>Welcome to nginx</body></html>', server ? { server } : {}, statusCode) : res('packager-status:running', { 'x-react-native-project-root': root });
    if (url.includes('api.expo.dev') && apiBad) return res('<html>oops', {}, 200);
    if (url.includes('api.expo.dev')) return res({ data: { sdkVersions: { '58.0.0': { iosClientUrl, androidClientUrl } } } });
    if (url.startsWith('https://x.test')) return res('tgz');
    return html ? res('<html>') : res({ runtimeVersion, extra: { expoClient: { slug } } });
  };
  f.calls = calls;
  return f;
}
const BIGTEXT = 'accessibility-extra-extra-extra-large';
const APP = 'exp://127.0.0.1:8081';
const appJson = { expo: { slug: 'demo' } };
const okRun = (extra = () => undefined) => fakeRun((c, a, o) => {
  const r = extra(c, a, o);
  if (r) return r;
  if (c === 'xcode-select') return ok('/Applications/Xcode.app/Contents/Developer\n');
  if (a[1] === 'list' && a.includes('runtimes')) return ok(JSON.stringify(runtimes));
  if (a[1] === 'list' && a.includes('devicetypes')) return ok(JSON.stringify(devicetypes));
  if (c === 'maestro' && a[0] === '--version') return ok('2.6.1\n');
  return undefined;
});

test('preflight: all good returns notes []', async () => {
  const r = await preflight({ run: okRun(), app: APP, appJson, fetchImpl: fakeFetch(), cwd: CWD });
  assert.deepEqual(r.notes, []);
});

test('preflight: missing Xcode, runtime, Metro each throw EnvError naming it', async () => {
  await assert.rejects(preflight({ run: okRun((c) => (c === 'xcode-select' ? { code: 2, stdout: '', stderr: 'no' } : undefined)), app: APP, appJson, fetchImpl: fakeFetch(), cwd: CWD }),
    (e) => e instanceof EnvError && /Xcode/.test(e.message));
  await assert.rejects(preflight({ run: okRun((c, a) => (a.includes('runtimes') ? ok('{"runtimes":[]}') : undefined)), app: APP, appJson, fetchImpl: fakeFetch(), cwd: CWD }),
    (e) => e instanceof EnvError && /runtime/.test(e.message));
  await assert.rejects(preflight({ run: okRun(), app: APP, appJson, fetchImpl: fakeFetch({ dead: true }), cwd: CWD }),
    (e) => e instanceof EnvError && /Metro not reachable at http:\/\/127\.0\.0\.1:8081/.test(e.message));
});

test('preflight: wrong project root, wrong slug, non-Metro answer', async () => {
  await assert.rejects(preflight({ run: okRun(), app: APP, appJson, fetchImpl: fakeFetch({ root: '/other/proj' }), cwd: CWD }),
    (e) => e instanceof EnvError && e.message.includes('/other/proj') && e.message.includes(CWD));
  await assert.rejects(preflight({ run: okRun(), app: APP, appJson, fetchImpl: fakeFetch({ slug: 'someone-else' }), cwd: CWD }),
    (e) => e instanceof EnvError && e.message.includes('someone-else') && e.message.includes('demo'));
  await assert.rejects(preflight({ run: okRun(), app: APP, appJson, fetchImpl: fakeFetch({ html: true, server: 'nginx/1.2' }), cwd: CWD }),
    (e) => e instanceof EnvError && /HTTP 200/.test(e.message) && /nginx/.test(e.message) && /Server: nginx\/1\.2/.test(e.message));
  await assert.rejects(preflight({ run: okRun(), app: APP, appJson, fetchImpl: fakeFetch({ html: true, statusCode: 404 }), cwd: CWD }),
    (e) => e instanceof EnvError && /HTTP 404/.test(e.message));
});

test('preflight: Metro manifest request uses expo-platform ios', async () => {
  const f = fakeFetch();
  await preflight({ run: okRun(), app: APP, appJson, fetchImpl: f, cwd: CWD });
  const m = f.calls.find(([u]) => u === 'http://127.0.0.1:8081/');
  assert.equal(m[1].headers['expo-platform'], 'ios');
  assert.match(m[1].headers.Accept, /application\/expo\+json/);
});

test('preflight: maestro absent adds the note', async () => {
  const run = okRun((c) => (c === 'maestro' ? { code: 127, stdout: '', stderr: 'ENOENT' } : undefined));
  const r = await preflight({ run, app: APP, appJson, fetchImpl: fakeFetch(), cwd: CWD });
  assert.deepEqual(r.notes, ['maestro missing: hierarchy and flow checks skipped, not a success run']);
});

// ---- runMobileCheck ----
const sampleTree = load('hierarchy-sample.json');
function mkEnv(extra = () => undefined, fetchOpts = {}) {
  let n = 0;
  const run = okRun((c, a, o) => {
    const r = extra(c, a, o);
    if (r) return r;
    if (a[1] === 'create') return ok(uuid(++n) + '\n');
    if (c === 'maestro' && a.includes('hierarchy')) return ok(JSON.stringify(sampleTree));
    return undefined;
  });
  const out = scratch();
  const cache = scratch();
  const deps = { run, sleep: async () => {}, fetchImpl: fakeFetch(fetchOpts), read: async (f) => Buffer.from(String(f)), log: () => {}, cacheRoot: cache, tmpRoot: scratch(), cwd: CWD };
  const opts = (o = {}) => ({
    app: APP, routes: [{ name: 'home', path: '/' }, { name: 'bag', path: '/bag' }], devices: null, modes: ['light', 'dark', 'xxxl'],
    out, video: false, flow: null, keep: false, appJson, pkgJson: { dependencies: { expo: '~58.0.20' } }, ...o,
  });
  return { run, out, deps, opts };
}
const verbsOf = (run) => run.calls.map(([c, a]) => (c === 'xcrun' ? `${a[1]}${a[1] === 'ui' ? `:${a[3]}` : ''}` : c));

test('runMobileCheck: 18 openurls, shot names, terminate before each root open, size reset after xxxl, exact keys', async () => {
  const { run, out, deps, opts } = mkEnv();
  const r = await runMobileCheck(opts(), deps);
  assert.deepEqual(Object.keys(r).sort(), ['findings', 'notes', 'shots']);
  assert.equal(sub(run.calls, 'openurl').length, 18 + 2); // home: root only; bag: root + route; + one first-open per device
  assert.equal(r.shots.length, 12);
  assert.ok(r.shots.includes(join(out, 'iPhone-SE-3rd-generation-home-light.png')), r.shots.join('\n'));
  assert.ok(r.shots.includes(join(out, 'iPhone-17-Pro-Max-bag-xxxl.png')));
  // terminate immediately precedes every root openurl
  // (devices run at once, so check each device's own call sequence)
  for (const u of [U1, U2]) {
    const mine = run.calls.filter(([, a]) => a[2] === u);
    mine.forEach(([, a], i) => {
      if (a[1] === 'openurl' && a[3] === `${APP}/--/`) {
        assert.equal(mine[i - 1][1][1], 'terminate');
        assert.deepEqual(mine[i - 1][1].slice(2), [a[2], 'host.exp.Exponent']);
      }
    });
  }
  // content size: set to xxxl then reset after the xxxl shot of every route
  const cs = run.calls.filter(([, a]) => a[1] === 'ui' && a[3] === 'content_size').map(([, a]) => a[4]);
  assert.equal(cs.filter((x) => x === 'accessibility-extra-extra-extra-large').length, 4);
  assert.equal(cs.filter((x) => x === 'large').length, 4);
  const cs0 = run.calls.filter(([, a]) => a[2] === U1 && a[1] === 'ui' && a[3] === 'content_size').map(([, a]) => a[4]);
  assert.equal(cs0[1], 'large');
  // deep link carries the route path
  assert.ok(sub(run.calls, 'openurl').some(([, a]) => a[3] === `${APP}/--/bag`));
  // cleanup happened
  assert.equal(sub(run.calls, 'delete').length, 2);
});

test('runMobileCheck: installs Expo Go from the cache dir per device, status bar set', async () => {
  const { run, deps, opts } = mkEnv();
  await runMobileCheck(opts({ routes: [{ name: 'home', path: '/' }], modes: ['light'] }), deps);
  const inst = sub(run.calls, 'install');
  assert.equal(inst.length, 2);
  assert.match(inst[0][1][3], /uix-expo-go-58$/);
  assert.equal(sub(run.calls, 'status_bar').length, 2);
  assert.ok(run.calls.some(([c, a]) => c === 'tar' && a[0] === '-xzf'));
});

test('runMobileCheck: Expo Go is downloaded once when cached', async () => {
  const { deps, opts } = mkEnv();
  await runMobileCheck(opts({ routes: [{ name: 'home', path: '/' }], modes: ['light'] }), deps);
  const dl = deps.fetchImpl.calls.filter(([u]) => u.startsWith('https://x.test')).length;
  assert.equal(dl, 1);
});

test('runMobileCheck: first-open Maestro flow taps Open/Continue/xmark optionally on each device', async () => {
  const seen = [];
  const { run, deps, opts } = mkEnv((c, a) => {
    if (c === 'maestro' && a[2] === 'test') seen.push(a);
  });
  await runMobileCheck(opts({ routes: [{ name: 'home', path: '/' }], modes: ['light'] }), deps);
  assert.equal(seen.length, 2);
  assert.equal(seen[0][0], '--device');
  assert.match(seen[0][1], /^0000000[12]-/);
  void run;
});

test('first-open flow shape: no long Continue wait; optional taps for Open, Continue, xmark', () => {
  assert.ok(!FIRST_FLOW.includes('extendedWaitUntil'));
  assert.ok(!FIRST_FLOW.includes('60000'));
  for (const t of ['text: "Open"', 'text: "Continue"', 'id: "xmark"']) assert.ok(FIRST_FLOW.includes(t), t);
  assert.equal(FIRST_FLOW.split('optional: true').length - 1, 3);
});

const ONBOARD_KEYS = ['EXDevMenuIsOnboardingFinished', 'ExpoGoOnboardingFinished'];
const isWrite = (c, a) => c === 'xcrun' && a[1] === 'spawn' && a[3] === 'defaults';

test('runMobileCheck: both Expo Go onboarding defaults are written after install and before the first openurl, per device', async () => {
  const { run, deps, opts } = mkEnv();
  await runMobileCheck(opts({ routes: [{ name: 'home', path: '/' }], modes: ['light'] }), deps);
  for (const u of [U1, U2]) {
    const mine = run.calls.filter(([c, a]) => c === 'xcrun' && a[2] === u);
    const ix = (pred) => mine.findIndex(([c, a]) => pred(c, a));
    const install = ix((c, a) => a[1] === 'install');
    const open = ix((c, a) => a[1] === 'openurl');
    for (const k of ONBOARD_KEYS) {
      const w = ix((c, a) => isWrite(c, a) && a.join(' ') === `simctl spawn ${u} defaults write host.exp.Exponent ${k} -bool YES`);
      assert.ok(w > install && w < open, `${k} on ${u}: install ${install}, write ${w}, open ${open}`);
    }
  }
});

test('runMobileCheck: a failing onboarding write gives a one-line unverified note and the run goes on', async () => {
  const { deps, opts } = mkEnv((c, a) => (isWrite(c, a) && a[2] === U1 ? { code: 1, stdout: '', stderr: 'no domain\nsecond line' } : undefined));
  const r = await runMobileCheck(opts({ routes: [{ name: 'home', path: '/' }], modes: ['light'] }), deps);
  const n = r.notes.filter((x) => x.startsWith('unverified: could not pre-dismiss the Expo Go onboarding on '));
  assert.ok(n.length >= 1, r.notes.join('\n'));
  assert.ok(n.every((x) => !x.includes('\n')));
  assert.match(n[0], /: .*second line$/);
  assert.equal(r.shots.length, 2);
});

test('runMobileCheck: openurl failure on bag rejects with EnvError naming bag; session cleaned', async () => {
  const { run, deps, opts } = mkEnv((c, a) => (a[1] === 'openurl' && a[3].endsWith('/--/bag') ? { code: 1, stdout: '', stderr: 'boom' } : undefined));
  await assert.rejects(runMobileCheck(opts(), deps), (e) => e instanceof EnvError && /bag/.test(e.message));
  assert.equal(sub(run.calls, 'delete').length, 2);
});

test('runMobileCheck: keep deletes nothing', async () => {
  const { run, deps, opts } = mkEnv();
  await runMobileCheck(opts({ keep: true, modes: ['light'], routes: [{ name: 'home', path: '/' }] }), deps);
  assert.equal(sub(run.calls, 'delete').length, 0);
  assert.equal(sub(run.calls, 'shutdown').length, 0);
});

test('runMobileCheck: hierarchy findings carry route, from small device in light mode only', async () => {
  const { run, deps, opts } = mkEnv();
  const r = await runMobileCheck(opts(), deps);
  const expected = findingsFromHierarchy(sampleTree, { route: 'home' });
  assert.ok(expected.length > 0);
  assert.deepEqual(r.findings.filter((f) => f.route === 'home'), expected);
  assert.ok(r.findings.some((f) => f.route === 'bag'));
  const h = run.calls.filter(([c, a]) => c === 'maestro' && a.includes('hierarchy'));
  assert.equal(h.length, 2);
  assert.ok(h.every(([, a]) => a[1] === uuid(1)));
});

test('runMobileCheck: hierarchy budget 90 s for first route, 45 s after', async () => {
  let calls = 0;
  const { deps, opts } = mkEnv((c, a) => {
    if (c === 'maestro' && a.includes('hierarchy')) { calls++; return ok(''); }
  });
  // empty output -> readHierarchy retries until its budget; count tries via fake clock
  let t = 0;
  deps.sleep = async (ms) => { t += ms; };
  deps.now = () => t;
  const r = await runMobileCheck(opts({ modes: ['light'], devices: ['iPhone SE (3rd generation)'] }), deps); // one device: the fake clock is shared
  assert.equal(calls, 31 + 16); // 90 s budget then 45 s at a 3 s gap
  assert.equal(r.notes.filter((n) => /^unverified:/.test(n)).length, 2);
  assert.match(r.notes.find((n) => /^unverified:/.test(n)), /90s/);
  assert.match(r.notes.filter((n) => /^unverified:/.test(n))[1], /45s/);
});

test('runMobileCheck: maestro missing skips hierarchy and adds the note', async () => {
  const { run, deps, opts } = mkEnv((c) => (c === 'maestro' ? { code: 127, stdout: '', stderr: 'ENOENT' } : undefined));
  const r = await runMobileCheck(opts({ modes: ['light'], flow: 'f.yaml' }), deps);
  assert.ok(r.notes.includes('maestro missing: hierarchy and flow checks skipped, not a success run'));
  assert.equal(r.findings.length, 0);
  assert.ok(!run.calls.some(([c, a]) => c === 'maestro' && (a.includes('hierarchy') || a.includes('test'))));
});

test('runMobileCheck: failed --flow yields exactly one error finding', async () => {
  const flow = writeTmp('flow.yaml', 'appId: host.exp.Exponent\n---\n- tapOn: Buy\n');
  const { deps, opts } = mkEnv((c, a) => (c === 'maestro' && a[2] === 'test' && a[3] === flow ? { code: 1, stdout: '', stderr: 'Element not found: Text matching regex: Buy' } : undefined));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), deps);
  const f = r.findings.filter((x) => x.rule === 'flow-failed');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'error');
  assert.match(f[0].message, /Buy/);
});

test('runMobileCheck: SDK from package.json when manifest has no runtimeVersion', async () => {
  const { deps, opts } = mkEnv(undefined, { runtimeVersion: undefined });
  await runMobileCheck(opts({ modes: ['light'], routes: [{ name: 'home', path: '/' }] }), deps);
  assert.ok(deps.fetchImpl.calls.some(([u]) => u.includes('api.expo.dev')));
});

// ---- CLI (never reaches a simulator: failures happen in parseArgs / loadRoutes / preflight) ----
const cli = (args, cwd) => spawnSync('node', [CLI, ...args], { encoding: 'utf8', cwd });
test('CLI: no args exits 2, stderr only', () => {
  const r = cli([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--app/);
  assert.equal(r.stdout, '');
});
test('CLI: bad routes file exits 2 before any simulator', () => {
  const r = cli(['--app', 'exp://127.0.0.1:1', '--routes', join(fx, 'routes-bad.json')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /path/);
  assert.equal(r.stdout, '');
});
test('CLI: missing Metro exits 2', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'app.json'), JSON.stringify(appJson));
  const r = cli(['--app', 'exp://127.0.0.1:1', '--routes', join(fx, 'routes-ok.json'), '--out', join(dir, 'o')], dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Metro not reachable|Xcode|runtime/);
  assert.equal(r.stdout, '');
});

// ---- review round 1 ----
test('createSession onCreated + makeSignalCleanup: SIGINT mid-creation deletes the first device', async () => {
  let n = 0;
  const created = [];
  const run = fakeRun((c, a) => {
    if (a[1] === 'create') return ok(uuid(++n) + '\n');
    if (a[1] === 'bootstatus') return new Promise(() => {}); // hangs like a slow boot
  });
  const pending = createSession(run, { devices: pickDevices(devicetypes, runtimes), runId: 'r', onCreated: (s) => created.push(s.udid) });
  pending.catch(() => {});
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(created, [U1]);
  let exited = null;
  const handler = makeSignalCleanup({ run, udids: created, keep: false, exit: (c) => { exited = c; } });
  await handler(130);
  assert.deepEqual(sub(run.calls, 'delete').map(([, a]) => a[2]), [U1]);
  assert.equal(exited, 130);
});

test('makeSignalCleanup: keep leaves simulators, still exits', async () => {
  const run = fakeRun();
  let exited = null;
  await makeSignalCleanup({ run, udids: [U1], keep: true, exit: (c) => { exited = c; } })(143);
  assert.equal(sub(run.calls, 'delete').length, 0);
  assert.equal(exited, 143);
});

test('runMobileCheck forwards onCreated for every simulator', async () => {
  const { deps, opts } = mkEnv();
  const got = [];
  await runMobileCheck(opts({ modes: ['light'], routes: [{ name: 'home', path: '/' }] }), { ...deps, onCreated: (s) => got.push(s.udid) });
  assert.deepEqual(got, [U1, U2]);
});

test('loadRoutes: names whose file slugs collide are rejected, naming both', async () => {
  for (const names of [['a b', 'a-b'], ['a-b', 'a/b']]) {
    const f = writeTmp('s.json', names.map((name) => ({ name, path: '/' })));
    await assert.rejects(loadRoutes(f), (e) => e instanceof EnvError && e.message.includes(`"${names[0]}"`) && e.message.includes(`"${names[1]}"`));
  }
});

test('every rule id check-mobile can emit is registered', async () => {
  const flow = writeTmp('flow.yaml', 'x');
  const { deps, opts } = mkEnv((c, a) => (c === 'maestro' && a[2] === 'test' && a[3] === flow ? { code: 1, stdout: '', stderr: 'nope' } : undefined));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), deps);
  const ids = new Set([...r.findings.map((f) => f.rule), ...findingsFromHierarchy(load('hierarchy-redbox.json'), { route: 'x' }).map((f) => f.rule)]);
  const dup = await runMobileCheck(opts({ modes: ['light'] }), { ...deps, read: async () => Buffer.from('same') });
  for (const f of dup.findings) ids.add(f.rule);
  assert.ok(ids.has('flow-failed') && ids.has('app-error') && ids.has('route-not-navigated'));
  for (const id of ids) assert.ok(RULE_IDS.includes(id), id);
  const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'uix-skill', 'references', 'anti-slop.md'), 'utf8');
  assert.match(doc, /^### flow-failed$/m);
  assert.match(doc, /^### route-not-navigated$/m);
});

const recorder = (writeFile = true) => (c, a) => {
  if (a[1] === 'io' && a[3] === 'recordVideo' && writeFile) writeFileSync(a[4], 'mp4');
};
const stepOf = ([, a]) => (a[1] === 'ui' ? `ui:${a[3]}` : a[1] === 'io' ? `io:${a[3]}` : a[1]);

test('--video order: appearance, terminate, recordVideo, openurl, stop, then screenshot', async () => {
  const { run, out, deps, opts } = mkEnv(recorder());
  const r = await runMobileCheck(opts({ video: true, modes: ['light'], routes: [{ name: 'home', path: '/' }] }), deps);
  const steps = run.calls.filter(([, a]) => a[2] === U1).map(stepOf); // device 0's own sequence
  const rec = steps.indexOf('io:recordVideo');
  const sec = steps.indexOf('openurl', steps.indexOf('terminate', steps.indexOf('install') + 1) + 1); // first-open openurl is the one before recording
  void sec;
  assert.deepEqual(steps.slice(rec - 2, rec + 3), ['ui:appearance', 'terminate', 'io:recordVideo', 'openurl', 'io:screenshot']);
  assert.equal(run.calls.filter(([, a]) => a[3] === 'recordVideo').length, 2);
  assert.deepEqual(run.calls.find(([, a]) => a[3] === 'recordVideo')[1].slice(0, 4), ['simctl', 'io', U1, 'recordVideo']);
  assert.ok(r.notes.some((n) => n === `video: ${join(out, 'iPhone-SE-3rd-generation-home.mp4')}`));
  assert.ok(!r.notes.some((n) => /video failed/.test(n)));
});

test('--video: missing or empty file -> "video failed" note', async () => {
  const { out, deps, opts } = mkEnv(recorder(false));
  const r = await runMobileCheck(opts({ video: true, modes: ['light'], routes: [{ name: 'home', path: '/' }] }), deps);
  assert.ok(r.notes.includes(`video failed: ${join(out, 'iPhone-SE-3rd-generation-home.mp4')}`));
});

test('--video: a throw while recording still awaits the recording', async () => {
  let finished = false;
  let recording = false;
  const { deps, opts } = mkEnv((c, a) => {
    if (a[1] === 'io' && a[3] === 'recordVideo') return (recording = true) && new Promise((r) => setTimeout(() => { finished = true; r(ok()); }, 20));
    if (recording && a[1] === 'openurl') return { code: 1, stdout: '', stderr: 'boom' };
  });
  await assert.rejects(runMobileCheck(opts({ video: true, modes: ['light'], routes: [{ name: 'home', path: '/' }] }), deps), EnvError);
  assert.equal(finished, true);
});

test('xxxl: content size is reset even when a step throws after it was set', async () => {
  const { run, deps, opts } = mkEnv((c, a) => (a[1] === 'openurl' && a[3].endsWith('/--/bag') ? { code: 1, stdout: '', stderr: 'boom' } : undefined));
  await assert.rejects(runMobileCheck(opts({ modes: ['xxxl'] }), deps), /bag/);
  const cs = run.calls.filter(([, a]) => a[2] === U1 && a[3] === 'content_size').map(([, a]) => a[4]);
  assert.deepEqual(cs.slice(-2), [BIGTEXT, 'large']);
});

test('xxxl: a failed reset is an error', async () => {
  const { deps, opts } = mkEnv((c, a) => (a[3] === 'content_size' && a[4] === 'large' ? { code: 1, stdout: '', stderr: 'nope' } : undefined));
  await assert.rejects(runMobileCheck(opts({ modes: ['xxxl'], routes: [{ name: 'home', path: '/' }] }), deps), EnvError);
});

test('hierarchy notes: no light mode, and --devices names the hierarchy device', async () => {
  const { run, deps, opts } = mkEnv();
  const r = await runMobileCheck(opts({ modes: ['dark'], routes: [{ name: 'home', path: '/' }] }), deps);
  assert.ok(r.notes.includes('hierarchy skipped: light mode not requested'));
  assert.ok(!run.calls.some(([c, a]) => c === 'maestro' && a.includes('hierarchy')));
  const e = mkEnv();
  const r2 = await runMobileCheck(e.opts({ devices: ['iPhone 17 Pro Max', 'iPhone 17e'], modes: ['light'], routes: [{ name: 'home', path: '/' }] }), e.deps);
  assert.ok(r2.notes.includes('hierarchy device: iPhone 17 Pro Max'));
});

test('Expo Go lookup: non-JSON from api.expo.dev is an EnvError', async () => {
  const { deps, opts } = mkEnv(undefined, { apiBad: true });
  await assert.rejects(runMobileCheck(opts(), deps), (e) => e instanceof EnvError && /api\.expo\.dev/.test(e.message));
});

test('Expo Go download: a body that times out is an EnvError and leaves no partial dir', async () => {
  const { deps, opts } = mkEnv();
  const base = deps.fetchImpl;
  deps.fetchImpl = async (url, o) => {
    if (!String(url).startsWith('https://x.test')) return base(url, o);
    return { ok: true, status: 200, arrayBuffer: async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); } };
  };
  await assert.rejects(runMobileCheck(opts(), deps), (e) => e instanceof EnvError && /Downloading Expo Go failed/.test(e.message));
  assert.deepEqual((await import('node:fs')).readdirSync(deps.cacheRoot), []);
});

test('flow temp dir: not created without maestro, the one made is removed after a run', async () => {
  const { readdirSync } = await import('node:fs');
  const seenDirs = [];
  const { deps, opts } = mkEnv((c, a) => {
    if (c === 'maestro' && a[2] === 'test') seenDirs.push(...readdirSync(deps.tmpRoot).filter((n) => n.startsWith('uix-flow-')));
  });
  await runMobileCheck(opts({ modes: ['light'], routes: [{ name: 'home', path: '/' }] }), deps);
  assert.ok(seenDirs.length >= 1 && new Set(seenDirs).size === 1, 'one folder under tmpRoot while running');
  assert.deepEqual(readdirSync(deps.tmpRoot), [], 'and gone afterwards');
  const m = mkEnv((c) => (c === 'maestro' ? { code: 127, stdout: '', stderr: 'ENOENT' } : undefined));
  await runMobileCheck(m.opts({ modes: ['light'], routes: [{ name: 'home', path: '/' }] }), m.deps);
  assert.deepEqual(readdirSync(m.deps.tmpRoot), []);
});

// ---- final review round ----
const fakeProc = () => {
  const handlers = {};
  const out = [];
  const err = [];
  return {
    handlers, out, err, exits: [],
    on(sig, fn) { handlers[sig] = fn; },
    exit(c) { this.exits.push(c); },
    stdout: { write: (t) => out.push(t) },
    stderr: { write: (t) => err.push(t) },
  };
};
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('installSignalHandlers: SIGINT, SIGTERM and SIGHUP are wired with on, not once', () => {
  const proc = fakeProc();
  installSignalHandlers(proc, async () => {});
  assert.deepEqual(Object.keys(proc.handlers).sort(), ['SIGHUP', 'SIGINT', 'SIGTERM']);
});

test('installSignalHandlers: a repeat signal while cleanup runs is ignored', async () => {
  const proc = fakeProc();
  const gate = deferred();
  const codes = [];
  installSignalHandlers(proc, (code) => { codes.push(code); return gate.promise; });
  proc.handlers.SIGINT();
  proc.handlers.SIGINT();
  proc.handlers.SIGTERM();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(codes, [130]);
  assert.deepEqual(proc.exits, []);
  gate.resolve();
});

test('createSession: isAborted set after device 1 means no second create', async () => {
  let n = 0;
  let aborted = false;
  const run = fakeRun((c, a) => (a[1] === 'create' ? ok(uuid(++n) + '\n') : undefined));
  const onCreated = () => { aborted = true; };
  await assert.rejects(
    createSession(run, { devices: pickDevices(devicetypes, runtimes), runId: 'r', onCreated, isAborted: () => aborted }),
    (e) => e instanceof EnvError && /abort/i.test(e.message),
  );
  assert.equal(sub(run.calls, 'create').length, 1);
});

test('makeSignalCleanup: a udid reported after cleanup began is still deleted; children killed first', async () => {
  const udids = [U1];
  const order = [];
  const gate = deferred();
  const run = fakeRun((c, a) => {
    order.push(a[1]);
    if (a[1] === 'shutdown' && a[2] === U1) return gate.promise.then(() => undefined);
  });
  let exited = null;
  const cleanup = makeSignalCleanup({ run, udids, keep: false, exit: (c) => { exited = c; }, killChildren: () => order.push('kill') });
  assert.equal(cleanup.isAborted(), false);
  const done = cleanup(130);
  await new Promise((r) => setImmediate(r));
  assert.equal(cleanup.isAborted(), true);
  udids.push(U2); // arrives from onCreated while the first delete is in flight
  gate.resolve();
  await done;
  assert.equal(order[0], 'kill');
  assert.deepEqual(sub(run.calls, 'delete').map(([, a]) => a[2]), [U1, U2]);
  assert.equal(exited, 130);
});

test('runMobileCheck: keep lists each kept simulator as a note', async () => {
  const { deps, opts } = mkEnv();
  const r = await runMobileCheck(opts({ keep: true, modes: ['light'], routes: [{ name: 'home', path: '/' }] }), deps);
  const kept = r.notes.filter((n) => n.startsWith('kept: '));
  assert.equal(kept.length, 2);
  assert.match(kept[0], new RegExp(`^kept: uix-.* ${U1}$`));
  assert.match(kept[1], new RegExp(` ${U2}$`));
});

test('main: a failure with --keep prints the kept simulators on stderr and returns 2', async () => {
  const dir = scratch();
  writeFileSync(join(dir, 'app.json'), JSON.stringify(appJson));
  writeFileSync(join(dir, 'routes.json'), JSON.stringify([{ name: 'home', path: '/' }]));
  const proc = fakeProc();
  const check = async (o, d) => {
    d.onCreated({ name: 'uix-iPhone-r', udid: U1 });
    throw new EnvError('boom');
  };
  const cwd = process.cwd();
  process.chdir(dir);
  let code;
  try {
    code = await main(['--app', APP, '--routes', 'routes.json', '--keep'], { check, proc });
  } finally {
    process.chdir(cwd);
  }
  assert.equal(code, 2);
  const err = proc.err.join('');
  assert.match(err, /boom/);
  assert.match(err, new RegExp(`kept: uix-iPhone-r ${U1}`));
});

test('trackChild / killLiveChildren: kills each live child with SIGTERM and forgets it', () => {
  const sent = [];
  const child = { kill: (s) => sent.push(s) };
  const untrack = trackChild(child);
  assert.equal(liveChildCount(), 1);
  killLiveChildren();
  assert.deepEqual(sent, ['SIGTERM']);
  untrack();
  assert.equal(liveChildCount(), 0);
});

test('defaultRun registers its child while running and drops it on exit (harmless node child)', async () => {
  const p = defaultRun(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(liveChildCount(), 1);
  killLiveChildren();
  const res = await p;
  assert.notEqual(res.code, 0);
  assert.equal(liveChildCount(), 0);
});

test('killLiveChildren spares an in-flight simctl create, so its device still reports a UDID', () => {
  const sent = [];
  const create = { kill: (s) => sent.push(`create:${s}`) };
  const other = { kill: (s) => sent.push(`other:${s}`) };
  const u1 = trackChild(create, { spare: sparesKill('xcrun', ['simctl', 'create', 'n', 't', 'r']) });
  const u2 = trackChild(other, { spare: sparesKill('maestro', ['test', 'f.yaml']) });
  killLiveChildren();
  assert.deepEqual(sent, ['other:SIGTERM']);
  assert.equal(sparesKill('xcrun', ['simctl', 'delete', U1]), false);
  u1(); u2();
  assert.equal(liveChildCount(), 0);
});

test('makeSignalCleanup: waits for in-flight creates, then deletes the UDID they report', async () => {
  const udids = [U1];
  const run = fakeRun(() => undefined);
  let exited = null;
  const waitForCreates = async () => { udids.push(U2); };
  await makeSignalCleanup({ run, udids, keep: false, exit: (c) => { exited = c; }, killChildren: () => {}, waitForCreates })(130);
  assert.deepEqual(sub(run.calls, 'delete').map(([, a]) => a[2]), [U1, U2]);
  assert.equal(exited, 130);
});

test('makeSignalCleanup: keep logs each kept UDID on the signal path', async () => {
  const lines = [];
  const run = fakeRun(() => undefined);
  await makeSignalCleanup({ run, udids: [U1], keep: true, exit: () => {}, killChildren: () => {}, waitForCreates: async () => {}, log: (l) => lines.push(l) })(130);
  assert.deepEqual(lines, [`kept: ${U1}\n`]);
  assert.equal(sub(run.calls, 'delete').length, 0);
});

test('createSession: abort during a create still reports that UDID and skips boot', async () => {
  let aborted = false;
  const reported = [];
  const run = fakeRun((c, a) => {
    if (a[1] === 'create') { aborted = true; return ok(uuid(1) + '\n'); }
  });
  await assert.rejects(
    createSession(run, { devices: pickDevices(devicetypes, runtimes), runId: 'r', onCreated: (s) => reported.push(s.udid), isAborted: () => aborted }),
    (e) => e instanceof EnvError && /abort/i.test(e.message),
  );
  assert.deepEqual(reported, [uuid(1)]);
  assert.equal(sub(run.calls, 'boot').length, 0);
  assert.deepEqual(sub(run.calls, 'delete').map(([, a]) => a[2]), [uuid(1)]);
});

test('createSession: keep leaves the created simulator when boot fails, so a kept: line is true', async () => {
  const run = fakeRun((c, a) => {
    if (a[1] === 'create') return ok(uuid(1) + '\n');
    if (a[1] === 'boot') return { code: 1, stdout: '', stderr: 'nope' };
  });
  await assert.rejects(createSession(run, { devices: pickDevices(devicetypes, runtimes), runId: 'r', keep: true }), EnvError);
  assert.equal(sub(run.calls, 'delete').length, 0);
});

test('removeStalePartials: removes only dead-pid partial dirs of the exact pattern', async () => {
  const { mkdirSync: mk, existsSync } = await import('node:fs');
  const root = scratch();
  const names = ['uix-expo-go-58.partial-111', 'uix-expo-go-58.partial-222', 'uix-expo-go-58', 'uix-expo-go-58.partial-abc', 'uix-expo-go-58.partial-333.tar.gz', 'other.partial-111', 'uix-flow-111'];
  for (const n of names) mk(join(root, n));
  const alive = (pid) => pid === 222;
  const removed = await removeStalePartials(root, alive);
  assert.deepEqual(removed, ['uix-expo-go-58.partial-111']);
  for (const n of names) assert.equal(existsSync(join(root, n)), n !== 'uix-expo-go-58.partial-111', n);
});

test('removeStalePartials: a missing cache root is fine', async () => {
  assert.deepEqual(await removeStalePartials(join(scratch(), 'nope'), () => false), []);
});

test('runMobileCheck: stale partial dirs are cleaned before the Expo Go download', async () => {
  const { mkdirSync: mk, existsSync } = await import('node:fs');
  const { deps, opts } = mkEnv();
  mk(join(deps.cacheRoot, 'uix-expo-go-58.partial-2147483646'));
  await runMobileCheck(opts({ modes: ['light'], routes: [{ name: 'home', path: '/' }] }), deps);
  assert.equal(existsSync(join(deps.cacheRoot, 'uix-expo-go-58.partial-2147483646')), false);
});

// ---- round 1, task 1: run correctness ----
const lightOpts = (opts, o = {}) => opts({ modes: ['light'], devices: ['iPhone 17 Pro Max'], ...o });

test('parseArgs: --only splits on comma; empty is an error', () => {
  assert.deepEqual(parseArgs(['--app', 'exp://h:1', '--only', 'home, bag']).only, ['home', 'bag']);
  assert.match(parseArgs(['--app', 'exp://h:1', '--only']).error, /--only/);
  assert.match(parseArgs(['--app', 'exp://h:1', '--only', ',']).error, /--only/);
});

test('filterRoutes: keeps routes-file order, unknown name is an EnvError', () => {
  const routes = [{ name: 'a', path: '/a' }, { name: 'b', path: '/b' }, { name: 'c', path: '/c' }];
  assert.deepEqual(filterRoutes(routes, ['c', 'a']).map((r) => r.name), ['a', 'c']);
  assert.equal(filterRoutes(routes, null), routes);
  assert.throws(() => filterRoutes(routes, ['a', 'zzz']), (e) => e instanceof EnvError && /zzz/.test(e.message));
});

test('main: --only with an unknown route exits 2 before the check (no simulator)', async () => {
  const dir = scratch();
  const rf = join(dir, 'routes.json');
  writeFileSync(rf, JSON.stringify([{ name: 'home', path: '/' }]));
  let called = 0;
  let err = '';
  const proc = { on() {}, stderr: { write: (t) => { err += t; } }, stdout: { write() {} }, exit() {} };
  const code = await main(['--app', APP, '--routes', rf, '--only', 'nope'], { check: async () => { called++; return {}; }, proc });
  assert.equal(code, 2);
  assert.equal(called, 0);
  assert.match(err, /nope/);
});

test('main: --only passes only the named routes to the check', async () => {
  const dir = scratch();
  const rf = join(dir, 'routes.json');
  writeFileSync(rf, JSON.stringify([{ name: 'home', path: '/' }, { name: 'bag', path: '/bag' }]));
  writeFileSync(join(dir, 'app.json'), JSON.stringify(appJson));
  const prev = process.cwd();
  process.chdir(dir);
  let got;
  try {
    const proc = { on() {}, stderr: { write() {} }, stdout: { write() {} }, exit() {} };
    await main(['--app', APP, '--routes', rf, '--only', 'bag'], { check: async (o) => { got = o.routes.map((r) => r.name); return { shots: [], findings: [], notes: [] }; }, proc });
  } finally {
    process.chdir(prev);
  }
  assert.deepEqual(got, ['bag']);
});

test('duplicate shots: identical for two routes gives one finding naming both, after one retry', async () => {
  const { run, deps, opts } = mkEnv();
  const r = await runMobileCheck(lightOpts(opts), { ...deps, read: async () => Buffer.from('same') });
  const f = r.findings.filter((x) => x.rule === 'route-not-navigated');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'error');
  assert.equal(f[0].route, 'bag');
  assert.match(f[0].message, /^bag \(\/bag\) on iPhone 17 Pro Max light shows the same screen as home; the deep link did not navigate or the app was still loading; see react-native\.md "Deep links in Expo Go"$/);
  assert.equal(sub(run.calls, 'openurl').filter(([, a]) => a[3] === `${APP}/--/bag`).length, 2);
  assert.equal(r.shots.length, 2);
});

test('duplicate shots: identical first, different on the retry gives no finding and 2 openurls', async () => {
  const { run, deps, opts } = mkEnv();
  const bagOpens = () => sub(run.calls, 'openurl').filter(([, a]) => a[3] === `${APP}/--/bag`).length;
  const read = async () => Buffer.from(bagOpens() >= 2 ? 'bag-real' : 'splash');
  // home reads 'splash' before bag was opened; bag first reads 'splash' too, then the real screen.
  const r = await runMobileCheck(lightOpts(opts), { ...deps, read });
  assert.deepEqual(r.findings.filter((x) => x.rule === 'route-not-navigated'), []);
  assert.equal(bagOpens(), 2);
});

test('duplicate shots: the retry settles with minMs doubled', async () => {
  const { deps, opts } = mkEnv();
  const slept = [];
  await runMobileCheck(lightOpts(opts), { ...deps, read: async () => Buffer.from('same'), sleep: async (ms) => { slept.push(ms); } });
  assert.equal(slept.filter((ms) => ms === 1500).length, 2);
  assert.equal(slept.filter((ms) => ms === 3000).length, 1);
});

test('duplicate shots: different shots never retry', async () => {
  const { run, deps, opts } = mkEnv();
  const r = await runMobileCheck(lightOpts(opts), deps);
  assert.deepEqual(r.findings.filter((x) => x.rule === 'route-not-navigated'), []);
  assert.equal(sub(run.calls, 'openurl').filter(([, a]) => a[3] === `${APP}/--/bag`).length, 1);
});

test('duplicate shots: the same bytes in different modes or devices are not compared', async () => {
  const { deps, opts } = mkEnv();
  const r = await runMobileCheck(opts({ routes: [{ name: 'home', path: '/' }] }), { ...deps, read: async () => Buffer.from('same') });
  assert.deepEqual(r.findings.filter((x) => x.rule === 'route-not-navigated'), []);
});

test('progress: [i/N] lines go to the injected log', async () => {
  const { deps, opts } = mkEnv();
  const lines = [];
  await runMobileCheck(opts({ modes: ['light', 'dark'] }), { ...deps, log: (l) => lines.push(l) });
  assert.equal(lines.length, 8); // 2 devices x 2 routes x 2 modes
  assert.equal(lines[0], 'check-mobile: [1/8] iPhone SE (3rd generation) home light\n');
  // devices run at once, so the lines interleave; the shared counter still runs 1..8 in order
  assert.deepEqual(lines.map((l) => l.match(/\[(\d+)\/8\]/)[1]), ['1', '2', '3', '4', '5', '6', '7', '8']);
  for (const dev of ['iPhone SE (3rd generation)', 'iPhone 17 Pro Max']) {
    assert.deepEqual(lines.filter((l) => l.includes(dev)).map((l) => l.split(dev + ' ')[1]), ['home light\n', 'home dark\n', 'bag light\n', 'bag dark\n']);
  }
});

test('progress: the default log writes to stderr, never stdout', async () => {
  const { deps, opts } = mkEnv();
  const { log, ...rest } = deps;
  const err = [];
  const out = [];
  const we = process.stderr.write;
  const wo = process.stdout.write;
  process.stderr.write = (t) => { err.push(String(t)); return true; };
  process.stdout.write = (t) => { out.push(String(t)); return true; };
  try {
    await runMobileCheck(opts({ modes: ['light'], routes: [{ name: 'home', path: '/' }] }), rest);
  } finally {
    process.stderr.write = we;
    process.stdout.write = wo;
  }
  assert.deepEqual(err.filter((l) => l.startsWith('check-mobile:')), [
    'check-mobile: [1/2] iPhone SE (3rd generation) home light\n', 'check-mobile: [2/2] iPhone 17 Pro Max home light\n',
  ]);
  assert.ok(!out.some((l) => l.includes('check-mobile:')), JSON.stringify(out));
});

test('flow: Expo Go is terminated and the app root opened right before maestro test', async () => {
  const flow = writeTmp('flow2.yaml', 'x');
  const { run, deps, opts } = mkEnv();
  await runMobileCheck(opts({ modes: ['light'], flow }), deps);
  const i = run.calls.findIndex(([c, a]) => c === 'maestro' && a[2] === 'test' && a[3] === flow);
  assert.ok(i > 2);
  assert.deepEqual(run.calls[i - 2][1].slice(0, 2), ['simctl', 'terminate']);
  assert.deepEqual(run.calls[i - 1][1].slice(0, 2), ['simctl', 'openurl']);
  assert.equal(run.calls[i - 1][1][3], `${APP}/--/`);
  assert.equal(run.calls[i - 2][1][2], run.calls[i][1][1]);
});

test('flow failure: message carries the FAILED step and a copy of the first debug png', async () => {
  const flow = writeTmp('flow3.yaml', 'x');
  const droot = join(scratch(), '.maestro', 'tests');
  const tests = join(droot, '2026-10-29_101010');
  mkdirSync(tests, { recursive: true });
  writeFileSync(join(tests, 'screenshot-a.png'), 'PNG');
  const { deps, opts, out } = mkEnv((c, a) => (c === 'maestro' && a[2] === 'test' && a[3] === flow
    ? { code: 1, stdout: `Running\n  Tap on "Buy"... FAILED\nDebug output: ${tests}\n`, stderr: '' } : undefined));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), { ...deps, debugRoot: droot });
  const f = r.findings.find((x) => x.rule === 'flow-failed');
  assert.match(f.message, /Tap on "Buy"\.\.\. FAILED/);
  assert.ok(!/Running/.test(f.message));
  assert.ok(f.message.endsWith(`screenshot: ${join(out, 'flow-failed.png')}`), f.message);
  assert.equal(readFileSync(join(out, 'flow-failed.png'), 'utf8'), 'PNG');
});

test('flow failure: no debug folder means no screenshot; no FAILED line falls back to the tail', async () => {
  const flow = writeTmp('flow4.yaml', 'x');
  const { deps, opts } = mkEnv((c, a) => (c === 'maestro' && a[2] === 'test' && a[3] === flow ? { code: 1, stdout: 'a\nb\nboom', stderr: '' } : undefined));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), deps);
  const f = r.findings.find((x) => x.rule === 'flow-failed');
  assert.match(f.message, /boom/);
  assert.ok(!/screenshot:/.test(f.message));
});

// ---- fix round 1 ----
const bagOpensOf = (run) => sub(run.calls, 'openurl').filter(([, a]) => a[3] === `${APP}/--/bag`).length;
const failingFlow = (flow, stdout) => (c, a) => (c === 'maestro' && a[2] === 'test' && a[3] === flow ? { code: 1, stdout, stderr: '' } : undefined);

test('flow failure: a debug path that escapes the debug root copies nothing', async () => {
  const flow = writeTmp('flow5.yaml', 'x');
  const base = scratch();
  const root = join(base, '.maestro', 'tests');
  mkdirSync(root, { recursive: true });
  const outside = join(base, 'secret');
  mkdirSync(outside);
  writeFileSync(join(outside, 'x.png'), 'SECRET');
  const { deps, opts, out } = mkEnv(failingFlow(flow, `Tap FAILED\nDebug output: ${root}/../../secret\n`));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), { ...deps, debugRoot: root });
  const f = r.findings.find((x) => x.rule === 'flow-failed');
  assert.ok(!/screenshot:/.test(f.message));
  assert.equal(existsSync(join(out, 'flow-failed.png')), false);
});

test('flow failure: a symlinked png is skipped, a regular one is copied', async () => {
  const flow = writeTmp('flow6.yaml', 'x');
  const base = scratch();
  const dir = join(base, '.maestro', 'tests', '2026-10-29_1');
  mkdirSync(dir, { recursive: true });
  const target = join(base, 'target.png');
  writeFileSync(target, 'SECRET');
  symlinkSync(target, join(dir, 'a-link.png'));
  writeFileSync(join(dir, 'b-real.png'), 'REAL');
  const { deps, opts, out } = mkEnv(failingFlow(flow, `Tap FAILED\nDebug output: ${dir}\n`));
  await runMobileCheck(opts({ modes: ['light'], flow }), { ...deps, debugRoot: join(base, '.maestro', 'tests') });
  assert.equal(readFileSync(join(out, 'flow-failed.png'), 'utf8'), 'REAL');
});

test('flow failure: only a symlink in the folder copies nothing', async () => {
  const flow = writeTmp('flow7.yaml', 'x');
  const base = scratch();
  const dir = join(base, '.maestro', 'tests', 's');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(base, 't.png'), 'SECRET');
  symlinkSync(join(base, 't.png'), join(dir, 'a.png'));
  const { deps, opts, out } = mkEnv(failingFlow(flow, `Tap FAILED\nDebug output: ${dir}\n`));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), { ...deps, debugRoot: join(base, '.maestro', 'tests') });
  assert.equal(existsSync(join(out, 'flow-failed.png')), false);
  assert.ok(!/screenshot:/.test(r.findings.find((x) => x.rule === 'flow-failed').message));
});

test('sameAs: a declared pair gives no finding and one openurl each, in either direction', async () => {
  for (const routes of [
    [{ name: 'home', path: '/' }, { name: 'bag', path: '/bag', sameAs: 'home' }],
    [{ name: 'home', path: '/', sameAs: 'bag' }, { name: 'bag', path: '/bag' }],
  ]) {
    const { run, deps, opts } = mkEnv();
    const r = await runMobileCheck(lightOpts(opts, { routes }), { ...deps, read: async () => Buffer.from('same') });
    assert.deepEqual(r.findings.filter((x) => x.rule === 'route-not-navigated'), []);
    assert.equal(bagOpensOf(run), 1);
    assert.equal(r.shots.length, 2);
  }
});

test('sameAs: an undeclared pair is still flagged', async () => {
  const { deps, opts } = mkEnv();
  const routes = [{ name: 'a', path: '/a' }, { name: 'b', path: '/b' }, { name: 'c', path: '/c', sameAs: 'a' }];
  const r = await runMobileCheck(lightOpts(opts, { routes }), { ...deps, read: async () => Buffer.from('same') });
  const f = r.findings.filter((x) => x.rule === 'route-not-navigated');
  assert.deepEqual(f.map((x) => x.route), ['b']); // c matches a (declared), b matches a (not declared)
});

test('sameAs: loadRoutes rejects unknown and self references, keeps a valid one', async () => {
  await assert.rejects(loadRoutes(writeTmp('s1.json', '[{"name":"a","path":"/","sameAs":"zzz"}]')), (e) => e instanceof EnvError && /zzz/.test(e.message));
  await assert.rejects(loadRoutes(writeTmp('s2.json', '[{"name":"a","path":"/","sameAs":"a"}]')), (e) => e instanceof EnvError && /itself/.test(e.message));
  const ok = await loadRoutes(writeTmp('s3.json', '[{"name":"a","path":"/"},{"name":"b","path":"/b","sameAs":"a"}]'));
  assert.deepEqual(ok, [{ name: 'a', path: '/' }, { name: 'b', path: '/b', sameAs: 'a' }]);
});

test('sameAs: a bad sameAs exits 2 through main before the check', async () => {
  const rf = writeTmp('s4.json', '[{"name":"a","path":"/","sameAs":"zzz"}]');
  let called = 0;
  let err = '';
  const proc = { on() {}, stderr: { write: (t) => { err += t; } }, stdout: { write() {} }, exit() {} };
  const code = await main(['--app', APP, '--routes', rf], { check: async () => { called++; return {}; }, proc });
  assert.equal(code, 2);
  assert.equal(called, 0);
  assert.match(err, /zzz/);
});

test('flow: a failed app-root open before the flow is a flow-failed finding, maestro test is skipped, shots kept', async () => {
  const flow = writeTmp('flow8.yaml', 'x');
  let roots = 0; // 2 first-open + 4 shot roots (home, bag per device) precede the flow's app-root open
  const { run, deps, opts } = mkEnv((c, a) => (a[1] === 'openurl' && a[3] === `${APP}/--/` && ++roots >= 7 ? { code: 1, stdout: '', stderr: 'no route' } : undefined));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), deps);
  const f = r.findings.filter((x) => x.rule === 'flow-failed');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /could not open the app root before the flow: no route/);
  assert.equal(r.shots.length, 4);
  assert.ok(!run.calls.some(([c, a]) => c === 'maestro' && a[2] === 'test' && a[3] === flow));
});

test('sameAs: two routes naming the same target are look-alikes even when the target is filtered out', async () => {
  const { run, deps, opts } = mkEnv();
  const routes = [{ name: 'b', path: '/b', sameAs: 'a' }, { name: 'c', path: '/c', sameAs: 'a' }];
  const r = await runMobileCheck(lightOpts(opts, { routes }), { ...deps, read: async () => Buffer.from('same') });
  assert.deepEqual(r.findings.filter((x) => x.rule === 'route-not-navigated'), []);
  assert.equal(r.shots.length, 2);
});

// ---- round 2, task 1: run correctness ----
const openLog = (run) => run.calls.filter(([c]) => c === 'xcrun').map(([, a]) => a[1] === 'openurl' ? `open ${a[3].slice(APP.length)}` : a[1] === 'io' && a[3] === 'screenshot' ? 'shot' : a[1]).filter((x) => ['terminate', 'shot'].includes(x) || x.startsWith('open '));
const dedupe = (l) => l.filter((x, i) => x !== l[i - 1]);

test('open sequence: /shop is terminate, root open, shots, route open, shots, no terminate between the opens', async () => {
  const { run, deps, opts } = mkEnv();
  await runMobileCheck(lightOpts(opts, { routes: [{ name: 'shop', path: '/shop' }] }), deps);
  const log = dedupe(openLog(run));
  const i = log.lastIndexOf('open /--/');
  assert.deepEqual(log.slice(i - 1), ['terminate', 'open /--/', 'shot', 'open /--/shop', 'shot']);
});

test('open sequence: path / opens once, /?sheet=open opens twice', async () => {
  const count = async (path) => {
    const { run, deps, opts } = mkEnv();
    await runMobileCheck(lightOpts(opts, { routes: [{ name: 'r', path }] }), deps);
    return sub(run.calls, 'openurl').length - 1; // minus the first-open
  };
  assert.equal(await count('/'), 1);
  assert.equal(await count('/?sheet=open'), 2);
});

test('open sequence: the first wait uses ROOT_WAIT (8000), the retry ROOT_WAIT_LONG (20000)', async () => {
  const { deps, opts } = mkEnv();
  const slept = [];
  await runMobileCheck(lightOpts(opts), { ...deps, read: async () => Buffer.from('same'), sleep: async (ms) => { slept.push(ms); } });
  // home (path /) never waits for a root; bag: 8000 then shot wait 1500; retry: 20000, then 3000
  assert.deepEqual(slept.filter((ms) => ms >= 3000), [8000, 20000, 3000]);
  assert.equal(ROOT_WAIT.minMs, 8000);
  assert.equal(ROOT_WAIT_LONG.minMs, 20000);
});

test('route-not-navigated: the twin route gets no hierarchy read and no hierarchy findings', async () => {
  const { run, deps, opts } = mkEnv();
  const routes = [{ name: 'home', path: '/' }, { name: 'bag', path: '/bag' }];
  const r = await runMobileCheck(lightOpts(opts, { routes, devices: null }), { ...deps, read: async () => Buffer.from('same') });
  const hier = run.calls.filter(([c, a]) => c === 'maestro' && a.includes('hierarchy'));
  assert.equal(hier.length, 1); // home only
  assert.deepEqual([...new Set(r.findings.filter((x) => x.rule !== 'route-not-navigated').map((x) => x.route))].filter((n) => n === 'bag'), []);
});

test('openurl retry: fail, fail, succeed gives 3 calls and 5000 ms sleeps', async () => {
  let n = 0;
  const run = fakeRun((c, a) => (a[1] === 'openurl' && ++n < 3 ? { code: 1, stdout: '', stderr: 'timeout' } : undefined));
  const slept = [];
  const r = await openUrlRetry(run, async (ms) => { slept.push(ms); }, U1, 'exp://x/--/');
  assert.equal(r.code, 0);
  assert.equal(sub(run.calls, 'openurl').length, 3);
  assert.deepEqual(slept, [OPENURL_RETRY_MS, OPENURL_RETRY_MS]);
  assert.equal(OPENURL_RETRY_MS, 5000);
});

test('openurl retry: three failures through a run give the EnvError with the last tail', async () => {
  let n = 0;
  const { run, deps, opts } = mkEnv((c, a) => (a[1] === 'openurl' && a[3].endsWith('/--/bag') ? { code: 1, stdout: '', stderr: `try ${++n}` } : undefined));
  await assert.rejects(runMobileCheck(lightOpts(opts), deps), (e) => e instanceof EnvError && /bag/.test(e.message) && /try 3/.test(e.message));
  assert.equal(n, 3);
});

test('partial result: a screenshot failure on the 3rd shot keeps the 2 earlier shots on the error', async () => {
  let shots = 0;
  const { deps, opts } = mkEnv((c, a) => (a[1] === 'io' && a[3] === 'screenshot' && ++shots >= 5 ? { code: 1, stdout: '', stderr: 'no screen' } : undefined));
  // home light/dark: 1 screenshot pair each (settle shoots twice when stable), so the 3rd shot fails in its first settle
  await assert.rejects(runMobileCheck(opts({ devices: ['iPhone 17 Pro Max'], routes: [{ name: 'home', path: '/' }] }), deps), (e) => {
    assert.equal(e.partial.shots.length, 2);
    assert.equal(e.partial.notes.at(-1), `failed: ${e.message}`);
    assert.ok(Array.isArray(e.partial.findings));
    return true;
  });
});

test('main: err.partial prints the partial JSON on stdout, stderr keeps one line, exit 2', async () => {
  const dir = scratch();
  writeFileSync(join(dir, 'app.json'), JSON.stringify(appJson));
  writeFileSync(join(dir, 'routes.json'), JSON.stringify([{ name: 'home', path: '/' }]));
  const out = [];
  const err = [];
  const proc = { ...fakeProc(), stdout: { write: (t) => out.push(t) }, stderr: { write: (t) => err.push(t) } };
  const check = async () => { throw Object.assign(new EnvError('boom'), { partial: { shots: ['a.png', 'b.png'], findings: [], notes: ['failed: boom'] } }); };
  const cwd = process.cwd();
  process.chdir(dir);
  let code;
  try { code = await main(['--app', APP, '--routes', 'routes.json'], { check, proc }); } finally { process.chdir(cwd); }
  assert.equal(code, 2);
  assert.deepEqual(JSON.parse(out.join('')).shots, ['a.png', 'b.png']);
  assert.equal(err.join(''), 'check-mobile.mjs: boom\n');
});

test('main: a preflight failure prints no stdout JSON', async () => {
  const dir = scratch();
  writeFileSync(join(dir, 'app.json'), JSON.stringify(appJson));
  writeFileSync(join(dir, 'routes.json'), JSON.stringify([{ name: 'home', path: '/' }]));
  const out = [];
  const proc = { ...fakeProc(), stdout: { write: (t) => out.push(t) }, stderr: { write() {} } };
  const cwd = process.cwd();
  process.chdir(dir);
  let code;
  try { code = await main(['--app', APP, '--routes', 'routes.json'], { check: async () => { throw new EnvError('no xcode'); }, proc }); } finally { process.chdir(cwd); }
  assert.equal(code, 2);
  assert.deepEqual(out, []);
});

test('Metro hint: no CI=1', async () => {
  const dead = async () => { throw new Error('refused'); };
  await assert.rejects(preflight({ run: okRun(), app: APP, appJson, fetchImpl: dead, cwd: CWD }), (e) => /start it with: npx expo start --port <port>$/.test(e.message) && !/CI=1/.test(e.message));
});

test('--video: for /shop recordVideo starts after the root open and before the route open', async () => {
  const { run, deps, opts } = mkEnv(recorder());
  await runMobileCheck(opts({ video: true, modes: ['light'], devices: ['iPhone 17 Pro Max'], routes: [{ name: 'shop', path: '/shop' }] }), deps);
  const tags = run.calls.map(([, a]) => (a[1] === 'openurl' ? `open ${a[3].slice(APP.length)}` : a[3] === 'recordVideo' ? 'rec' : null)).filter(Boolean);
  // first-open (/--/shop) comes first; then the shot: root, rec, route
  assert.deepEqual(tags.slice(1), ['open /--/', 'rec', 'open /--/shop']);
});

test('partial result: the failed: note collapses whitespace to one line', async () => {
  const { deps, opts } = mkEnv((c, a) => (a[1] === 'io' && a[3] === 'screenshot' ? { code: 1, stdout: '', stderr: 'a\n  b' } : undefined));
  await assert.rejects(runMobileCheck(opts({ devices: ['iPhone 17 Pro Max'], routes: [{ name: 'home', path: '/' }] }), deps), (e) => {
    assert.ok(!e.partial.notes.at(-1).includes('\n'));
    assert.match(e.partial.notes.at(-1), /^failed: .*a b$/);
    return true;
  });
});

// ---- Task 2: devices run at once ----
const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));
// A run that logs "start"/"end" events per call and delays device-bound simctl calls by delayFor(udid) ms.
function parallelEnv({ delayFor = () => 0, fail = () => false, maestroMs = 0 } = {}) {
  const events = [];
  let maestroActive = 0;
  let maestroMax = 0;
  const env = mkEnv((c, a) => {
    const udid = c === 'xcrun' && a[1] !== 'list' && a[1] !== 'create' ? a[2] : c === 'maestro' ? a[1] : undefined;
    if (c === 'maestro' && a.includes('hierarchy')) {
      return (async () => {
        maestroMax = Math.max(maestroMax, ++maestroActive);
        await tick(maestroMs);
        maestroActive--;
        return ok(JSON.stringify(sampleTree));
      })();
    }
    if (c === 'maestro' && a[0] === '--device') {
      return (async () => {
        maestroMax = Math.max(maestroMax, ++maestroActive);
        await tick(maestroMs);
        maestroActive--;
        return ok();
      })();
    }
    if (udid === undefined) return undefined;
    return (async () => {
      const id = events.length;
      events.push(['start', udid, a[1], a[3], id]);
      await tick(delayFor(udid));
      events.push(['end', udid, a[1], a[3], id]);
      return fail(udid, a) ? { code: 1, stdout: '', stderr: 'boom' } : ok();
    })();
  });
  return { ...env, events, maestroMax: () => maestroMax };
}
const evIndex = (events, pred, from = 0) => events.findIndex((e, i) => i >= from && pred(e));

test('parallel: device 1 first openurl starts before device 0 last screenshot ends', async () => {
  const { events, deps, opts } = parallelEnv({ delayFor: () => 2 });
  await runMobileCheck(opts({ modes: ['light'] }), deps);
  // device 1's route-loop open (the first-open flow runs before any route work, even serially)
  const startU2 = evIndex(events, (e) => e[0] === 'start' && e[1] === U2 && e[2] === 'openurl' && e[3].endsWith('/--/bag'));
  let lastEndU1 = -1;
  events.forEach((e, i) => { if (e[0] === 'end' && e[1] === U1 && e[2] === 'io' && e[3] === 'screenshot') lastEndU1 = i; });
  assert.ok(startU2 >= 0 && lastEndU1 >= 0);
  assert.ok(startU2 < lastEndU1, `${startU2} !< ${lastEndU1}`);
});

test('parallel: two maestro commands never overlap (first-open, hierarchy, --flow)', async () => {
  const env = parallelEnv({ delayFor: () => 1, maestroMs: 3 });
  const r = await runMobileCheck(env.opts({ flow: 'flow.yaml', modes: ['light'] }), env.deps);
  assert.ok(env.run.calls.filter(([c]) => c === 'maestro').length >= 5);
  assert.equal(env.maestroMax(), 1);
  assert.ok(!r.findings.some((f) => f.rule === 'flow-failed'));
});

test('parallel: the --flow run starts only after both device jobs have ended', async () => {
  const env = parallelEnv({ delayFor: () => 1 });
  await runMobileCheck(env.opts({ flow: 'flow.yaml', modes: ['light'] }), env.deps);
  const calls = env.run.calls;
  const flowAt = calls.findIndex(([c, a]) => c === 'maestro' && a.includes('flow.yaml'));
  const lastShot = calls.map(([, a]) => a[3] === 'screenshot').lastIndexOf(true);
  assert.ok(flowAt > lastShot);
});

test('parallel: shots and findings come out device 0 first even when device 0 is slower', async () => {
  const { deps, opts } = parallelEnv({ delayFor: (u) => (u === U1 ? 3 : 0) });
  const r = await runMobileCheck(opts({ modes: ['light', 'dark'] }), deps);
  const names = r.shots.map((s) => s.split('/').pop());
  assert.equal(names.length, 8);
  assert.ok(names.slice(0, 4).every((n) => n.startsWith('iPhone-SE')), names.join(','));
  assert.ok(names.slice(4).every((n) => n.startsWith('iPhone-17')), names.join(','));
  assert.deepEqual(names.slice(0, 4).map((n) => n.replace('iPhone-SE-3rd-generation-', '')), ['home-light.png', 'home-dark.png', 'bag-light.png', 'bag-dark.png']);
});

test('parallel: findings order is device 0 first (route-not-navigated per device)', async () => {
  const { deps, opts } = parallelEnv({ delayFor: (u) => (u === U1 ? 3 : 0) });
  // every shot has the same bytes -> each device flags bag as not navigated
  const r = await runMobileCheck(opts({ modes: ['light'] }), { ...deps, read: async () => Buffer.from('same') });
  const nn = r.findings.filter((f) => f.rule === 'route-not-navigated');
  assert.equal(nn.length, 2);
  assert.match(nn[0].message, /iPhone SE/);
  assert.match(nn[1].message, /iPhone 17 Pro Max/);
});

test('parallel: device 0 fails mid-run -> delete only after device 1 has returned; partial holds both devices', async () => {
  const { events, deps, opts } = parallelEnv({
    delayFor: (u) => (u === U2 ? 2 : 0),
    fail: (u, a) => u === U1 && a[1] === 'openurl' && a[3].endsWith('/--/bag'),
  });
  let err;
  try { await runMobileCheck(opts({ modes: ['light', 'dark'] }), deps); } catch (e) { err = e; }
  assert.ok(err instanceof EnvError && /bag/.test(err.message));
  const cleanup = (e) => e[2] === 'shutdown' || e[2] === 'delete';
  const del = evIndex(events, (e) => e[0] === 'start' && cleanup(e));
  assert.ok(del >= 0, 'cleanup ran');
  assert.equal(events.filter((e) => e[0] === 'start' && e[2] === 'delete').length, 2);
  const lastU2 = events.map((e) => e[1] === U2 && !cleanup(e)).lastIndexOf(true);
  assert.ok(lastU2 >= 0 && lastU2 < del, `${lastU2} !< ${del}`);
  // device 1 ran its whole loop: the last U2 call is its final screenshot, not an early stop
  const names = err.partial.shots.map((s) => s.split('/').pop());
  assert.deepEqual(names.filter((n) => n.startsWith('iPhone-SE')), ['iPhone-SE-3rd-generation-home-light.png', 'iPhone-SE-3rd-generation-home-dark.png']);
  assert.equal(names.filter((n) => n.startsWith('iPhone-17')).length, 4);
  assert.ok(names.findIndex((n) => n.startsWith('iPhone-17')) > names.findIndex((n) => n.startsWith('iPhone-SE')));
  assert.ok(err.partial.notes.some((n) => /^failed: /.test(n)));
});

test('main: a mid-run failure exits 2 and prints the partial JSON on stdout', async () => {
  const dir = scratch();
  writeFileSync(join(dir, 'app.json'), JSON.stringify(appJson));
  writeFileSync(join(dir, 'routes.json'), JSON.stringify([{ name: 'home', path: '/' }, { name: 'bag', path: '/bag' }]));
  const { deps, opts } = parallelEnv({
    delayFor: (u) => (u === U2 ? 1 : 0),
    fail: (u, a) => u === U1 && a[1] === 'openurl' && a[3].endsWith('/--/bag'),
  });
  const proc = fakeProc();
  const check = (o, d) => runMobileCheck(opts({ modes: ['light'], routes: o.routes }), { ...deps, ...d });
  const cwd = process.cwd();
  process.chdir(dir);
  let code;
  try {
    code = await main(['--app', APP, '--routes', 'routes.json'], { check, proc });
  } finally {
    process.chdir(cwd);
  }
  assert.equal(code, 2);
  const partial = JSON.parse(proc.out.join(''));
  assert.deepEqual(Object.keys(partial).sort(), ['findings', 'notes', 'shots']);
  assert.equal(partial.shots.length, 3); // device 0: home; device 1: home, bag
  assert.ok(partial.notes.some((n) => /^failed: .*bag/.test(n)));
  assert.match(proc.err.join(''), /bag/);
});

// Task 3: readable hierarchy notes, glyph parts inside labelled controls
test('readHierarchy: non-zero exit note is one line, first stderr line only, no stdout JSON, 120 chars', async () => {
  const t = clock();
  const json = JSON.stringify(load('hierarchy-sample.json'));
  const long = 'x'.repeat(300);
  const r = await readHierarchy(fakeRun(() => ({ code: 124, stdout: json, stderr: `timeout after 60000ms ${long}\nsecond line` })), 'U', { sleep: t.sleep, now: t.now, timeoutMs: 3000, intervalMs: 3000 });
  assert.match(r.note, /^unverified: /);
  assert.ok(!r.note.includes('\n'));
  assert.ok(!r.note.includes('attributes'));
  assert.ok(!r.note.includes('second line'));
  assert.ok(r.note.includes('maestro hierarchy exited 124: timeout after 60000ms'));
  const reason = /exited 124: (x|t)[^(]*/.exec(r.note)[0].replace('exited 124: ', '');
  assert.ok(reason.trimEnd().length <= 120);
});

test('runMobileCheck: hierarchy note names device and route, one prefix', async () => {
  const json = JSON.stringify(load('hierarchy-sample.json'));
  const { deps, opts } = mkEnv((c, a) => {
    if (c === 'maestro' && a.includes('hierarchy')) return { code: 124, stdout: json, stderr: 'timeout after 60000ms\nmore' };
  });
  let t = 0;
  deps.sleep = async (ms) => { t += ms; };
  deps.now = () => t;
  const r = await runMobileCheck(opts({ modes: ['light'], devices: ['iPhone SE (3rd generation)'] }), deps);
  const n = r.notes.filter((x) => /hierarchy/.test(x) && /^unverified:/.test(x));
  assert.ok(n.length >= 1);
  for (const x of n) {
    assert.match(x, /^unverified: hierarchy on iPhone SE \(3rd generation\) \S+: maestro hierarchy exited 124: timeout after 60000ms/);
    assert.ok(!x.includes('\n') && !x.includes('attributes') && !/unverified:.*unverified:/.test(x));
  }
});

const node = (bounds, attrs = {}, children = []) => ({ attributes: { bounds, ...attrs }, children });
const treeOf = (...kids) => node('[0,0][390,844]', {}, [node('[0,0][390,844]', {}, kids)]);

test('findingsFromHierarchy: unlabelled glyph inside a labelled button gets no findings', () => {
  const t = treeOf(node('[10,100][130,144]', { accessibilityText: 'Add to bag' }, [node('[20,110][35,125]')]));
  assert.deepEqual(findingsFromHierarchy(t, { route: '/' }), []);
});

test('findingsFromHierarchy: unlabelled 30x30 with unlabelled ancestors is still flagged', () => {
  const t = treeOf(node('[10,100][130,144]', {}, [node('[20,110][50,140]')]));
  assert.deepEqual(pairs(findingsFromHierarchy(t, { route: '/' })), [['small-target', 'warn'], ['missing-label', 'warn']]);
});

test('findingsFromHierarchy: labelled ancestor with the app bounds does not hide a leaf', () => {
  const t = treeOf(node('[0,0][390,844]', { accessibilityText: 'Screen' }, [node('[20,110][50,140]')]));
  assert.deepEqual(pairs(findingsFromHierarchy(t, { route: '/' })), [['small-target', 'warn'], ['missing-label', 'warn']]);
});

// ---- final fix wave ----
test('F1: an unlabelled switch inside a labelled row still gives missing-label error', () => {
  const sw = node('[300,100][350,130]', {}, [node('[300,100][350,130]', { value: '1' })]);
  const t = treeOf(node('[10,90][380,134]', { accessibilityText: 'Notifications' }, [sw]));
  assert.deepEqual(pairs(findingsFromHierarchy(t, { route: '/' })), [['missing-label', 'error']]);
});

test('F3: both devices fail -> partial notes name both devices', async () => {
  const { deps, opts } = parallelEnv({ fail: (u, a) => a[1] === 'openurl' && a[3].endsWith('/--/bag') });
  let err;
  try { await runMobileCheck(opts({ modes: ['light'] }), deps); } catch (e) { err = e; }
  assert.ok(err);
  const n = err.partial.notes;
  assert.ok(n.some((x) => /^failed: .*bag/.test(x)));
  const extra = n.filter((x) => /^failed on /.test(x));
  assert.equal(extra.length, 1);
  assert.ok(!extra[0].includes('\n'));
  assert.match(extra[0], /^failed on iPhone (SE \(3rd generation\)|17 Pro Max): .*bag/);
  const first = n.find((x) => /^failed: /.test(x));
  assert.ok(first.includes(extra[0].includes('iPhone SE') ? '17-Pro-Max' : 'iPhone-SE'), 'the two notes name different devices');
});

const cmdJson = (entries) => JSON.stringify(entries);
const dbgFlow = (flow, dir, extra = '') => failingFlow(flow, `Running\n${extra}==== Debug output (logs & screenshots) ====\n${dir}\n`);
const mkDebug = (json) => {
  const droot = join(scratch(), '.maestro', 'tests');
  const dir = join(droot, '2026-10-29_9');
  mkdirSync(dir, { recursive: true });
  if (json !== undefined) writeFileSync(join(dir, 'commands-(flow.yaml).json'), json);
  return { droot, dir };
};

test('F4: no FAILED line + commands json names the failed command, selector and error', async () => {
  const flow = writeTmp('f4.yaml', 'x');
  const { droot, dir } = mkDebug(cmdJson([
    { command: { launchApp: {} }, metadata: { status: 'COMPLETED' } },
    { command: { tapOnElement: { selector: { textRegex: 'Xem giỏ' } } }, metadata: { status: 'FAILED', error: { message: 'Failed to connect to /127.0.0.1:57811' } } },
  ]));
  const { deps, opts } = mkEnv(dbgFlow(flow, dir));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), { ...deps, debugRoot: droot });
  const f = r.findings.filter((x) => x.rule === 'flow-failed');
  assert.equal(f.length, 1); // connection error is retried once, then fails again
  assert.match(f[0].message, /tapOnElement/);
  assert.match(f[0].message, /Xem giỏ/);
  assert.match(f[0].message, /Failed to connect to \/127\.0\.0\.1:57811/);
  assert.ok(!f[0].message.includes('\n'));
});

test('F4: error message is cut to 200 chars; malformed json falls back to the tail', async () => {
  const flow = writeTmp('f4b.yaml', 'x');
  const long = 'e'.repeat(500);
  let d = mkDebug(cmdJson([{ command: { assertVisible: { selector: { idRegex: 'cart' } } }, metadata: { status: 'FAILED', error: { message: long } } }]));
  let e = mkEnv(dbgFlow(flow, d.dir));
  let r = await runMobileCheck(e.opts({ modes: ['light'], flow }), { ...e.deps, debugRoot: d.droot });
  let m = r.findings.find((x) => x.rule === 'flow-failed').message;
  assert.match(m, /assertVisible/);
  assert.match(m, /cart/);
  assert.ok(m.includes('e'.repeat(200)) && !m.includes('e'.repeat(201)));
  d = mkDebug('{not json');
  e = mkEnv(dbgFlow(flow, d.dir));
  r = await runMobileCheck(e.opts({ modes: ['light'], flow }), { ...e.deps, debugRoot: d.droot });
  m = r.findings.find((x) => x.rule === 'flow-failed').message;
  assert.match(m, /Debug output/);
});

const CONNECT = 'Failed to connect to /127.0.0.1:57811';
const flowTests = (run) => run.calls.filter(([c, a]) => c === 'maestro' && a[2] === 'test' && a[3].endsWith('f5.yaml')).length;

test('F5: a connection error then success -> no finding, a note, 2 flow runs, app root reopened', async () => {
  const flow = writeTmp('f5.yaml', 'x');
  let n = 0;
  const { run, deps, opts } = mkEnv((c, a) => (c === 'maestro' && a[2] === 'test' && a[3] === flow && ++n === 1 ? { code: 1, stdout: CONNECT, stderr: '' } : undefined));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), deps);
  assert.equal(r.findings.filter((x) => x.rule === 'flow-failed').length, 0);
  assert.ok(r.notes.includes('flow retried once: maestro driver connection dropped'));
  assert.equal(flowTests(run), 2);
  const calls = run.calls.map(([c, a]) => (c === 'maestro' && a[3] === flow ? 'flow' : a[1] === 'openurl' && a[3] === `${APP}/--/` ? 'root' : null)).filter(Boolean);
  assert.deepEqual(calls.slice(-4), ['root', 'flow', 'root', 'flow']);
});

test('F5: a connection error twice -> one flow-failed finding and the note', async () => {
  const flow = writeTmp('f5.yaml', 'x');
  const { run, deps, opts } = mkEnv(failingFlow(flow, `Connection refused`));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), deps);
  assert.equal(r.findings.filter((x) => x.rule === 'flow-failed').length, 1);
  assert.ok(r.notes.includes('flow retried once: maestro driver connection dropped'));
  assert.equal(flowTests(run), 2);
});

test('F5: an ordinary step failure is not retried', async () => {
  const flow = writeTmp('f5.yaml', 'x');
  const { run, deps, opts } = mkEnv(failingFlow(flow, 'Tap on "Buy"... FAILED'));
  const r = await runMobileCheck(opts({ modes: ['light'], flow }), deps);
  assert.equal(r.findings.filter((x) => x.rule === 'flow-failed').length, 1);
  assert.ok(!r.notes.some((x) => /retried/.test(x)));
  assert.equal(flowTests(run), 1);
});

test('F5: the failing step error in the commands json also triggers the retry', async () => {
  const flow = writeTmp('f5.yaml', 'x');
  const { dir, droot } = mkDebug(cmdJson([{ command: { tapOnElement: { selector: { textRegex: 'x' } } }, metadata: { status: 'FAILED', error: { message: CONNECT } } }]));
  const { run, deps, opts } = mkEnv(dbgFlow(flow, dir));
  await runMobileCheck(opts({ modes: ['light'], flow }), { ...deps, debugRoot: droot });
  assert.equal(flowTests(run), 2);
});

test('M1: readHierarchy clock starts after the first run returns', async () => {
  const t = clock();
  let n = 0;
  const run = fakeRun(() => { if (++n === 1) t.ms += 100000; return ok(''); });
  await readHierarchy(run, 'U', { sleep: t.sleep, now: t.now, timeoutMs: 9000, intervalMs: 3000 });
  assert.equal(run.calls.length, 4);
});

test('M2: once aborted, a queued maestro command is not run', async () => {
  let aborted = false;
  const t = clock();
  const { run, deps, opts } = mkEnv((c, a) => {
    if (c === 'maestro' && a[2] === 'test') aborted = true;
  });
  await runMobileCheck(opts({ modes: ['light'], devices: ['iPhone 17 Pro Max'], routes: [{ name: 'home', path: '/' }] }), { ...deps, isAborted: () => aborted, sleep: t.sleep, now: t.now });
  assert.ok(!run.calls.some(([c, a]) => c === 'maestro' && a.includes('hierarchy')));
});

test('M9: a failing root open before a route names the app root, the route and the sim', async () => {
  const { deps, opts } = mkEnv((c, a) => (a[1] === 'openurl' && a[3] === `${APP}/--/` ? { code: 1, stdout: '', stderr: 'no root' } : undefined));
  await assert.rejects(runMobileCheck(opts({ modes: ['light'], devices: ['iPhone 17 Pro Max'], routes: [{ name: 'shop', path: '/shop' }] }), deps),
    (e) => /^Opening the app root before route "shop" on .+ failed: no root/.test(e.message));
});

// ---- Task 2: native mode (SwiftUI and other native iOS apps) ----
const BUNDLE = 'vn.yurihandmade.swiftui';
const nativeRoutes = [{ name: 'home', args: [] }, { name: 'bag', args: ['-screen', 'bag', '-seed'] }];
const appDir = () => { const d = join(scratch(), 'YuriHandmade.app'); mkdirSync(d); return d; };
function nativeEnv(extra = () => undefined) {
  const env = mkEnv((c, a, o) => {
    if (c === 'plutil') return ok(`${BUNDLE}\n`);
    return extra(c, a, o);
  });
  const appPath = appDir();
  const fetchImpl = async () => { throw new Error('fetch must not be called in native mode'); };
  const opts = (o = {}) => ({ ...env.opts({ routes: nativeRoutes, ...o }), app: undefined, native: BUNDLE, appPath, appJson: undefined, pkgJson: undefined });
  return { ...env, appPath, deps: { ...env.deps, fetchImpl }, opts };
}

test('native parseArgs: both flags work, Expo defaults keep their exact keys', () => {
  const a = parseArgs(['--native', BUNDLE, '--app-path', '/b/Y.app']);
  assert.equal(a.native, BUNDLE);
  assert.equal(a.appPath, '/b/Y.app');
  assert.equal(a.app, null);
  assert.ok(!('native' in parseArgs(['--app', APP])));
});

test('native parseArgs: needs both flags, and not --app; exactly one mode', () => {
  assert.match(parseArgs(['--native', BUNDLE]).error, /--app-path/);
  assert.match(parseArgs(['--app-path', '/b/Y.app']).error, /--native/);
  assert.match(parseArgs(['--app', APP, '--native', BUNDLE, '--app-path', '/b/Y.app']).error, /--app.*--native|cannot/);
  assert.match(parseArgs([]).error, /one of --app .* or --native/);
  assert.match(parseArgs(['--native']).error, /--native needs a value/);
});

test('native usage: the usage line gains the native form on exit 2', async () => {
  let err = '';
  const proc = { on() {}, stderr: { write: (t) => { err += t; } }, stdout: { write() {} }, exit() {} };
  assert.equal(await main([], { proc }), 2);
  assert.match(err, /check-mobile\.mjs --native <bundle id> --app-path <App\.app> \[same options\]/);
});

test('native loadRoutes: args required as an array of strings; path optional and ignored', async () => {
  const ok1 = await loadRoutes(writeTmp('n1.json', [{ name: 'home', args: [] }, { name: 'bag', path: '/x', args: ['-screen', 'bag'], sameAs: 'home' }]), 'native');
  assert.deepEqual(ok1, [{ name: 'home', args: [] }, { name: 'bag', args: ['-screen', 'bag'], sameAs: 'home' }]);
  await assert.rejects(loadRoutes(writeTmp('n2.json', [{ name: 'a', path: '/' }]), 'native'), (e) => e instanceof EnvError && /"a"/.test(e.message) && /args/.test(e.message));
  await assert.rejects(loadRoutes(writeTmp('n3.json', [{ name: 'a', args: ['-x', 3] }]), 'native'), (e) => e instanceof EnvError && /args/.test(e.message) && /string/.test(e.message));
  await assert.rejects(loadRoutes(writeTmp('n4.json', [{ name: 'a', args: '-x' }]), 'native'), (e) => e instanceof EnvError && /args/.test(e.message));
});

test('native loadRoutes: Expo mode still requires path and ignores args', async () => {
  await assert.rejects(loadRoutes(writeTmp('n5.json', [{ name: 'a', args: [] }])), /path/);
  assert.deepEqual(await loadRoutes(writeTmp('n6.json', [{ name: 'a', path: '/', args: 5 }])), [{ name: 'a', path: '/' }]);
});

test('native preflight: no fetch, plutil reads Info.plist, bundle id matches', async () => {
  const appPath = appDir();
  const run = okRun((c) => (c === 'plutil' ? ok(`${BUNDLE}\n`) : undefined));
  const r = await preflight({ run, native: BUNDLE, appPath, fetchImpl: async () => { throw new Error('fetch called'); }, cwd: CWD });
  assert.deepEqual(r.notes, []);
  assert.deepEqual(run.calls.find(([c]) => c === 'plutil'), ['plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', join(appPath, 'Info.plist')]]);
});

test('native preflight: missing app and wrong bundle id are EnvErrors naming both ids', async () => {
  const nofetch = async () => { throw new Error('fetch called'); };
  await assert.rejects(preflight({ run: okRun(), native: BUNDLE, appPath: join(scratch(), 'Nope.app'), fetchImpl: nofetch, cwd: CWD }),
    (e) => e instanceof EnvError && /Nope\.app/.test(e.message));
  const appPath = appDir();
  await assert.rejects(preflight({ run: okRun((c) => (c === 'plutil' ? ok('com.other.app\n') : undefined)), native: BUNDLE, appPath, fetchImpl: nofetch, cwd: CWD }),
    (e) => e instanceof EnvError && e.message.includes('com.other.app') && e.message.includes(BUNDLE));
  await assert.rejects(preflight({ run: okRun((c) => (c === 'plutil' ? { code: 1, stdout: '', stderr: 'no plist' } : undefined)), native: BUNDLE, appPath, fetchImpl: nofetch, cwd: CWD }),
    (e) => e instanceof EnvError && /Info\.plist/.test(e.message));
});

test('native setup: status bar, then install of the app path; no Expo Go, no onboarding, no first-open flow, no download', async () => {
  const { run, deps, opts, appPath } = nativeEnv();
  await runMobileCheck(opts({ modes: ['light'], devices: ['iPhone 17 Pro Max'] }), deps);
  const steps = run.calls.filter(([, a]) => a[2] === U1).map(stepOf);
  assert.deepEqual(steps.slice(2, 4), ['status_bar', 'install']);
  assert.deepEqual(sub(run.calls, 'install')[0][1], ['simctl', 'install', U1, appPath]);
  assert.ok(!JSON.stringify(run.calls).includes('host.exp.Exponent'));
  assert.equal(sub(run.calls, 'spawn').length, 0);
  assert.equal(sub(run.calls, 'openurl').length, 0);
  assert.equal(run.calls.filter(([c, a]) => c === 'maestro' && a.includes('test')).length, 0);
});

test('native open: terminate the bundle, then launch with the args; route with empty args launches bare', async () => {
  const { run, deps, opts } = nativeEnv();
  const r = await runMobileCheck(opts({ modes: ['light'], devices: ['iPhone 17 Pro Max'] }), { ...deps, read: async (f) => Buffer.from(String(f)) });
  assert.equal(r.shots.length, 2);
  const seq = run.calls.filter(([, a]) => a[1] === 'terminate' || a[1] === 'launch').map(([, a]) => a.slice(1));
  assert.deepEqual(seq, [
    ['terminate', U1, BUNDLE], ['launch', U1, BUNDLE],
    ['terminate', U1, BUNDLE], ['launch', U1, BUNDLE, '-screen', 'bag', '-seed'],
  ]);
  const i = run.calls.findIndex(([, a]) => a[1] === 'launch');
  assert.deepEqual(run.calls[i - 1][1].slice(0, 2), ['simctl', 'terminate']);
});

test('native retry: a route with empty args prints (no args)', async () => {
  const { deps, opts } = nativeEnv();
  const sleep = async () => {};
  const routes = [{ name: 'bag', args: ['-screen', 'bag'] }, { name: 'home', args: [] }];
  const r = await runMobileCheck(opts({ modes: ['light'], devices: ['iPhone 17 Pro Max'], routes }), { ...deps, sleep, read: async () => Buffer.from('same') });
  const f = r.findings.filter((x) => x.rule === 'route-not-navigated');
  assert.equal(f.length, 1);
  assert.ok(f[0].message.startsWith('home (no args) on'), f[0].message);
});

test('native retry: identical shots relaunch once with the long wait and report route-not-navigated with launch-argument wording', async () => {
  const waits = [];
  const { run, deps, opts } = nativeEnv();
  const sleep = async (ms) => { waits.push(ms); };
  const r = await runMobileCheck(opts({ modes: ['light'], devices: ['iPhone 17 Pro Max'] }), { ...deps, sleep, read: async () => Buffer.from('same') });
  const f = r.findings.filter((x) => x.rule === 'route-not-navigated');
  assert.equal(f.length, 1);
  assert.equal(f[0].route, 'bag');
  assert.equal(f[0].message, 'bag (args: -screen bag -seed) on iPhone 17 Pro Max light shows the same screen as home; the app ignored the launch arguments or was still loading; see swiftui.md "How to check"');
  assert.equal(sub(run.calls, 'launch').filter(([, a]) => a.includes('-screen')).length, 2);
  assert.ok(waits.includes(ROOT_WAIT_LONG.minMs) || Math.max(...waits) >= ROOT_WAIT_LONG.minMs - 1500);
});

test('native retry: different shot on the retry gives no finding', async () => {
  const { deps, opts } = nativeEnv();
  let n = 0;
  const r = await runMobileCheck(opts({ modes: ['light'], devices: ['iPhone 17 Pro Max'] }), { ...deps, read: async () => Buffer.from(++n <= 2 ? 'same' : `diff${n}`) });
  assert.equal(r.findings.filter((x) => x.rule === 'route-not-navigated').length, 0);
});

test('native launch failure names the route and its args', async () => {
  const { deps, opts } = nativeEnv((c, a) => (a[1] === 'launch' && a.includes('-screen') ? { code: 1, stdout: '', stderr: 'launch boom' } : undefined));
  await assert.rejects(runMobileCheck(opts({ modes: ['light'], devices: ['iPhone 17 Pro Max'] }), deps), (e) => e instanceof EnvError && /bag/.test(e.message) && /launch boom/.test(e.message));
});

test('native flow: terminate then launch with no args right before maestro test; hierarchy still read', async () => {
  const flow = writeTmp('nflow.yaml', 'appId: x');
  const { run, deps, opts } = nativeEnv();
  await runMobileCheck(opts({ modes: ['light'], flow }), deps);
  const i = run.calls.findIndex(([c, a]) => c === 'maestro' && a[2] === 'test' && a[3] === flow);
  assert.ok(i > 2);
  assert.deepEqual(run.calls[i - 2][1], ['simctl', 'terminate', run.calls[i][1][1], BUNDLE]);
  assert.deepEqual(run.calls[i - 1][1], ['simctl', 'launch', run.calls[i][1][1], BUNDLE]);
  assert.ok(run.calls.some(([c, a]) => c === 'maestro' && a.includes('hierarchy')));
  assert.ok(!JSON.stringify(run.calls).includes('openurl'));
});

test('native --video: recordVideo starts after the terminate and before the launch', async () => {
  const { run, out, deps, opts } = nativeEnv(recorder());
  const r = await runMobileCheck(opts({ video: true, modes: ['light'], routes: [{ name: 'bag', args: ['-screen', 'bag'] }] }), deps);
  const steps = run.calls.filter(([, a]) => a[2] === U1).map(stepOf);
  const rec = steps.indexOf('io:recordVideo');
  assert.deepEqual(steps.slice(rec - 1, rec + 3), ['terminate', 'io:recordVideo', 'launch', 'io:screenshot']);
  assert.ok(r.notes.includes(`video: ${join(out, 'iPhone-SE-3rd-generation-bag.mp4')}`));
});

test('native --keep: deletes nothing and lists the kept simulators', async () => {
  const { run, deps, opts } = nativeEnv();
  const r = await runMobileCheck(opts({ keep: true, modes: ['light'] }), deps);
  assert.equal(sub(run.calls, 'delete').length, 0);
  assert.ok(r.notes.some((n) => n === `kept: iPhone SE (3rd generation) ${U1}` || n.startsWith('kept: ')));
});

test('native main: no app.json needed; routes load in native mode', async () => {
  const rf = writeTmp('nr.json', nativeRoutes);
  let got;
  const proc = { on() {}, stderr: { write() {} }, stdout: { write() {} }, exit() {} };
  const prev = process.cwd();
  process.chdir(scratch());
  try {
    const code = await main(['--native', BUNDLE, '--app-path', '/x/Y.app', '--routes', rf], { check: async (o) => { got = o; return { shots: [], findings: [], notes: [] }; }, proc });
    assert.equal(code, 0);
  } finally {
    process.chdir(prev);
  }
  assert.equal(got.native, BUNDLE);
  assert.deepEqual(got.routes[1].args, ['-screen', 'bag', '-seed']);
});

// Native (SwiftUI) hierarchy: the fixture is trimmed from the real `maestro hierarchy` of the dogfood product screen.
// Nodes marked "_synthetic": true are added for the still-flagged cases; everything else is real.
const swiftui = () => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'hierarchy-swiftui.json'), 'utf8'));
const nat = () => findingsFromHierarchy(swiftui(), { route: 'product', native: true });
const at = (f, bounds) => f.filter((x) => x.bounds === bounds).map((x) => x.rule);

test('native hierarchy: a plain Text leaf (the product title) gives no finding', () => {
  assert.deepEqual(at(nat(), '[16,502][268,534]'), []);
});

test('native hierarchy: the SF Symbol inside the 370x52 button gives no finding', () => {
  assert.deepEqual(at(nat(), '[140,798][156,814]'), []);
  assert.deepEqual(at(nat(), '[166,797][259,815]'), []);
});

test('native hierarchy: synthetic unlabelled 30x30 leaf with no labelled ancestor is still flagged', () => {
  assert.deepEqual(at(nat(), '[20,300][50,330]').sort(), ['missing-label', 'small-target']);
});

test('native hierarchy: synthetic 24x24 icon with a resource-id and no 44x44 labelled ancestor is still flagged', () => {
  assert.deepEqual(at(nat(), '[60,300][84,324]').sort(), ['missing-label', 'small-target']);
  const t = treeOf(node('[10,100][40,130]', { accessibilityText: 'Card' }, [node('[15,105][31,121]', { accessibilityText: 'Star', 'resource-id': 'star' })]));
  assert.deepEqual(findingsFromHierarchy(t, { route: '/', native: true }).map((x) => x.rule), ['small-target']); // ancestor under 44x44
});

test('native hierarchy: the real "Selected" icon leaf with no labelled ancestor is still flagged', () => {
  assert.deepEqual(at(nat(), '[17,712][31,726]'), ['small-target']);
});

test('native hierarchy: expo mode on the same fixture gives today\'s findings', () => {
  const f = findingsFromHierarchy(swiftui(), { route: 'product' });
  assert.equal(f.length, 7);
  assert.deepEqual(f.map((x) => x.bounds), ['[16,502][268,534]', '[17,712][31,726]', '[140,798][156,814]', '[20,300][50,330]', '[20,300][50,330]', '[60,300][84,324]', '[60,300][84,324]']);
  assert.deepEqual(findingsFromHierarchy(swiftui(), { route: 'product', native: false }), f);
});

const NATIVE_NOTE = 'native hierarchy: iOS reports no control roles, so small-target covers icons and unlabelled controls not inside a labelled element; check text buttons and controls on cards by eye';
const swiftuiHier = (c, a) => (c === 'maestro' && a.includes('hierarchy') ? ok(JSON.stringify(swiftui())) : undefined);

test('native hierarchy: no note when the hierarchy read failed', async () => {
  const n = nativeEnv((c, a) => (c === 'maestro' && a.includes('hierarchy') ? { code: 1, stdout: '', stderr: 'boom' } : undefined));
  const r = await runMobileCheck(n.opts({ modes: ['light'] }), n.deps);
  assert.ok(!r.notes.includes(NATIVE_NOTE));
});

test('native hierarchy: check-mobile filters in native mode and adds the note once; expo mode has neither', async () => {
  const n = nativeEnv(swiftuiHier);
  const r = await runMobileCheck(n.opts({ modes: ['light'] }), n.deps);
  assert.equal(r.notes.filter((x) => x === NATIVE_NOTE).length, 1);
  assert.equal(r.findings.length, 10); // 2 routes x 5: Selected small-target + 2 synthetic leaves x (small-target, missing-label)
  assert.ok(!r.findings.some((f) => f.bounds === '[16,502][268,534]'));
  const e = mkEnv(swiftuiHier);
  const re = await runMobileCheck(e.opts({ modes: ['light'] }), e.deps);
  assert.ok(!re.notes.includes(NATIVE_NOTE));
  assert.ok(re.findings.some((f) => f.bounds === '[16,502][268,534]'));
});

// ---- Android (--platform android) ----
const ADB = '/sdk/platform-tools/adb';
const AVDM = '/sdk/cmdline-tools/latest/bin/avdmanager';
const ATOOLS = { adb: ADB, avdmanager: AVDM, emulator: '/sdk/emulator/emulator' };
const EXPO_ANDROID = 'host.exp.exponent';
const READY_CMD = 'uiautomator dump /sdcard/uix-ui.xml >/dev/null 2>&1 && cat /sdcard/uix-ui.xml';
const xnode = (a) => `<node ${Object.entries({ package: EXPO_ANDROID, clickable: 'false', 'content-desc': '', text: '', bounds: '[0,0][10,10]', ...a }).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`;
const READY_XML = `<hierarchy>${xnode({ clickable: 'true', 'content-desc': 'Shop' })}</hierarchy>`;
const SPLASH_XML = `<hierarchy>${xnode({ text: 'Yuri' })}</hierarchy>`;
const TOOLS_XML = `<hierarchy>${xnode({ clickable: 'true', 'content-desc': 'Tools', bounds: '[100,100][200,200]' })}${xnode({ clickable: 'true', 'content-desc': 'Shop' })}</hierarchy>`;
const CONTINUE_XML = `<hierarchy>${xnode({ text: 'Continue', clickable: 'true', bounds: '[100,100][200,200]' })}${xnode({ clickable: 'true', 'content-desc': 'Shop' })}</hierarchy>`;
const AAPP = 'exp://192.168.1.20:8081';
const afterSerial = (a) => a.slice(2); // adb args after -s <serial>
const androidTree = { attributes: { bounds: '[0,0][720,1280]' }, children: [{ attributes: { bounds: '[0,0][720,1280]', accessibilityText: 'app' }, children: [
  { attributes: { bounds: '[10,10][70,70]', clickable: 'true', class: 'android.widget.Button', accessibilityText: 'Small' }, children: [] },
] }] };

function androidEnv(extra = () => undefined, fetchOpts = {}) {
  const live = new Set();
  const state = { spawns: [], ports: 0 };
  const run = fakeRun((c, a, o) => {
    const r = extra(c, a, o);
    if (r) return r;
    if (c === ADB && a[0] === 'version') return ok('Android Debug Bridge version 1.0.41\n');
    if (c === 'maestro' && a[0] === '--version') return ok('2.6.1\n');
    if (c === 'maestro' && a.includes('hierarchy')) return ok(JSON.stringify(androidTree));
    if (c === ADB && a[0] === 'devices') return ok(`List of devices attached\n${[...live].map((x) => `${x}\tdevice`).join('\n')}\n`);
    if (c === ADB && a[2] === 'shell' && a[3] === READY_CMD) return ok(READY_XML);
    if (c === ADB && a[2] === 'wait-for-device') { live.add(a[1]); return ok(); }
    if (c === ADB && a[2] === 'emu' && a[3] === 'kill') { live.delete(a[1]); return ok(); }
    if (c === ADB && a[2] === 'shell') {
      if (a[3] === 'getprop') return ok('1\n');
      if (a[3] === 'wm') return ok('Physical density: 320\n');
      if (a[3] === 'dumpsys') return ok(`  topResumedActivity=ActivityRecord{1 u0 ${EXPO_ANDROID}/.experience.ExperienceActivity t5}\n`);
      if (a[3] === 'uiautomator') return ok();
      if (a[3] === 'cat') return ok('<hierarchy></hierarchy>');
    }
    return undefined;
  });
  const out = scratch();
  const spawn = (cmd, args) => { const ch = { kill() {}, once() {}, unref() {} }; state.spawns.push([cmd, args]); return ch; };
  const readdir = async (p) => {
    if (p === '/sdk/system-images') return ['android-35'];
    if (p === '/sdk/system-images/android-35/google_apis') return ['arm64-v8a'];
    throw new Error('ENOENT');
  };
  const deps = {
    run, sleep: async () => {}, fetchImpl: fakeFetch(fetchOpts), read: async (f) => Buffer.from(String(f)), log: () => {}, cacheRoot: scratch(), tmpRoot: scratch(), cwd: CWD,
    sdk: '/sdk', tools: ATOOLS, spawn, readdir, arch: 'arm64', adbDevices: async () => [...live], logDir: scratch(),
  };
  const opts = (o = {}) => ({
    app: AAPP, platform: 'android', routes: [{ name: 'home', path: '/' }, { name: 'bag', path: '/bag' }], devices: null, modes: ['light', 'dark', 'xxxl'],
    out, video: false, flow: null, keep: false, appJson, pkgJson: { dependencies: { expo: '~58.0.20' } }, ...o,
  });
  return { run, out, deps, opts, state, live };
}
const adbCalls = (run) => run.calls.filter(([c]) => c === ADB);
const adbOf = (run, serial) => adbCalls(run).filter(([, a]) => a[0] === '-s' && a[1] === serial).map(([, a]) => afterSerial(a));
const shellHas = (list, ...w) => list.filter((a) => a[0] === 'shell' && w.every((x, i) => a[1 + i] === x));

test('android parseArgs: --platform value, ios default untouched, native is an error', () => {
  assert.equal(parseArgs(['--app', AAPP, '--platform', 'android']).platform, 'android');
  assert.equal(parseArgs(['--app', AAPP, '--platform', 'ios']).platform, 'ios');
  assert.match(parseArgs(['--app', AAPP, '--platform', 'windows']).error, /--platform must be ios or android/);
  assert.match(parseArgs(['--app', AAPP, '--platform']).error, /needs a value/);
  assert.equal(parseArgs(['--platform', 'android', '--native', 'com.x', '--app-path', 'X.app']).error, '--platform android supports Expo apps (--app) only; native Android apps are not supported yet');
  assert.equal(parseArgs(['--app', AAPP]).platform, undefined);
});

test('android usage: the usage line shows --platform ios|android', async () => {
  let err = '';
  const proc = { on() {}, stderr: { write: (t) => { err += t; } }, stdout: { write() {} }, exit() {} };
  assert.equal(await main([], { proc }), 2);
  assert.match(err, /\[--platform ios\|android\]/);
});

test('android preflight: adb version with the SDK adb, no xcode, maestro note as on iOS', async () => {
  const run = fakeRun((c, a) => (c === 'maestro' ? { code: 127, stdout: '', stderr: 'ENOENT' } : undefined));
  const f = fakeFetch();
  const r = await preflight({ run, app: AAPP, appJson, fetchImpl: f, cwd: CWD, platform: 'android', adb: ADB });
  assert.deepEqual(r.notes, ['maestro missing: hierarchy and flow checks skipped, not a success run']);
  assert.deepEqual(run.calls[0], [ADB, ['version']]);
  assert.ok(!run.calls.some(([c]) => c === 'xcrun' || c === 'xcode-select'));
  assert.equal(f.calls.find(([u]) => u === 'http://192.168.1.20:8081/')[1].headers['expo-platform'], 'android');
  await assert.rejects(preflight({ run: fakeRun((c) => (c === ADB ? { code: 1, stdout: '', stderr: 'nope' } : undefined)), app: AAPP, appJson, fetchImpl: f, cwd: CWD, platform: 'android', adb: ADB }),
    (e) => e instanceof EnvError && /adb/.test(e.message));
});

test('android run: no xcrun, AVD create/boot/delete, per device install + reverse + status bar, 127.0.0.1 URLs, device-name files', async () => {
  const env = androidEnv();
  const r = await runMobileCheck(env.opts({ modes: ['light'] }), env.deps);
  assert.ok(!env.run.calls.some(([c]) => c === 'xcrun' || c === 'xcode-select' || c === 'plutil'));
  const creates = env.run.calls.filter(([c, a]) => c === 'sh' && a[1].includes(' create avd '));
  assert.equal(creates.length, 2);
  assert.match(creates[0][1][1], /-n 'uix-Small-Phone-/);
  assert.match(creates[1][1][1], /-n 'uix-Pixel-9-Pro-XL-/);
  assert.equal(env.state.spawns.length, 2);
  const serials = ['emulator-5600', 'emulator-5602'];
  for (const sv of serials) {
    const a = adbOf(env.run, sv);
    assert.ok(a.some((x) => x[0] === 'install' && x[1] === '-r' && x[2].endsWith('uix-expo-go-android-58.apk')));
    assert.ok(a.some((x) => x.join(' ') === 'reverse tcp:8081 tcp:8081'));
    assert.ok(shellHas(a, 'settings', 'put', 'global').length >= 1);
    assert.ok(a.some((x) => x.join(' ').includes('command clock')) || a.some((x) => x.includes('clock')));
    const urls = a.filter((x) => x[0] === 'shell' && x.includes('-d')).map((x) => x[x.indexOf('-d') + 1]);
    assert.deepEqual([...new Set(urls)].sort(), ["'exp://127.0.0.1:8081/--/'", "'exp://127.0.0.1:8081/--/bag'"]);
  }
  assert.ok(!JSON.stringify(env.run.calls).includes('192.168.1.20:8081/--'));
  assert.deepEqual(r.shots.map((f) => f.slice(env.out.length + 1)), [
    'Small-Phone-home-light.png', 'Small-Phone-bag-light.png', 'Pixel-9-Pro-XL-home-light.png', 'Pixel-9-Pro-XL-bag-light.png',
  ]);
  // every adb call that is not `devices` or `version` names a serial of this run
  for (const [, a] of adbCalls(env.run)) if (!['devices', 'version'].includes(a[0])) assert.ok(serials.includes(a[1]) && a[0] === '-s', a.join(' '));
  // deleted at the end: emu kill then avdmanager delete, uix- only
  const dels = env.run.calls.filter(([c]) => c === AVDM);
  assert.equal(dels.length, 2);
  assert.ok(dels.every(([, a]) => a[0] === 'delete' && a[2] === '-n' && a[3].startsWith('uix-')));
  assert.equal(adbCalls(env.run).filter(([, a]) => a[2] === 'emu' && a[3] === 'kill').length, 2);
});

test('android run: --keep keeps the AVDs and says so; deletes nothing', async () => {
  const env = androidEnv();
  const r = await runMobileCheck(env.opts({ modes: ['light'], keep: true, routes: [{ name: 'home', path: '/' }] }), env.deps);
    assert.equal(env.run.calls.filter(([c, a]) => c === AVDM).length, 0);
  assert.equal(adbCalls(env.run).filter(([, a]) => a[2] === 'emu' && a[3] === 'kill').length, 0);
  assert.equal(r.notes.filter((n) => /^kept: uix-/.test(n)).length, 2);
  assert.ok(r.notes.some((n) => /^kept: uix-Small-Phone-.* emulator-5600$/.test(n)));
});

test('android run: a failed Tools toggle is tried once per device and noted once', async () => {
  const env = androidEnv((c, a) => (c === ADB && a[3] === READY_CMD ? ok(TOOLS_XML) : undefined));
  const r = await runMobileCheck(env.opts({ modes: ['light'] }), env.deps);
  const a = adbOf(env.run, 'emulator-5600');
  assert.ok(a.filter((x) => x[0] === 'shell' && x[1] === 'input' && x[2] === 'keyevent' && x[3] === '82').length === 1); // tried once, not again on the second route
  assert.equal(r.notes.filter((n) => n === 'unverified: Expo Go Tools button still showing on Small Phone').length, 1);
  assert.equal(r.notes.filter((n) => n === 'unverified: Expo Go Tools button still showing on Pixel 9 Pro XL').length, 1);
});

test('android run: a Continue sheet that shows up on a later open is tapped there', async () => {
  const opened = new Map();
  const env = androidEnv((c, a) => {
    if (c === ADB && a[3] === READY_CMD) {
      const n = (opened.get(a[1]) ?? 0) + 1;
      opened.set(a[1], n);
      return ok(n === 3 ? CONTINUE_XML : READY_XML);
    }
    return undefined;
  });
  const r = await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light', 'dark'], routes: [{ name: 'home', path: '/' }, { name: 'bag', path: '/bag' }] }), env.deps);
  const a = adbOf(env.run, 'emulator-5600');
  const taps = a.filter((x) => x[0] === 'shell' && x[1] === 'input' && x[2] === 'tap');
  assert.equal(taps.length, 1);
  assert.deepEqual(taps[0].slice(3), ['150', '150']);
  assert.ok(!r.notes.some((n) => /Continue/.test(n)));
  assert.ok(a.findIndex((x) => x[1] === 'input') > a.findIndex((x) => x.includes('-d'))); // after an open
});

test('android run: night mode and font scale change before the open; status bar re-sent after every font scale change', async () => {
  const env = androidEnv();
  await runMobileCheck(env.opts({ devices: ['Small Phone'], routes: [{ name: 'home', path: '/' }] }), env.deps);
  const a = adbOf(env.run, 'emulator-5600');
  const tag = (x) => {
    const j = x.join(' ');
    if (j.includes('uimode night yes')) return 'dark';
    if (j.includes('uimode night no')) return 'light';
    if (/font_scale 2$/.test(j)) return 'big';
    if (/font_scale 1$/.test(j)) return 'reset';
    if (j.includes('command clock')) return 'bar';
    if (x[0] === 'shell' && x[1] === 'am' && x[2] === 'start') return 'open';
    if (j.includes('screencap')) return 'shot';
    return null;
  };
  const seq = a.map(tag).filter(Boolean);
  const from = seq.indexOf('light', seq.indexOf('open') + 1); // after the first-open
  const loop = seq.slice(from).join(' ');
  assert.match(loop, /^light open (shot )+dark open (shot )+light big bar open (shot )+reset bar/);
  assert.ok(!/(open (?:dark|big|reset))/.test(seq.join(' ')));
});

test('android run: font scale returns to 1.0 (and the bar again) after a failure in the xxxl open', async () => {
  let opens = 0;
  const env = androidEnv((c, a) => {
    if (c === ADB && a[3] === 'dumpsys') { opens++; return opens > 1 ? ok('  topResumedActivity=com.other/.Main\n') : undefined; }
    return undefined;
  });
  const o = env.opts({ devices: ['Small Phone'], modes: ['xxxl'], routes: [{ name: 'home', path: '/' }] });
  await assert.rejects(runMobileCheck(o, env.deps), (e) => e instanceof EnvError && /Opening route "home"/.test(e.message));
  const j = adbOf(env.run, 'emulator-5600').map((x) => x.join(' '));
  const big = j.findIndex((x) => /font_scale 2$/.test(x));
  const reset = j.findIndex((x) => /font_scale 1$/.test(x));
  assert.ok(big >= 0 && reset > big);
  assert.ok(j.slice(reset + 1).some((x) => x.includes('command clock')));
  assert.equal(adbCalls(env.run).filter(([, a]) => a[2] === 'emu' && a[3] === 'kill').length, 1); // still cleaned up
});

test('android run: density from wm density goes to the hierarchy findings (dp, 48)', async () => {
  const env = androidEnv();
  const r = await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light'], routes: [{ name: 'home', path: '/' }] }), env.deps);
  assert.ok(adbOf(env.run, 'emulator-5600').some((x) => x.join(' ') === 'shell wm density'));
  const f = r.findings.find((x) => x.rule === 'small-target');
  assert.ok(f, JSON.stringify(r.findings));
  assert.match(f.message, /30x30 dp is under 48x48/);
  assert.ok(env.run.calls.some(([c, a]) => c === 'maestro' && a.join(' ') === '--device emulator-5600 hierarchy'));
});

test('android run: --video adds the note and records nothing', async () => {
  const env = androidEnv();
  const r = await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light'], video: true, routes: [{ name: 'home', path: '/' }] }), env.deps);
  assert.ok(r.notes.includes('video: not supported on Android yet'));
  assert.ok(!r.notes.some((n) => /^video: \//.test(n)));
  assert.ok(!JSON.stringify(env.run.calls).includes('screenrecord'));
});

test('android run: --flow runs a temp copy with appId host.exp.exponent and says so', async () => {
  const flow = writeTmp('f.yaml', 'appId: host.exp.Exponent\n---\n- tapOn: "Shop"\n');
  let copy = null;
  const env = androidEnv((c, a) => {
    if (c === 'maestro' && a[2] === 'test') { copy = { file: a[3], text: readFileSync(a[3], 'utf8') }; return ok(); }
    return undefined;
  });
  const r = await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light'], flow, routes: [{ name: 'home', path: '/' }] }), env.deps);
  assert.notEqual(copy.file, flow);
  assert.match(copy.text, /appId: host\.exp\.exponent\n/);
  assert.match(readFileSync(flow, 'utf8'), /host\.exp\.Exponent/); // the original is untouched
  assert.ok(r.notes.some((n) => /appId host\.exp\.exponent/.test(n)));
  assert.ok(env.run.calls.some(([c, a]) => c === 'maestro' && a.join(' ').startsWith('--device emulator-5600 test')));
  assert.ok(!existsSync(copy.file)); // temp dir removed
});

test('android run: same pixels twice names the deep link and react-native.md', async () => {
  const env = androidEnv();
  const deps = { ...env.deps, read: async () => Buffer.from('same') };
  const r = await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light'], routes: [{ name: 'home', path: '/' }, { name: 'bag', path: '/bag' }] }), deps);
  const f = r.findings.find((x) => x.rule === 'route-not-navigated');
  assert.match(f.message, /bag \(\/bag\) on Small Phone light shows the same screen as home; the deep link did not navigate/);
  assert.match(f.message, /react-native\.md "Deep links in Expo Go"/);
});

test('android run: progress lines use device names, not AVD names', async () => {
  const env = androidEnv();
  const lines = [];
  await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light'], routes: [{ name: 'home', path: '/' }] }), { ...env.deps, log: (l) => lines.push(l) });
  assert.deepEqual(lines, ['check-mobile: [1/1] Small Phone home light\n']);
});

test('android run: --native is refused by runMobileCheck too, before any command', async () => {
  const env = androidEnv();
  await assert.rejects(runMobileCheck(env.opts({ native: 'com.x', appPath: '/x.app' }), env.deps), /native Android apps are not supported yet/);
  assert.equal(env.run.calls.length, 0);
});

test('android signal cleanup: an AVD reported at create (no serial) is only deleted; after spawn it is killed first', async () => {
  const run = fakeRun();
  const e = androidEntry({ avd: 'uix-Small-Phone-r1', tools: ATOOLS });
  const udids = [e];
  await makeSignalCleanup({ run, udids, keep: false, exit: () => {}, killChildren: () => {}, waitForCreates: async () => {} })(130);
  assert.deepEqual(run.calls, [[AVDM, ['delete', 'avd', '-n', 'uix-Small-Phone-r1']]]);
  const run2 = fakeRun((c, a) => (a[2] === 'emu' && a[3] === 'avd' ? ok('uix-Small-Phone-r2\nOK\n') : undefined));
  const e2 = androidEntry({ avd: 'uix-Small-Phone-r2', tools: ATOOLS });
  e2.serial = 'emulator-5600';
  await makeSignalCleanup({ run: run2, udids: [e2, U1], keep: false, exit: () => {}, killChildren: () => {}, waitForCreates: async () => {} })(130);
  assert.deepEqual(run2.calls, [
    [ADB, ['-s', 'emulator-5600', 'emu', 'avd', 'name']],
    [ADB, ['-s', 'emulator-5600', 'emu', 'kill']],
    [AVDM, ['delete', 'avd', '-n', 'uix-Small-Phone-r2']],
    ['xcrun', ['simctl', 'shutdown', U1]], ['xcrun', ['simctl', 'delete', U1]],
  ]);
});

test('android signal cleanup: never touches a non-uix AVD or a non-emulator serial; keep logs and deletes nothing', async () => {
  const run = fakeRun();
  const bad = androidEntry({ avd: 'pixel7_e2e', serial: 'R5CT123', tools: ATOOLS });
  await makeSignalCleanup({ run, udids: [bad], keep: false, exit: () => {}, killChildren: () => {}, waitForCreates: async () => {} })(130);
  assert.equal(run.calls.length, 0);
  const lines = [];
  const e = androidEntry({ avd: 'uix-Small-Phone-r1', serial: 'emulator-5600', tools: ATOOLS });
  await makeSignalCleanup({ run, udids: [e], keep: true, exit: () => {}, killChildren: () => {}, waitForCreates: async () => {}, log: (l) => lines.push(l) })(130);
  assert.deepEqual(lines, ['kept: uix-Small-Phone-r1 emulator-5600\n']);
  assert.equal(run.calls.length, 0);
});

test('android main: onCreated twice for one AVD makes one cleanup entry that gains the serial', async () => {
  const proc = fakeProc();
  const run = fakeRun((c, a) => (a[2] === 'emu' && a[3] === 'avd' ? ok('uix-Small-Phone-r1\nOK\n') : undefined));
  const proj = scratch();
  writeFileSync(join(proj, 'app.json'), '{"expo":{"slug":"demo"}}');
  writeFileSync(join(proj, 'package.json'), '{}');
  const here = process.cwd();
  process.chdir(proj);
  try {
    await main(['--app', AAPP, '--platform', 'android', '--routes', writeTmp('r.json', [{ name: 'home', path: '/' }])], {
      proc,
      run,
      check: async (opts, d) => {
        d.onCreated({ name: 'uix-Small-Phone-r1', udid: null, platform: 'android', tools: ATOOLS });
        d.onCreated({ name: 'uix-Small-Phone-r1', udid: 'emulator-5600', platform: 'android', tools: ATOOLS });
        return { shots: [], findings: [], notes: [] };
      },
    });
  } finally { process.chdir(here); }
  proc.handlers.SIGINT();
  for (let i = 0; i < 100 && !proc.exits.length; i++) await tick(5);
  assert.deepEqual(proc.exits, [130]);
  assert.deepEqual(run.calls, [
    [ADB, ['-s', 'emulator-5600', 'emu', 'avd', 'name']],
    [ADB, ['-s', 'emulator-5600', 'emu', 'kill']],
    [AVDM, ['delete', 'avd', '-n', 'uix-Small-Phone-r1']],
  ]);
});

test('android run: after a ready open the route settles for 1.5 s (cap 10 s); the not-navigated retry for 3 s (cap 20 s)', async () => {
  // Bytes that never repeat keep settle waiting until its cap: the sleeps it makes add up to minMs + n * 500 = capMs.
  let n = 0;
  const slept = [];
  const env = androidEnv();
  const deps = { ...env.deps, sleep: async (ms) => { slept.push(ms); }, read: async () => Buffer.from(`shot-${n++}`) };
  await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light'], routes: [{ name: 'home', path: '/' }] }), deps);
  const i = slept.indexOf(1500);
  assert.ok(i >= 0);
  assert.deepEqual(slept.slice(i, i + 18), [1500, ...Array(17).fill(500)]); // 1500 + 17 * 500 = 10000
  assert.notEqual(slept[i + 18], 500);
  // Retry: the second route repeats the first one's pixels until the retry settle starts; then every read differs.
  let unique = false;
  const slept2 = [];
  const env2 = androidEnv();
  const deps2 = {
    ...env2.deps,
    sleep: async (ms) => { slept2.push(ms); if (ms === 3000) unique = true; },
    read: async () => Buffer.from(unique ? `u-${n++}` : 'same'),
  };
  await runMobileCheck(env2.opts({ devices: ['Small Phone'], modes: ['light'], routes: [{ name: 'home', path: '/' }, { name: 'bag', path: '/bag' }] }), deps2);
  const j = slept2.indexOf(3000);
  assert.ok(j >= 0);
  assert.deepEqual(slept2.slice(j, j + 35), [3000, ...Array(34).fill(500)]); // 3000 + 34 * 500 = 20000
  assert.notEqual(slept2[j + 35], 500);
  assert.ok(!slept2.includes(6000));
});

test('android signal cleanup: a launcher that is still alive after emu kill (or whose emu kill failed) is killed before the AVD is deleted', async () => {
  const order = [];
  const run = fakeRun((c, a) => {
    if (a[2] === 'emu' && a[3] === 'avd') return ok('uix-Small-Phone-r1\nOK\n');
    if (a[2] === 'emu' && a[3] === 'kill') { order.push('emu kill'); return { code: 1, stdout: '', stderr: 'device offline' }; }
    if (c === AVDM) order.push('delete');
    return undefined;
  });
  const slept = [];
  const e = androidEntry({ avd: 'uix-Small-Phone-r1', serial: 'emulator-5600', tools: ATOOLS, kill: () => order.push('group kill'), exited: () => false, sleep: async (ms) => { slept.push(ms); } });
  await makeSignalCleanup({ run, udids: [e], keep: false, exit: () => {}, killChildren: () => {}, waitForCreates: async () => {} })(130);
  assert.deepEqual(order, ['emu kill', 'group kill', 'delete']);
  assert.equal(slept.length, 20); // waited 5 s in 250 ms steps first
  // A launcher that exits while we wait is not killed again; a serial that reports another AVD gets no emu kill.
  let alive = true;
  const order2 = [];
  const run2 = fakeRun((c, a) => {
    if (a[2] === 'emu' && a[3] === 'avd') return ok('pixel7_e2e\nOK\n');
    if (a[3] === 'emu') order2.push('emu kill');
    return undefined;
  });
  const e2 = androidEntry({ avd: 'uix-Small-Phone-r2', serial: 'emulator-5600', tools: ATOOLS, kill: () => order2.push('group kill'), exited: () => !alive, sleep: async () => { alive = false; } });
  await makeSignalCleanup({ run: run2, udids: [e2], keep: false, exit: () => {}, killChildren: () => {}, waitForCreates: async () => {} })(130);
  assert.deepEqual(order2, []);
  assert.ok(run2.calls.some(([, a]) => a[0] === 'delete'));
});

test('android run: a screen that never shows app content is still shot, with an unverified note (45 s)', async () => {
  const env = androidEnv((c, a) => (c === ADB && a[3] === READY_CMD ? ok(SPLASH_XML) : undefined));
  const r = await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light'], routes: [{ name: 'home', path: '/' }] }), env.deps);
  assert.equal(r.shots.length, 1);
  assert.ok(r.notes.includes('unverified: Small Phone home light: app did not report it started within 45s'));
  assert.ok(!r.notes.some((n) => /Tools button|Continue/.test(n)));
});

const ERR_SCREEN_XML = `<hierarchy>${xnode({ 'resource-id': 'host.exp.exponent:id/error_header', text: 'Something went wrong.' })}${xnode({ 'resource-id': 'host.exp.exponent:id/error_message', text: 'Sorry about that.' })}</hierarchy>`;

test('android run: adb reverse is re-asserted before every open (routes, retry, flow root)', async () => {
  const flow = writeTmp('rv.yaml', 'appId: host.exp.Exponent\n---\n- tapOn: "x"\n');
  const env = androidEnv();
  const deps = { ...env.deps, read: async () => Buffer.from('same') }; // forces the not-navigated retry
  await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light'], flow, routes: [{ name: 'home', path: '/' }, { name: 'bag', path: '/bag' }] }), deps);
  const a = adbOf(env.run, 'emulator-5600');
  const starts = a.map((x, i) => (x[0] === 'shell' && x[1] === 'am' && x[2] === 'start' ? i : -1)).filter((i) => i >= 0);
  assert.ok(starts.length >= 4); // first open, home, bag, retry, root
  starts.forEach((st, k) => assert.ok(a.slice(k ? starts[k - 1] + 1 : 0, st).some((x) => x.join(' ') === 'reverse tcp:8081 tcp:8081'), `open #${k} had no reverse before it`));
});

test('android run: Expo Go error screen gives an app-error finding, keeps the shot, skips hash and hierarchy, and the run goes on', async () => {
  const env = androidEnv((c, a) => (c === ADB && a[3] === READY_CMD ? ok(ERR_SCREEN_XML) : undefined));
  const r = await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light', 'dark'], routes: [{ name: 'home', path: '/' }, { name: 'bag', path: '/bag' }] }), env.deps);
  assert.equal(r.shots.length, 4);
  const errs = r.findings.filter((f) => f.rule === 'app-error');
  assert.equal(errs.length, 4);
  assert.equal(errs[0].severity, 'error');
  assert.equal(errs[0].message, 'Expo Go could not load the app on Small Phone (home light): Something went wrong.: Sorry about that.; is Metro running on port 8081?');
  assert.ok(!r.findings.some((f) => f.rule === 'route-not-navigated'));
  assert.ok(!env.run.calls.some(([c, a]) => c === 'maestro' && a.includes('hierarchy')));
});

test('android run: the flow root open also dismisses Continue/Tools after a ready open', async () => {
  const flow = writeTmp('dm.yaml', 'appId: host.exp.Exponent\n---\n- tapOn: "x"\n');
  const env = androidEnv((c, a) => (c === ADB && a[3] === READY_CMD ? ok(CONTINUE_XML) : undefined));
  await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light'], flow, routes: [{ name: 'home', path: '/' }] }), env.deps);
  const taps = adbOf(env.run, 'emulator-5600').filter((x) => x[0] === 'shell' && x[1] === 'input' && x[2] === 'tap');
  assert.equal(taps.length, 3); // first open, the shot's open, the flow root
});

test('android run: a flow that cannot be read adds a note instead of silently running the original', async () => {
  const flow = join(scratch(), 'missing.yaml');
  const env = androidEnv();
  const r = await runMobileCheck(env.opts({ devices: ['Small Phone'], modes: ['light'], flow, routes: [{ name: 'home', path: '/' }] }), env.deps);
  assert.ok(r.notes.some((n) => /^unverified: could not rewrite the flow appId for Android: /.test(n)));
  assert.ok(env.run.calls.some(([c, a]) => c === 'maestro' && a[3] === flow));
});
