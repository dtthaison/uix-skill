import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  androidSdk, androidTools, pickAndroidDevices, createAndroidSession, assertSerial, androidOps, ensureExpoGoApk, parseNodes, OPENURL_RETRY_MS,
} from '../skills/uix-skill/scripts/lib/adb.mjs';
import { EnvError, liveChildCount } from '../skills/uix-skill/scripts/lib/sim.mjs';

const fx = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'android');
const xml = (n) => readFileSync(join(fx, n), 'utf8');
const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
const tmp = () => mkdtempSync(join(tmpdir(), 'uix-adb-test-'));

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
    calls.push([cmd, ...args]);
    const named = avdReply(cmd, args);
    return respond(cmd, args, opts) ?? (named === null ? ok() : ok(named));
  };
  run.calls = calls;
  return run;
}
const fakeSleep = () => {
  const s = async (ms) => { s.log.push(ms); };
  s.log = [];
  return s;
};
const sdkWith = (...images) => {
  const root = tmp();
  mkdirSync(join(root, 'emulator'), { recursive: true });
  writeFileSync(join(root, 'emulator', 'emulator'), '');
  for (const i of images) mkdirSync(join(root, 'system-images', i), { recursive: true });
  return root;
};

test('androidSdk: ANDROID_HOME, then ANDROID_SDK_ROOT, then sdkmanager path, then ~/Library', async () => {
  const a = sdkWith();
  const b = sdkWith();
  const c = sdkWith();
  const home = tmp();
  const run = fakeRun(() => ok(`${c}/cmdline-tools/latest/bin/sdkmanager\n`));
  const realpath = async (p) => p;
  assert.equal(await androidSdk({ env: { ANDROID_HOME: a, ANDROID_SDK_ROOT: b }, run, realpath, home }), a);
  assert.equal(await androidSdk({ env: { ANDROID_HOME: '/nope', ANDROID_SDK_ROOT: b }, run, realpath, home }), b);
  assert.equal(await androidSdk({ env: {}, run, realpath, home }), c);
  assert.deepEqual(run.calls[0], ['sh', '-c', 'command -v sdkmanager']);
  mkdirSync(join(home, 'Library/Android/sdk/emulator'), { recursive: true });
  writeFileSync(join(home, 'Library/Android/sdk/emulator/emulator'), '');
  assert.equal(await androidSdk({ env: {}, run: fakeRun(() => ({ code: 1, stdout: '', stderr: '' })), realpath, home }), join(home, 'Library/Android/sdk'));
});

test('androidSdk: no SDK is an EnvError naming what to install', async () => {
  await assert.rejects(androidSdk({ env: {}, run: fakeRun(() => ({ code: 1, stdout: '', stderr: '' })), realpath: async (p) => p, home: tmp() }),
    (e) => e instanceof EnvError && /android-commandlinetools/.test(e.message));
});

test('pickAndroidDevices: defaults, known names, id passthrough, unknown', async () => {
  const sdk = sdkWith('android-35/google_apis/arm64-v8a');
  const d = await pickAndroidDevices(undefined, { sdk, arch: 'arm64' });
  assert.deepEqual(d.map((x) => [x.name, x.deviceId]), [['Small Phone', 'small_phone'], ['Pixel 9 Pro XL', 'pixel_9_pro_xl']]);
  const e = await pickAndroidDevices(['Pixel 9a', 'Pixel 7', 'Medium Phone', 'Pixel 8', 'Pixel 9', 'my_tablet'], { sdk, arch: 'arm64' });
  assert.deepEqual(e.map((x) => x.deviceId), ['pixel_9a', 'pixel_7', 'medium_phone', 'pixel_8', 'pixel_9', 'my_tablet']);
  await assert.rejects(pickAndroidDevices(['Nokia'], { sdk, arch: 'arm64' }), (x) => x instanceof EnvError && /Small Phone/.test(x.message) && /Pixel 9 Pro XL/.test(x.message));
});

test('pickAndroidDevices: image choice by tag, highest N and abi', async () => {
  const both = sdkWith('android-34/google_apis/arm64-v8a', 'android-36/google_apis_playstore/arm64-v8a', 'android-35/google_apis_playstore/arm64-v8a');
  assert.equal((await pickAndroidDevices(['Pixel 7'], { sdk: both, arch: 'arm64' }))[0].image, 'system-images;android-34;google_apis;arm64-v8a');
  const play = sdkWith('android-34/google_apis_playstore/arm64-v8a', 'android-35/google_apis_playstore/arm64-v8a', 'android-36/default/arm64-v8a');
  assert.equal((await pickAndroidDevices(['Pixel 7'], { sdk: play, arch: 'arm64' }))[0].image, 'system-images;android-35;google_apis_playstore;arm64-v8a');
  const def = sdkWith('android-33/default/x86_64');
  assert.equal((await pickAndroidDevices(['Pixel 7'], { sdk: def, arch: 'x64' }))[0].image, 'system-images;android-33;default;x86_64');
  const hi = sdkWith('android-35/google_apis/x86_64', 'android-36/google_apis/x86_64');
  assert.equal((await pickAndroidDevices(['Pixel 7'], { sdk: hi, arch: 'x64' }))[0].image, 'system-images;android-36;google_apis;x86_64');
  await assert.rejects(pickAndroidDevices(['Pixel 7'], { sdk: sdkWith('android-35/google_apis/x86_64'), arch: 'arm64' }),
    (e) => e instanceof EnvError && e.message.includes('sdkmanager "system-images;android-35;google_apis;arm64-v8a"'));
});

// A fake spawn returning a child that records kill().
function fakeSpawn() {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    const child = { killed: [], kill(s) { this.killed.push(s); }, once() {}, unref() {} };
    calls.push({ cmd, args, opts, child });
    return child;
  };
  spawn.calls = calls;
  return spawn;
}
const devs = [
  { name: 'Small Phone', deviceId: 'small_phone', image: 'system-images;android-35;google_apis;arm64-v8a' },
  { name: 'Pixel 9 Pro XL', deviceId: 'pixel_9_pro_xl', image: 'system-images;android-35;google_apis;arm64-v8a' },
];

// adb devices simulation: emulators listed until `emu kill`.
function emuRun({ preset = [], bootAfter = 0, failCreateFor } = {}) {
  const live = new Set(preset);
  let polls = 0;
  const run = fakeRun((cmd, args) => {
    if (cmd === 'adb' && args[0] === 'devices') return ok(`List of devices attached\n${[...live].map((s) => `${s}\tdevice`).join('\n')}\n`);
    if (cmd === 'sh' && failCreateFor && args[1].includes(failCreateFor)) return { code: 1, stdout: '', stderr: 'boom' };
    if (cmd === 'adb' && args[2] === 'wait-for-device') { live.add(args[1]); return ok(); }
    if (cmd === 'adb' && args[2] === 'shell' && args[3] === 'getprop') return ok(polls++ >= bootAfter ? '1\n' : '0\n');
    if (cmd === 'adb' && args[2] === 'emu' && args[3] === 'kill') { live.delete(args[1]); return ok(); }
    return undefined;
  });
  return run;
}

test('createAndroidSession: names, ports skip used, spawn args, boot polling, onCreated', async () => {
  const run = emuRun({ preset: ['emulator-5600', 'emulator-5554'], bootAfter: 2 });
  const spawn = fakeSpawn();
  const sleep = fakeSleep();
  const created = [];
  const sdk = '/sdk';
  const logDir = tmp();
  const s = await createAndroidSession({ run, spawn, sleep, sdk, devices: devs, runId: 'r1', onCreated: (x) => created.push(x), logDir, env: { PATH: '/bin' } });
  assert.deepEqual(s.sims.map((x) => [x.name, x.udid, x.avd, x.port]), [
    ['uix-Small-Phone-r1', 'emulator-5602', 'uix-Small-Phone-r1', 5602],
    ['uix-Pixel-9-Pro-XL-r1', 'emulator-5604', 'uix-Pixel-9-Pro-XL-r1', 5604],
  ]);
  assert.deepEqual([...s.allowed], ['emulator-5602', 'emulator-5604']);
  const create = run.calls.find((c) => c[0] === 'sh');
  assert.equal(create[2], `echo no | 'avdmanager' create avd -n 'uix-Small-Phone-r1' -k 'system-images;android-35;google_apis;arm64-v8a' -d 'small_phone'`);
  assert.deepEqual(spawn.calls[0].cmd, '/sdk/emulator/emulator');
  assert.deepEqual(spawn.calls[0].args, ['-avd', 'uix-Small-Phone-r1', '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim', '-port', '5602']);
  assert.equal(spawn.calls[0].opts.detached, true);
  assert.equal(spawn.calls[0].opts.env.ANDROID_SDK_ROOT, '/sdk');
  assert.ok(existsSync(join(logDir, 'uix-Small-Phone-r1.log')));
  const polls = run.calls.filter((c) => c[4] === 'getprop');
  assert.equal(polls.length, 4); // 3 for the first device (2 not ready), 1 for the second
  assert.deepEqual(sleep.log, [2000, 2000]);
  assert.deepEqual(created[0], { name: 'uix-Small-Phone-r1', udid: null });
  assert.ok(created.some((c) => c.udid === 'emulator-5602'));
  // wait-for-device carries a 180 s timeout
  const wi = run.calls.findIndex((c) => c[3] === 'wait-for-device');
  assert.ok(wi > 0);
  assert.ok(liveChildCount() >= 2);
  await s.cleanup(true);
  assert.equal(run.calls.filter((c) => c[4] === 'kill').length, 0);
});

test('createAndroidSession: cleanup kills, waits for the serial to leave, then deletes only uix AVDs', async () => {
  const run = emuRun();
  const s = await createAndroidSession({ run, spawn: fakeSpawn(), sleep: fakeSleep(), sdk: '/sdk', devices: devs, runId: 'r2', logDir: tmp() });
  run.calls.length = 0;
  await s.cleanup(false);
  const kinds = run.calls.filter((c) => c[4] === 'kill' || c[1] === 'delete').map((c) => c.join(' '));
  assert.deepEqual(kinds, [
    'adb -s emulator-5600 emu kill', 'avdmanager delete avd -n uix-Small-Phone-r2',
    'adb -s emulator-5602 emu kill', 'avdmanager delete avd -n uix-Pixel-9-Pro-XL-r2',
  ]);
  // every adb call except `adb devices` names a serial
  for (const c of run.calls) if (c[0] === 'adb' && c[1] !== 'devices') assert.equal(c[1], '-s');
});

test('createAndroidSession: stuck emulator is killed after 20 s of waiting', async () => {
  let n = 0;
  const run = fakeRun((cmd, args) => (cmd === 'adb' && args[2] === 'shell' ? ok('1\n') : undefined));
  const spawn = fakeSpawn();
  const sleep = fakeSleep();
  const adbDevices = async () => (n++ < 1 ? [] : ['emulator-5600']);
  const s = await createAndroidSession({ run, spawn, sleep, sdk: '/sdk', devices: [devs[0]], runId: 'r4', logDir: tmp(), adbDevices });
  sleep.log.length = 0;
  await s.cleanup(false);
  assert.equal(sleep.log.length, 20);
  assert.deepEqual(spawn.calls[0].child.killed, ['SIGKILL']);
  assert.ok(run.calls.some((c) => c.join(' ') === 'avdmanager delete avd -n uix-Small-Phone-r4'));
});

test('createAndroidSession: boot timeout cleans up, keep leaves everything', async () => {
  const mk = () => fakeRun((cmd, args) => (cmd === 'adb' && args[2] === 'shell' ? ok('0\n') : cmd === 'adb' && args[0] === 'devices' ? ok('List of devices attached\n') : undefined));
  const run = mk();
  await assert.rejects(createAndroidSession({ run, spawn: fakeSpawn(), sleep: fakeSleep(), sdk: '/sdk', devices: devs, runId: 'r5', logDir: tmp() }), /did not finish booting/);
  assert.equal(run.calls.filter((c) => c[4] === 'getprop').length, 90);
  assert.ok(run.calls.some((c) => c.join(' ') === 'adb -s emulator-5600 emu kill'));
  assert.ok(run.calls.some((c) => c.join(' ') === 'avdmanager delete avd -n uix-Small-Phone-r5'));
  const run2 = mk();
  await assert.rejects(createAndroidSession({ run: run2, spawn: fakeSpawn(), sleep: fakeSleep(), sdk: '/sdk', devices: devs, runId: 'r6', keep: true, logDir: tmp() }), /did not finish booting/);
  assert.ok(!run2.calls.some((c) => c[4] === 'kill' || c[1] === 'delete'));
});

test('createAndroidSession: avdmanager failure after the first device removes the first only', async () => {
  const run = emuRun({ failCreateFor: 'Pixel-9' });
  await assert.rejects(createAndroidSession({ run, spawn: fakeSpawn(), sleep: fakeSleep(), sdk: '/sdk', devices: devs, runId: 'r7', logDir: tmp() }), /avdmanager create failed/);
  const dels = run.calls.filter((c) => c[1] === 'delete').map((c) => c[4]);
  assert.deepEqual(dels.sort(), ['uix-Pixel-9-Pro-XL-r7', 'uix-Small-Phone-r7']);
});

test('createAndroidSession: abort before the next device', async () => {
  const run = emuRun();
  await assert.rejects(createAndroidSession({ run, spawn: fakeSpawn(), sleep: fakeSleep(), sdk: '/sdk', devices: devs, runId: 'r8', isAborted: () => true, logDir: tmp() }), /aborted/);
  assert.equal(run.calls.filter((c) => c[0] === 'sh').length, 0);
});

test('assertSerial: only emulators the session owns', () => {
  const allowed = new Set(['emulator-5600']);
  assert.equal(assertSerial('emulator-5600', allowed), 'emulator-5600');
  for (const bad of ['emulator-5554', 'booted', '', undefined, 'emulator-5600; rm', 'ABC123']) {
    assert.throws(() => assertSerial(bad, allowed), EnvError);
  }
  assert.throws(() => assertSerial('emulator-5600', new Set(['emulator-5600x'])), EnvError);
});

const S = 'emulator-5600';
const mkOps = (respond, sleep = fakeSleep()) => {
  const run = fakeRun(respond);
  return { run, sleep, ops: androidOps({ run, sleep, allowed: new Set([S]) }) };
};

test('androidOps: every helper refuses a serial outside the session and runs nothing', async () => {
  const { run, ops } = mkOps();
  const calls = [
    () => ops.screenshot('emulator-5554', '/x.png'), () => ops.setNightMode('booted', true), () => ops.setFontScale('', '2.0'),
    () => ops.setDemoStatusBar('emulator-5554'), () => ops.reversePort('emulator-5554', 8081), () => ops.installApk('emulator-5554', 'a.apk'),
    () => ops.screenDensity('emulator-5554'), () => ops.openExpoUrl('emulator-5554', 'exp://x'), () => ops.dismissExpoGoFirstOpen('emulator-5554'),
  ];
  for (const c of calls) await assert.rejects(async () => c(), EnvError);
  assert.equal(run.calls.length, 0);
});

test('androidOps: exact args of the simple helpers', async () => {
  const { run, ops } = mkOps();
  await ops.screenshot(S, '/o/a.png');
  await ops.setNightMode(S, true);
  await ops.setNightMode(S, false);
  await ops.setFontScale(S, '2.0');
  await ops.reversePort(S, 8091);
  await ops.installApk(S, '/c/expo.apk');
  assert.deepEqual(run.calls, [
    ['adb', '-s', S, 'shell', 'screencap', '-p', '/sdcard/uix-shot.png'],
    ['adb', '-s', S, 'pull', '/sdcard/uix-shot.png', '/o/a.png'],
    ['adb', '-s', S, 'shell', 'cmd', 'uimode', 'night', 'yes'],
    ['adb', '-s', S, 'shell', 'cmd', 'uimode', 'night', 'no'],
    ['adb', '-s', S, 'shell', 'settings', 'put', 'system', 'font_scale', '2.0'],
    ['adb', '-s', S, 'reverse', 'tcp:8091', 'tcp:8091'],
    ['adb', '-s', S, 'install', '-r', '/c/expo.apk'],
  ]);
});

test('androidOps: install has a 300 s timeout', async () => {
  const seen = [];
  const { ops } = mkOps((cmd, args, opts) => { seen.push(opts); });
  await ops.installApk(S, 'a.apk');
  assert.equal(seen[0].timeoutMs, 300000);
});

test('screenshot: retries screencap up to 3 times, 1 s apart, and names the failing command', async () => {
  const { run, sleep, ops } = mkOps(() => ({ code: 1, stdout: '', stderr: '' }));
  const r = await ops.screenshot(S, '/x.png');
  assert.equal(r.code, 1);
  assert.equal(r.stderr, 'screencap exited 1');
  assert.equal(run.calls.length, 3);
  assert.deepEqual(sleep.log, [1000, 1000]);
});

test('screenshot: a failing pull is retried too, and its error carries the exit code and stderr', async () => {
  const { run, ops } = mkOps((cmd, args) => (args.includes('pull') ? { code: 1, stdout: '', stderr: 'remote object does not exist' } : undefined));
  const r = await ops.screenshot(S, '/x.png');
  assert.equal(r.stderr, 'pull exited 1: remote object does not exist');
  assert.equal(run.calls.filter((c) => c.includes('pull')).length, 3);
  let n = 0;
  const b = mkOps((cmd, args) => (args.includes('screencap') && ++n === 1 ? { code: 1, stdout: '', stderr: 'transient' } : undefined));
  assert.equal((await b.ops.screenshot(S, '/x.png')).code, 0); // second try works
  assert.equal(b.run.calls.filter((c) => c.includes('screencap')).length, 2);
});

test('androidOps: demo status bar runs the nine commands in order', async () => {
  const { run, ops } = mkOps();
  await ops.setDemoStatusBar(S);
  const b = ['am', 'broadcast', '-a', 'com.android.systemui.demo'];
  assert.deepEqual(run.calls.map((c) => c.slice(4)), [
    ['settings', 'put', 'global', 'sysui_demo_allowed', '1'],
    [...b, '-e', 'command', 'enter'],
    [...b, '-e', 'command', 'clock', '-e', 'hhmm', '0941'],
    [...b, '-e', 'command', 'battery', '-e', 'level', '100', '-e', 'plugged', 'false'],
    [...b, '-e', 'command', 'network', '-e', 'wifi', 'show', '-e', 'level', '4', '-e', 'fully', 'true'],
    [...b, '-e', 'command', 'network', '-e', 'mobile', 'hide'],
    [...b, '-e', 'command', 'network', '-e', 'airplane', 'hide'],
    [...b, '-e', 'command', 'network', '-e', 'nosim', 'hide'],
    [...b, '-e', 'command', 'notifications', '-e', 'visible', 'false'],
  ]);
});

test('androidOps: screenDensity prefers Override over Physical', async () => {
  const a = mkOps(() => ok('Physical density: 420\n'));
  assert.equal(await a.ops.screenDensity(S), 420);
  assert.deepEqual(a.run.calls[0], ['adb', '-s', S, 'shell', 'wm', 'density']);
  const b = mkOps(() => ok('Physical density: 420\nOverride density: 560\n'));
  assert.equal(await b.ops.screenDensity(S), 560);
  await assert.rejects(mkOps(() => ok('')).ops.screenDensity(S), EnvError);
});

const TOP_OK = '  topResumedActivity=ActivityRecord{1 u0 host.exp.exponent/.experience.ExperienceActivity t12}\n';
const TOP_LAUNCHER = '  topResumedActivity=ActivityRecord{2 u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t1}\n';

const READY_CMD = 'uiautomator dump /sdcard/uix-ui.xml >/dev/null 2>&1 && cat /sdcard/uix-ui.xml';
const node = (attrs) => `<node ${Object.entries({ package: 'host.exp.exponent', clickable: 'false', 'content-desc': '', text: '', bounds: '[0,0][10,10]', ...attrs }).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`;
const SPLASH_XML = `<hierarchy>${node({ text: 'Yuri' })}</hierarchy>`;
const TOOLS_ONLY_XML = `<hierarchy>${node({ clickable: 'true', 'content-desc': 'Tools' })}</hierarchy>`;
const LOADED_XML = `<hierarchy>${node({ text: 'Yuri' })}${node({ clickable: 'true', 'content-desc': 'Shop' })}</hierarchy>`;

test('openExpoUrl: waits for pidof to empty, pauses 1 s, then starts, verifies and checks the screen', async () => {
  let pids = ['123\n', '123\n', ''];
  const { run, sleep, ops } = mkOps((cmd, args) => {
    if (args.includes('pidof')) return ok(pids.shift() ?? '');
    if (args.includes('dumpsys')) return ok(TOP_OK);
    if (args.includes(READY_CMD)) return ok(LOADED_XML);
    return undefined;
  });
  const r = await ops.openExpoUrl(S, 'exp://127.0.0.1:8091/--/shop');
  assert.deepEqual([r.code, r.ready, r.xml], [0, true, LOADED_XML]);
  assert.deepEqual(run.calls.map((c) => c.slice(3).join(' ')), [
    'shell am force-stop host.exp.exponent', 'shell pidof host.exp.exponent', 'shell pidof host.exp.exponent', 'shell pidof host.exp.exponent',
    "shell am start -W -a android.intent.action.VIEW -d 'exp://127.0.0.1:8091/--/shop'", 'shell dumpsys activity activities',
    `shell ${READY_CMD}`,
  ]);
  assert.deepEqual(sleep.log, [250, 250, 1000]);
});

test('openExpoUrl: first try lands on the launcher, second works', async () => {
  let dumps = 0;
  const { run, sleep, ops } = mkOps((cmd, args) => {
    if (args.includes('dumpsys')) return ok(dumps++ === 0 ? TOP_LAUNCHER : TOP_OK);
    if (args.includes(READY_CMD)) return ok(LOADED_XML);
    return undefined;
  });
  assert.equal((await ops.openExpoUrl(S, 'exp://x')).code, 0);
  assert.equal(run.calls.filter((c) => c.includes('start')).length, 2);
  assert.deepEqual(sleep.log, [1000, OPENURL_RETRY_MS, 1000]);
});

test('openExpoUrl: polls the dump every 1 s; splash, Tools-only and failed dumps are not ready', async () => {
  const screens = [SPLASH_XML, null, TOOLS_ONLY_XML, SPLASH_XML, LOADED_XML];
  let n = 0;
  const { run, sleep, ops } = mkOps((cmd, args) => {
    if (args.includes('dumpsys')) return ok(TOP_OK);
    if (args.includes(READY_CMD)) { const x = screens[n++]; return x === null ? { code: 1, stdout: '', stderr: 'dump failed' } : ok(x); }
    return undefined;
  });
  const r = await ops.openExpoUrl(S, 'exp://x');
  assert.deepEqual([r.code, r.ready], [0, true]);
  assert.equal(run.calls.filter((c) => c.includes(READY_CMD)).length, 5);
  assert.deepEqual(sleep.log, [1000, 1000, 1000, 1000, 1000]);
  assert.ok(run.calls.every((c) => c[1] === '-s' && c[2] === S));
  assert.ok(!run.calls.some((c) => c.includes('logcat')));
});

const ERR_XML = `<hierarchy>${node({ 'resource-id': 'host.exp.exponent:id/error_header', text: 'Something went wrong.' })}${node({ 'resource-id': 'host.exp.exponent:id/error_message', text: 'Sorry about that.' })}${node({ 'resource-id': 'host.exp.exponent:id/view_error_log', clickable: 'true' })}</hierarchy>`;
const OWN_XML = `<hierarchy>${node({ 'resource-id': 'host.exp.exponent:id/home_button', clickable: 'true' })}${node({ clickable: 'true', 'resource-id': 'shop-card', 'content-desc': 'Shop' })}</hierarchy>`;

test('openExpoUrl: Expo Go own views (resource-id host.exp.exponent:id/) are not app content', async () => {
  const onlyOwn = `<hierarchy>${node({ 'resource-id': 'host.exp.exponent:id/home_button', clickable: 'true' })}</hierarchy>`;
  const a = mkOps((cmd, args) => (args.includes('dumpsys') ? ok(TOP_OK) : args.includes(READY_CMD) ? ok(onlyOwn) : undefined));
  assert.equal((await a.ops.openExpoUrl(S, 'exp://x')).ready, false);
  const b = mkOps((cmd, args) => (args.includes('dumpsys') ? ok(TOP_OK) : args.includes(READY_CMD) ? ok(OWN_XML) : undefined));
  assert.equal((await b.ops.openExpoUrl(S, 'exp://x')).ready, true); // a testID node of the app counts
});

test('openExpoUrl: the error screen stops polling at once; three error tries give code 1 and appError', async () => {
  const { run, sleep, ops } = mkOps((cmd, args) => (args.includes('dumpsys') ? ok(TOP_OK) : args.includes(READY_CMD) ? ok(ERR_XML) : undefined), undefined);
  const r = await ops.openExpoUrl(S, 'exp://x', { port: 8091 });
  assert.equal(r.code, 1);
  assert.equal(r.appError, 'Something went wrong.: Sorry about that.');
  assert.match(r.stderr, /error screen/);
  assert.equal(run.calls.filter((c) => c.includes(READY_CMD)).length, 3); // one dump per try
  assert.equal(run.calls.filter((c) => c.includes('reverse')).length, 3); // re-reversed before every try
  assert.equal(sleep.log.filter((x) => x === OPENURL_RETRY_MS).length, 2);
  assert.deepEqual(run.calls.find((c) => c.includes('reverse')), ['adb', '-s', S, 'reverse', 'tcp:8091', 'tcp:8091']);
});

test('openExpoUrl: error screen once, then the loaded app on the next try (a re-reverse in between)', async () => {
  let n = 0;
  const { run, ops } = mkOps((cmd, args) => (args.includes('dumpsys') ? ok(TOP_OK) : args.includes(READY_CMD) ? ok(++n === 1 ? ERR_XML : LOADED_XML) : undefined));
  const r = await ops.openExpoUrl(S, 'exp://x', { port: 8091 });
  assert.deepEqual([r.code, r.ready, r.appError], [0, true, undefined]);
  assert.equal(run.calls.filter((c) => c.includes('reverse')).length, 2);
});

test('openExpoUrl: a failing adb reverse fails the open with its message and starts nothing', async () => {
  const { run, ops } = mkOps((cmd, args) => (args.includes('reverse') ? { code: 1, stdout: '', stderr: 'closed' } : undefined));
  const r = await ops.openExpoUrl(S, 'exp://x', { port: 8091 });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /adb reverse tcp:8091 failed on emulator-5600: closed/);
  assert.ok(!run.calls.some((c) => c.includes('start')));
});

test('openExpoUrl: never ready gives ready false after 45 s of polling, still code 0', async () => {
  const { run, sleep, ops } = mkOps((cmd, args) => (args.includes('dumpsys') ? ok(TOP_OK) : args.includes(READY_CMD) ? ok(SPLASH_XML) : undefined));
  const r = await ops.openExpoUrl(S, 'exp://x');
  assert.deepEqual([r.code, r.ready], [0, false]);
  assert.equal(sleep.log.filter((x) => x === 1000).length, 46); // the 1 s before start + 45 polls
  assert.equal(run.calls.filter((c) => c.includes(READY_CMD)).length, 46);
});

test('openExpoUrl: three failures report what was on top', async () => {
  const { run, ops } = mkOps((cmd, args) => (args.includes('dumpsys') ? ok(TOP_LAUNCHER) : undefined));
  const r = await ops.openExpoUrl(S, 'exp://x');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /nexuslauncher/);
  assert.equal(run.calls.filter((c) => c.includes('start')).length, 3);
});

// dismissExpoGoFirstOpen: responds to `uiautomator dump` + `cat` from a script of xml screens.
function dumpRun(screens, size = 'Physical size: 1080x2400\n') {
  let i = -1;
  return (cmd, args) => {
    if (args.includes('wm')) return ok(size);
    if (args.includes('uiautomator')) { i = Math.min(i + 1, screens.length - 1); return ok('UI hierarchy dumped'); }
    if (args.includes('cat')) return ok(xml(screens[i]));
    return undefined;
  };
}
const inputs = (run) => run.calls.filter((c) => c[4] === 'input').map((c) => c.slice(5).join(' '));

test('parseNodes reads text, content-desc and bounds centre', () => {
  const n = parseNodes(xml('uiautomator-onboarding.xml')).find((x) => x.text === 'Continue');
  assert.deepEqual([n.x, n.y], [540, 1980]);
  assert.ok(parseNodes(xml('uiautomator-shop.xml')).some((x) => x.desc === 'Tools'));
});

test('dismissExpoGoFirstOpen: Continue only', async () => {
  const { run, sleep, ops } = mkOps(dumpRun(['uiautomator-onboarding.xml', 'uiautomator-devmenu.xml']));
  // after the tap (and 1 s) the re-dump has neither Continue nor Tools
  const r = await ops.dismissExpoGoFirstOpen(S);
  assert.equal(r.code, 0);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(inputs(run), ['tap 540 1980']);
  assert.deepEqual(sleep.log, [1000]);
});

test('dismissExpoGoFirstOpen: Tools only, needs the swipe', async () => {
  const { run, sleep, ops } = mkOps(dumpRun(['uiautomator-shop.xml', 'uiautomator-onboarding.xml', 'uiautomator-devmenu.xml']));
  const r = await ops.dismissExpoGoFirstOpen(S);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(inputs(run), ['keyevent 82', 'swipe 540 1920 540 720 400', 'tap 370 1610', 'keyevent 4']);
  assert.deepEqual(sleep.log, [2000, 1000, 1000]);
});

test('dismissExpoGoFirstOpen: Tools row visible at once needs no swipe; row never found gives a note', async () => {
  const a = mkOps(dumpRun(['uiautomator-shop.xml', 'uiautomator-devmenu.xml']));
  await a.ops.dismissExpoGoFirstOpen(S);
  assert.deepEqual(inputs(a.run), ['keyevent 82', 'tap 370 1610', 'keyevent 4']);
  const b = mkOps(dumpRun(['uiautomator-shop.xml']));
  const r = await b.ops.dismissExpoGoFirstOpen(S);
  assert.deepEqual(r.notes, [`Expo Go Tools button still showing on ${S}`]);
  assert.equal(r.code, 0);
  assert.deepEqual(inputs(b.run), ['keyevent 82', 'swipe 540 1920 540 720 400', 'keyevent 4']);
});

test('dismissExpoGoFirstOpen: a failed dump (or cat) is retried up to 3 times, 1 s apart', async () => {
  let dumps = 0;
  const { run, sleep, ops } = mkOps((cmd, args) => {
    if (args.includes('uiautomator')) return ok('dumped');
    if (args.includes('cat')) return ++dumps < 3 ? { code: 1, stdout: '', stderr: 'cat: /sdcard/uix-ui.xml: No such file or directory' } : ok(xml('uiautomator-devmenu.xml'));
    return undefined;
  });
  const r = await ops.dismissExpoGoFirstOpen(S);
  assert.deepEqual(r, { code: 0, notes: [] });
  assert.equal(run.calls.filter((c) => c.includes('uiautomator')).length, 3);
  assert.deepEqual(sleep.log, [1000, 1000]);
  const bad = mkOps(() => ({ code: 1, stdout: '', stderr: 'dump failed' }));
  const r2 = await bad.ops.dismissExpoGoFirstOpen(S);
  assert.equal(r2.code, 1);
  assert.equal(bad.run.calls.filter((c) => c.includes('uiautomator')).length, 3);
});

test('createAndroidSession: the planned AVD is reported before avdmanager create runs', async () => {
  const order = [];
  const run = emuRun();
  const wrapped = async (cmd, args, o) => { if (cmd === 'sh') order.push('create'); return run(cmd, args, o); };
  await createAndroidSession({ run: wrapped, spawn: fakeSpawn(), sleep: fakeSleep(), sdk: '/sdk', devices: [devs[0]], runId: 'r1', onCreated: (x) => order.push(`cb:${x.udid}`), logDir: tmp(), env: {} });
  assert.deepEqual(order.slice(0, 2), ['cb:null', 'create']);
  assert.equal(order.filter((x) => x === 'cb:null').length, 2); // planned, then spawned (carries the kill hook, still no serial)
  assert.equal(order.filter((x) => x === 'cb:emulator-5600').length, 1);
});

test('dismissExpoGoFirstOpen: starts from the given xml without dumping first', async () => {
  const { run, ops } = mkOps(dumpRun(['uiautomator-devmenu.xml']));
  const r = await ops.dismissExpoGoFirstOpen(S, { xml: xml('uiautomator-devmenu.xml') });
  assert.deepEqual(r, { code: 0, notes: [] });
  assert.equal(run.calls.length, 0); // neither Continue nor Tools: free
  const b = mkOps(dumpRun(['uiautomator-devmenu.xml', 'uiautomator-devmenu.xml']));
  await b.ops.dismissExpoGoFirstOpen(S, { xml: xml('uiautomator-onboarding.xml') });
  assert.deepEqual(inputs(b.run), ['tap 540 1980']);
  assert.equal(b.run.calls.filter((c) => c.includes('uiautomator')).length, 1); // only the re-dump
});

test('dismissExpoGoFirstOpen: notes when Continue or Tools are still there after the taps', async () => {
  const a = mkOps(dumpRun(['uiautomator-onboarding.xml']));
  const r = await a.ops.dismissExpoGoFirstOpen(S, { xml: xml('uiautomator-onboarding.xml') });
  assert.deepEqual(r.notes, [`Expo Go Continue sheet still showing on ${S}`]);
  // Tools: row found and tapped, but the verifying dump still shows Tools
  const b = mkOps(dumpRun(['uiautomator-devmenu.xml', 'uiautomator-shop.xml']));
  const r2 = await b.ops.dismissExpoGoFirstOpen(S, { xml: xml('uiautomator-shop.xml') });
  assert.deepEqual(r2.notes, [`Expo Go Tools button still showing on ${S}`]);
  assert.deepEqual(inputs(b.run), ['keyevent 82', 'tap 370 1610', 'keyevent 4']);
});

test('dismissExpoGoFirstOpen: the swipe is scaled to the screen (Override size first, read once per device)', async () => {
  const a = mkOps(dumpRun(['uiautomator-shop.xml', 'uiautomator-onboarding.xml', 'uiautomator-devmenu.xml'], 'Physical size: 720x1280\n'));
  await a.ops.dismissExpoGoFirstOpen(S);
  assert.ok(inputs(a.run).includes('swipe 360 1024 360 384 400'));
  const b = mkOps(dumpRun(['uiautomator-shop.xml', 'uiautomator-onboarding.xml', 'uiautomator-devmenu.xml'], 'Physical size: 1080x2400\nOverride size: 720x1280\n'));
  await b.ops.dismissExpoGoFirstOpen(S);
  assert.ok(inputs(b.run).includes('swipe 360 1024 360 384 400'));
  const c = mkOps(dumpRun(['uiautomator-shop.xml']));
  await c.ops.dismissExpoGoFirstOpen(S);
  await c.ops.dismissExpoGoFirstOpen(S);
  assert.equal(c.run.calls.filter((x) => x.includes('wm')).length, 1);
});

test('dismissExpoGoFirstOpen: after a failed Tools toggle the device is not tried again; Continue still is', async () => {
  const { run, ops } = mkOps(dumpRun(['uiautomator-shop.xml']));
  const r1 = await ops.dismissExpoGoFirstOpen(S);
  assert.deepEqual(r1.notes, [`Expo Go Tools button still showing on ${S}`]);
  const before = inputs(run).length;
  const r2 = await ops.dismissExpoGoFirstOpen(S, { xml: xml('uiautomator-shop.xml') });
  assert.deepEqual(r2, { code: 0, notes: [] });
  assert.equal(inputs(run).length, before);
  const r3 = await ops.dismissExpoGoFirstOpen(S, { xml: xml('uiautomator-onboarding.xml') });
  assert.equal(inputs(run).length, before + 1); // the Continue tap
  assert.deepEqual(r3, { code: 0, notes: [] }); // Continue tapped and gone; the Tools toggle is not retried
});

test('dismissExpoGoFirstOpen: neither node does nothing', async () => {
  const { run, ops } = mkOps(dumpRun(['uiautomator-devmenu.xml']));
  const r = await ops.dismissExpoGoFirstOpen(S);
  assert.deepEqual(r, { code: 0, notes: [] });
  assert.deepEqual(inputs(run), []);
});

test('ensureExpoGoApk: cache hit, download and failures', async () => {
  const cacheRoot = tmp();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('api.expo.dev')) return { ok: true, text: async () => JSON.stringify({ data: { sdkVersions: { '58.0.0': { androidClientUrl: 'https://dl/expo.apk' } } } }) };
    return { ok: true, arrayBuffer: async () => Buffer.from('APK').buffer.slice(0, 3) };
  };
  const p = await ensureExpoGoApk({ fetchImpl, major: 58, cacheRoot });
  assert.equal(p, join(cacheRoot, 'uix-expo-go-android-58.apk'));
  assert.equal(readFileSync(p, 'utf8').length, 3);
  assert.deepEqual(calls, ['https://api.expo.dev/v2/versions/latest', 'https://dl/expo.apk']);
  assert.equal(await ensureExpoGoApk({ fetchImpl, major: 58, cacheRoot }), p);
  assert.equal(calls.length, 2);
  await assert.rejects(ensureExpoGoApk({ fetchImpl, major: 99, cacheRoot }), (e) => e instanceof EnvError && /SDK 99/.test(e.message));
  await assert.rejects(ensureExpoGoApk({ fetchImpl: async () => ({ ok: false, status: 500 }), major: 58, cacheRoot: tmp() }), (e) => e instanceof EnvError && /api\.expo\.dev/.test(e.message));
  const dlFail = async (url) => (url.includes('api.expo.dev') ? fetchImpl(url) : { ok: false, status: 404 });
  await assert.rejects(ensureExpoGoApk({ fetchImpl: dlFail, major: 58, cacheRoot: tmp() }), (e) => e instanceof EnvError && /https:\/\/dl\/expo\.apk/.test(e.message));
});

const has = (...ps) => async (p) => ps.includes(p);

test('androidTools: resolves from the SDK root, falls back to PATH', async () => {
  const all = await androidTools({ sdk: '/s', exists: has('/s/platform-tools/adb', '/s/cmdline-tools/latest/bin/avdmanager') });
  assert.deepEqual(all, { adb: '/s/platform-tools/adb', avdmanager: '/s/cmdline-tools/latest/bin/avdmanager', emulator: '/s/emulator/emulator' });
  const other = await androidTools({ sdk: '/s', exists: has('/s/cmdline-tools/11.0/bin/avdmanager'), readdir: async () => ['9.0', '11.0'] });
  assert.deepEqual([other.adb, other.avdmanager], ['adb', '/s/cmdline-tools/11.0/bin/avdmanager']);
  const none = await androidTools({ sdk: '/s', exists: has(), readdir: async () => { throw new Error('ENOENT'); } });
  assert.deepEqual([none.adb, none.avdmanager], ['adb', 'avdmanager']);
});

const TOOLS = { adb: '/s/platform-tools/adb', avdmanager: '/s/cmdline-tools/latest/bin/avdmanager', emulator: '/s/emulator/emulator' };

test('createAndroidSession and androidOps use the resolved tool paths', async () => {
  const run = fakeRun((cmd, args) => {
    if (args[0] === 'devices') return ok('List of devices attached\n');
    if (args[2] === 'shell') return ok('1\n');
    return undefined;
  });
  const spawn = fakeSpawn();
  const s = await createAndroidSession({ run, spawn, sleep: fakeSleep(), sdk: '/s', devices: [devs[0]], runId: 'p', logDir: tmp(), tools: TOOLS, adbDevices: async () => [] });
  assert.equal(spawn.calls[0].cmd, '/s/emulator/emulator');
  assert.match(run.calls[0][2], /^echo no \| '\/s\/cmdline-tools\/latest\/bin\/avdmanager' create avd/);
  await s.cleanup(false);
  await androidOps({ run, allowed: s.allowed, adb: TOOLS.adb }).setNightMode('emulator-5600', true);
  for (const c of run.calls) if (c[0] !== 'sh') assert.ok([TOOLS.adb, TOOLS.avdmanager].includes(c[0]), c[0]);
  assert.ok(run.calls.some((c) => c[0] === TOOLS.avdmanager && c[1] === 'delete'));
  assert.ok(run.calls.some((c) => c[0] === TOOLS.adb && c[4] === 'kill'));
  assert.equal(run.calls.at(-1)[0], TOOLS.adb);
});

test('cleanup: a failing adb devices does not count as gone; kill hits the child via the injected kill', async () => {
  const run = fakeRun((cmd, args) => (args[2] === 'shell' ? ok('1\n') : undefined));
  const spawn = fakeSpawn();
  const sleep = fakeSleep();
  let fail = false;
  const killed = [];
  const s = await createAndroidSession({ run, spawn, sleep, sdk: '/s', devices: [devs[0]], runId: 'k', logDir: tmp(), tools: TOOLS, kill: (c) => killed.push(c),
    adbDevices: async () => { if (fail) throw new Error('adb down'); return []; } });
  fail = true;
  sleep.log.length = 0;
  await s.cleanup(false);
  assert.equal(sleep.log.length, 20);
  assert.deepEqual(killed, [spawn.calls[0].child]);
});

test('createAndroidSession: a failed avdmanager create still tries to delete that avd', async () => {
  const run = emuRun({ failCreateFor: 'Small-Phone' });
  await assert.rejects(createAndroidSession({ run, spawn: fakeSpawn(), sleep: fakeSleep(), sdk: '/sdk', devices: devs, runId: 'f', logDir: tmp() }), /avdmanager create failed/);
  assert.deepEqual(run.calls.filter((c) => c[1] === 'delete').map((c) => c[4]), ['uix-Small-Phone-f']);
});

test('createAndroidSession: spawn throwing leaves no serial to wait on, but the avd is deleted', async () => {
  const run = emuRun();
  const sleep = fakeSleep();
  const spawn = () => { throw new Error('ENOENT'); };
  await assert.rejects(createAndroidSession({ run, spawn, sleep, sdk: '/sdk', devices: devs, runId: 's', logDir: tmp() }), /ENOENT/);
  assert.equal(run.calls.filter((c) => c[4] === 'kill').length, 0);
  assert.equal(sleep.log.length, 0);
  assert.deepEqual(run.calls.filter((c) => c[1] === 'delete').map((c) => c[4]), ['uix-Small-Phone-s']);
});

test('createAndroidSession: an emulator that never shows on adb still has its process group killed and its AVD deleted', async () => {
  const run = fakeRun((cmd, args) => {
    if (cmd === 'adb' && args[2] === 'wait-for-device') return { code: 1, stdout: '', stderr: 'timeout' };
    if (cmd === 'adb' && args[0] === 'devices') return ok('List of devices attached\n');
    if (cmd === 'adb' && args[2] === 'emu') return { code: 1, stdout: '', stderr: 'no device' };
    return undefined;
  });
  const spawn = fakeSpawn();
  const killed = [];
  await assert.rejects(createAndroidSession({ run, spawn, sleep: fakeSleep(), sdk: '/sdk', devices: [devs[0]], runId: 'n1', logDir: tmp(), kill: (c) => killed.push(c) }), /did not appear on adb/);
  assert.deepEqual(killed, [spawn.calls[0].child]);
  assert.ok(run.calls.some((c) => c.join(' ') === 'avdmanager delete avd -n uix-Small-Phone-n1'));
  assert.ok(!run.calls.some((c) => c[4] === 'kill')); // the serial never answered, so no emu kill either
});

test('createAndroidSession: a launcher seen to exit with its serial gone is not killed again', async () => {
  const run = emuRun();
  let onExit;
  const spawn = (cmd, args, opts) => ({ once(ev, f) { if (ev === 'exit') onExit = f; }, unref() {}, kill() {} });
  const killed = [];
  const s = await createAndroidSession({ run, spawn, sleep: fakeSleep(), sdk: '/sdk', devices: [devs[0]], runId: 'n2', logDir: tmp(), kill: (c) => killed.push(c) });
  onExit();
  await s.cleanup(false);
  assert.deepEqual(killed, []);
});

test('createAndroidSession: another emulator on our port is never touched; our process is killed and the AVD deleted', async () => {
  const run = fakeRun((cmd, args) => {
    if (cmd === 'adb' && args[2] === 'emu' && args[3] === 'avd') return ok('pixel7_e2e\nOK\n'); // a foreign AVD answers on emulator-5600
    if (cmd === 'adb' && args[0] === 'devices') return ok('List of devices attached\n');
    return undefined;
  });
  const spawn = fakeSpawn();
  const killed = [];
  const created = [];
  await assert.rejects(createAndroidSession({ run, spawn, sleep: fakeSleep(), sdk: '/sdk', devices: [devs[0]], runId: 'm1', logDir: tmp(), kill: (c) => killed.push(c), onCreated: (x) => created.push(x.udid) }),
    (e) => e instanceof EnvError && /emulator-5600 reports AVD "pixel7_e2e", not uix-Small-Phone-m1/.test(e.message));
  assert.ok(!run.calls.some((c) => c[4] === 'kill' || c.includes('shell')), 'no emu kill or shell on the foreign serial');
  assert.deepEqual(created, [null, null]); // the serial was never reported
  assert.deepEqual(killed, [spawn.calls[0].child]);
  assert.ok(run.calls.some((c) => c.join(' ') === 'avdmanager delete avd -n uix-Small-Phone-m1'));
});

test('createAndroidSession: cleanup re-checks the AVD name before emu kill', async () => {
  let name = 'uix-Small-Phone-m2';
  const run = fakeRun((cmd, args) => {
    if (cmd === 'adb' && args[2] === 'emu' && args[3] === 'avd') return ok(`${name}\nOK\n`);
    if (cmd === 'adb' && args[2] === 'shell') return ok('1\n');
    if (cmd === 'adb' && args[0] === 'devices') return ok('List of devices attached\nemulator-5600\tdevice\n');
    return undefined;
  });
  const s = await createAndroidSession({ run, spawn: fakeSpawn(), sleep: fakeSleep(), sdk: '/sdk', devices: [devs[0]], runId: 'm2', logDir: tmp(), kill: () => {} });
  name = 'someone_else';
  await s.cleanup(false);
  assert.ok(!run.calls.some((c) => c[4] === 'kill'));
});

test('createAndroidSession: no free port up to 5682 is an EnvError; duplicate devices are refused before anything is created', async () => {
  const taken = Array.from({ length: 42 }, (_, i) => `emulator-${5600 + 2 * i}`);
  const run = emuRun({ preset: taken });
  await assert.rejects(createAndroidSession({ run, spawn: fakeSpawn(), sleep: fakeSleep(), sdk: '/sdk', devices: [devs[0]], runId: 'p1', logDir: tmp() }), /no free emulator port between 5600 and 5682/);
  const run2 = emuRun();
  await assert.rejects(createAndroidSession({ run: run2, spawn: fakeSpawn(), sleep: fakeSleep(), sdk: '/sdk', devices: [devs[0], devs[0]], runId: 'p2', logDir: tmp() }), /"Small Phone" is listed twice/);
  assert.equal(run2.calls.length, 0);
  await assert.rejects(pickAndroidDevices(['Pixel 7', 'Pixel 7'], { sdk: sdkWith('android-35/google_apis/arm64-v8a'), arch: 'arm64' }), /"Pixel 7" is listed twice/);
});

test('openExpoUrl: a route with &, ;, spaces and $() reaches the device shell as one single-quoted argument', async () => {
  const { run, ops } = mkOps((cmd, args) => {
    if (args.includes('pidof')) return ok('');
    if (args.includes('dumpsys')) return ok(TOP_OK);
    if (args.includes(READY_CMD)) return ok(LOADED_XML);
    return undefined;
  });
  await ops.openExpoUrl(S, 'exp://127.0.0.1:8091/--/p?a=1&b=2;x $(id) it\'s');
  const start = run.calls.find((c) => c.includes('start'));
  assert.deepEqual(start.slice(-2), ['-d', `'exp://127.0.0.1:8091/--/p?a=1&b=2;x $(id) it'\\''s'`]);
});
