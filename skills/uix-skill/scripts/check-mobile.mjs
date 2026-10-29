#!/usr/bin/env node
// Screenshots an Expo app (through Expo Go) or a native iOS app (--native, a built .app) on iPhone simulators this script creates itself
// (routes x devices x light/dark/xxxl), reads the accessibility hierarchy and prints
// {shots, findings, notes}. Mobile counterpart of check.mjs.
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  defaultRun, defaultSleep, killLiveChildren, sparedChildCount, EnvError, pickDevices, createSession, openUrl, screenshot, setAppearance, setContentSize,
  setStatusBar, skipExpoOnboarding, settle, assertUdid,
} from './lib/sim.mjs';
import {
  androidSdk, androidTools, pickAndroidDevices, createAndroidSession, androidOps, ensureExpoGoApk,
} from './lib/adb.mjs';
import { readHierarchy, findingsFromHierarchy } from './lib/hierarchy.mjs';

const MODES = ['light', 'dark', 'xxxl'];
const DOWNLOAD_MS = 20 * 60 * 1000;
const BIG_TEXT = 'accessibility-extra-extra-extra-large';
const EXPO_GO = 'host.exp.Exponent';
// Expo Go on iOS builds the first expo-router state from a synchronous initial URL that is null at a
// cold start, so a cold deep link lands on "/". Open the root cold, wait, then open the route warm.
export const ROOT_WAIT = { minMs: 8000, capMs: 30000 };
export const ROOT_WAIT_LONG = { minMs: 20000, capMs: 40000 };
export const OPENURL_RETRY_MS = 5000;
const NATIVE_HIERARCHY_NOTE = 'native hierarchy: iOS reports no control roles, so small-target covers icons and unlabelled controls not inside a labelled element; check text buttons and controls on cards by eye';
// Expo Go draws the app a few seconds after the JS start line: settle for longer than on iOS.
const ANDROID_SETTLE = { minMs: 1500, capMs: 10000 };
const ANDROID_SETTLE_RETRY = { minMs: 3000, capMs: 20000 };
const ANDROID_VIDEO_NOTE = 'video: not supported on Android yet';
const ANDROID_FLOW_NOTE = 'flow: ran a temp copy with appId host.exp.exponent (Expo Go package id on Android) instead of host.exp.Exponent';
const MAESTRO_NOTE = 'maestro missing: hierarchy and flow checks skipped, not a success run';
const USAGE = 'usage: check-mobile.mjs --app <exp://host:port> [--platform ios|android] [--routes .uix/mobile-routes.json] [--devices "<name>,<name>"] [--modes light,dark,xxxl] [--only <name,name>] [--out .uix/mobile-shots] [--video] [--flow <maestro.yaml>] [--keep]\n       check-mobile.mjs --native <bundle id> --app-path <App.app> [same options]';
// The first Metro bundle can take a minute: wait for the onboarding sheet instead of giving up on a
// fast optional tap (real run: the sheet was still on every screenshot).
export const FIRST_FLOW = `appId: ${EXPO_GO}
---
- tapOn:
    text: "Open"
    optional: true
- tapOn:
    text: "Continue"
    optional: true
- tapOn:
    id: "xmark"
    optional: true
`;

const fileSlug = (s) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function parseArgs(argv) {
  const a = { app: null, routes: '.uix/mobile-routes.json', devices: null, modes: [...MODES], out: '.uix/mobile-shots', video: false, flow: null, keep: false, only: null };
  const value = (i, flag) => {
    const v = argv[i];
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`);
    return v;
  };
  try {
    for (let i = 0; i < argv.length; i++) {
      const f = argv[i];
      if (f === '--app') a.app = value(++i, f);
      else if (f === '--platform') {
        a.platform = value(++i, f);
        if (!['ios', 'android'].includes(a.platform)) throw new Error(`--platform must be ios or android (got "${a.platform}")`);
      } else if (f === '--native') a.native = value(++i, f);
      else if (f === '--app-path') a.appPath = value(++i, f);
      else if (f === '--routes') a.routes = value(++i, f);
      else if (f === '--devices') a.devices = value(++i, f).split(',').map((s) => s.trim()).filter(Boolean);
      else if (f === '--modes') a.modes = value(++i, f).split(',').map((s) => s.trim());
      else if (f === '--only') a.only = value(++i, f).split(',').map((s) => s.trim()).filter(Boolean);
      else if (f === '--out') a.out = value(++i, f);
      else if (f === '--flow') a.flow = value(++i, f);
      else if (f === '--video') a.video = true;
      else if (f === '--keep') a.keep = true;
      else throw new Error(`unknown argument ${f}`);
    }
  } catch (e) {
    return { error: e.message };
  }
  if (a.platform === 'android' && (a.native || a.appPath)) return { error: '--platform android supports Expo apps (--app) only; native Android apps are not supported yet' };
  if (a.app && (a.native || a.appPath)) return { error: '--app cannot be used with --native or --app-path' };
  if (a.native && !a.appPath) return { error: '--native needs --app-path <App.app>' };
  if (a.appPath && !a.native) return { error: '--app-path needs --native <bundle id>' };
  if (!a.app && !a.native) return { error: 'exactly one of --app <exp://host:port> or --native <bundle id> is required' };
  const badMode = a.modes.find((m) => !MODES.includes(m));
  if (badMode !== undefined || !a.modes.length) return { error: `unknown mode "${badMode ?? ''}" (use ${MODES.join(', ')})` };
  if (a.devices && !a.devices.length) return { error: '--devices is empty' };
  if (a.only && !a.only.length) return { error: '--only is empty' };
  return a;
}

export async function loadRoutes(file, mode = 'expo') {
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (e) {
    throw new EnvError(`Cannot read routes file ${file}: ${e.message}`);
  }
  let list;
  try {
    list = JSON.parse(raw);
  } catch (e) {
    throw new EnvError(`Routes file ${file} is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(list)) throw new EnvError(`Routes file ${file} must be an array of {name, ${mode === 'native' ? 'args' : 'path'}}.`);
  if (!list.length) throw new EnvError(`Routes file ${file} is empty; list at least one route.`);
  const seen = new Set();
  const slugs = new Map();
  list.forEach((r, i) => {
    if (!r || typeof r.name !== 'string' || !r.name.trim()) throw new EnvError(`Route #${i + 1} in ${file} is missing "name".`);
    if (mode === 'native') {
      if (!Array.isArray(r.args) || r.args.some((x) => typeof x !== 'string')) throw new EnvError(`Route "${r.name}" in ${file} needs "args": an array of strings (launch arguments, may be empty).`);
    } else {
      if (typeof r.path !== 'string') throw new EnvError(`Route "${r.name}" in ${file} is missing "path".`);
      if (!r.path.startsWith('/')) throw new EnvError(`Route "${r.name}" path "${r.path}" must start with "/".`);
    }
    if (seen.has(r.name)) throw new EnvError(`Duplicate route name "${r.name}" in ${file}.`);
    seen.add(r.name);
    if (r.sameAs !== undefined && typeof r.sameAs !== 'string') throw new EnvError(`Route "${r.name}" in ${file}: "sameAs" must be a route name.`);
    const sl = fileSlug(r.name);
    if (slugs.has(sl)) throw new EnvError(`Route names "${slugs.get(sl)}" and "${r.name}" would write the same screenshot files ("${sl}"); rename one.`);
    slugs.set(sl, r.name);
  });
  for (const r of list) {
    if (r.sameAs === undefined) continue;
    if (r.sameAs === r.name) throw new EnvError(`Route "${r.name}" in ${file} has "sameAs" naming itself.`);
    if (!seen.has(r.sameAs)) throw new EnvError(`Route "${r.name}" in ${file} has "sameAs" naming unknown route "${r.sameAs}".`);
  }
  return list.map((r) => {
    const base = mode === 'native' ? { name: r.name, args: r.args } : { name: r.name, path: r.path };
    return r.sameAs === undefined ? base : { ...base, sameAs: r.sameAs };
  });
}

// Keeps the named routes, in routes-file order. An unknown name is an EnvError.
export function filterRoutes(routes, only) {
  if (!only) return routes;
  const unknown = only.filter((n) => !routes.some((r) => r.name === n));
  if (unknown.length) throw new EnvError(`--only names unknown route(s): ${unknown.join(', ')} (routes file has: ${routes.map((r) => r.name).join(', ')}).`);
  return routes.filter((r) => only.includes(r.name));
}

export const deepLink = (app, routePath) => `${app.replace(/\/+$/, '')}/--${routePath}`;

const httpBase = (app) => {
  const m = /^exp:\/\/([^/]+)/.exec(app);
  if (!m) throw new EnvError(`--app must look like exp://127.0.0.1:8081 (got "${app}").`);
  return `http://${m[1]}`;
};
const real = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };

async function checkMetro({ app, appJson, fetchImpl, cwd, platform = 'ios' }) {
  const base = httpBase(app);
  let status;
  try {
    status = await fetchImpl(`${base}/status`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new EnvError(`Metro not reachable at ${base}; start it with: npx expo start --port <port>`);
  }
  const root = status.headers?.get?.('x-react-native-project-root');
  if (!root) {
    let body = '';
    try { body = (await status.text()).replace(/\s+/g, ' ').trim().slice(0, 80); } catch { /* no body */ }
    const server = status.headers?.get?.('server');
    const what = `HTTP ${status.status}${server ? ` (Server: ${server})` : ''}${body ? ` with "${body}"` : ''}`;
    throw new EnvError(`${base}/status answered ${what}, not Metro (no X-React-Native-Project-Root header); is another server on that port?`);
  }
  if (real(root) !== real(cwd)) throw new EnvError(`Metro at ${base} serves project ${root}, but this check runs in ${real(cwd)}.`);
  let manifest;
  try {
    const res = await fetchImpl(`${base}/`, { headers: { 'expo-platform': platform, Accept: 'application/expo+json,application/json' }, signal: AbortSignal.timeout(15000) });
    manifest = JSON.parse(await res.text());
  } catch {
    throw new EnvError(`Metro at ${base} did not return an Expo manifest (got HTML or invalid JSON); is this an Expo project?`);
  }
  const want = appJson?.expo?.slug;
  const got = manifest?.extra?.expoClient?.slug;
  if (want && got !== want) throw new EnvError(`Metro at ${base} serves slug "${got}", but app.json expo.slug is "${want}".`);
  return manifest;
}

// Native mode: the built .app must exist and carry the bundle id given with --native.
async function checkNativeApp({ run, native, appPath }) {
  let isDir = false;
  try { isDir = (await fs.stat(appPath)).isDirectory(); } catch { /* reported below */ }
  if (!isDir) throw new EnvError(`--app-path ${appPath} is not a directory; pass the built .app (xcodebuild ... -derivedDataPath build, then build/Build/Products/Debug-iphonesimulator/<App>.app).`);
  const r = await run('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(appPath, 'Info.plist')]);
  if (r.code !== 0) throw new EnvError(`Cannot read CFBundleIdentifier from ${path.join(appPath, 'Info.plist')}: ${tail(r)}`);
  const got = r.stdout.trim();
  if (got !== native) throw new EnvError(`--native is "${native}", but ${appPath} has bundle id "${got}".`);
}

export async function preflight({ run, app, appJson, fetchImpl = fetch, cwd = process.cwd(), native, appPath, platform = 'ios', adb = 'adb' }) {
  const notes = [];
  if (platform === 'android') {
    const v = await run(adb, ['version']);
    if (v.code !== 0) throw new EnvError(`adb not usable (${adb} version failed: ${tail(v) || `exit ${v.code}`}); install platform-tools: sdkmanager "platform-tools".`);
    const manifest = await checkMetro({ app, appJson, fetchImpl, cwd, platform: 'android' });
    const m = await run('maestro', ['--version']);
    if (m.code !== 0) notes.push(MAESTRO_NOTE);
    return { notes, maestro: m.code === 0, runtimes: null, manifest };
  }
  const x = await run('xcode-select', ['-p']);
  if (x.code !== 0 || !x.stdout.trim()) throw new EnvError('Xcode not found (xcode-select -p failed); install Xcode and run: xcode-select --install');
  const rt = await run('xcrun', ['simctl', 'list', '-j', 'runtimes']);
  let runtimes = null;
  try { runtimes = JSON.parse(rt.stdout); } catch { /* handled below */ }
  const ios = (runtimes?.runtimes ?? []).filter((r) => r.isAvailable !== false && (r.platform === 'iOS' || /SimRuntime\.iOS-/.test(r.identifier ?? '')));
  if (rt.code !== 0 || !ios.length) throw new EnvError('No available iOS simulator runtime found; install one in Xcode > Settings > Components.');
  let manifest = null;
  if (native) await checkNativeApp({ run, native, appPath });
  else manifest = await checkMetro({ app, appJson, fetchImpl, cwd });
  const m = await run('maestro', ['--version']);
  const maestro = m.code === 0;
  if (!maestro) notes.push(MAESTRO_NOTE);
  return { notes, maestro, runtimes, manifest };
}

function sdkMajor(manifest, pkgJson) {
  const rv = /^exposdk:(\d+)/.exec(manifest?.runtimeVersion ?? '');
  if (rv) return Number(rv[1]);
  const m = /(\d+)/.exec(pkgJson?.dependencies?.expo ?? pkgJson?.devDependencies?.expo ?? '');
  if (m) return Number(m[1]);
  throw new EnvError('Cannot tell the Expo SDK version (no exposdk runtimeVersion in the manifest, no "expo" in package.json).');
}

const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== 'ESRCH'; // EPERM: it exists, we just may not signal it
  }
};

// A run killed mid-extract leaves uix-expo-go-<N>.partial-<pid>; drop those whose pid is gone.
// Only that exact name pattern is touched.
export async function removeStalePartials(cacheRoot, alive = pidAlive) {
  let names;
  try { names = await fs.readdir(cacheRoot); } catch { return []; }
  const removed = [];
  for (const n of names) {
    const m = /^uix-expo-go-\d+\.partial-(\d+)$/.exec(n);
    if (!m || alive(Number(m[1]))) continue;
    await fs.rm(path.join(cacheRoot, n), { recursive: true, force: true });
    removed.push(n);
  }
  return removed;
}

async function ensureExpoGo({ run, fetchImpl, major, cacheRoot }) {
  const dir = path.join(cacheRoot, `uix-expo-go-${major}`);
  try {
    await fs.access(dir);
    return dir;
  } catch { /* download below */ }
  await removeStalePartials(cacheRoot);
  let v;
  try {
    const r = await fetchImpl('https://api.expo.dev/v2/versions/latest', { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    v = JSON.parse(await r.text());
  } catch (e) {
    throw new EnvError(`Could not read Expo Go versions from api.expo.dev/v2/versions/latest: ${e.message}`);
  }
  const url = v?.data?.sdkVersions?.[`${major}.0.0`]?.iosClientUrl;
  if (!url) throw new EnvError(`Expo has no iOS Expo Go build for SDK ${major} (api.expo.dev/v2/versions/latest).`);
  // The tarball is ~155 MB; on a slow link 5 minutes is not enough, so allow 20. A timeout or a
  // dropped connection surfaces as an EnvError, and nothing is created on disk until the body is in.
  let bytes;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    throw new EnvError(`Downloading Expo Go failed from ${url}: ${e.message}`);
  }
  await fs.mkdir(cacheRoot, { recursive: true });
  const part = `${dir}.partial-${process.pid}`;
  await fs.rm(part, { recursive: true, force: true });
  await fs.mkdir(part, { recursive: true });
  const tgz = `${part}.tar.gz`;
  await fs.writeFile(tgz, bytes);
  const t = await run('tar', ['-xzf', tgz, '-C', part], { timeoutMs: 120000 });
  await fs.rm(tgz, { force: true });
  if (t.code !== 0) {
    await fs.rm(part, { recursive: true, force: true });
    throw new EnvError(`Extracting Expo Go failed: ${t.stderr.trim()}`);
  }
  await fs.rename(part, dir);
  return dir;
}

const hasContentAndroid = (tree) => /"(accessibilityText|text)":"[^"]/.test(JSON.stringify(tree));
const hasContent = (tree) => /"accessibilityText":"[^"]/.test(JSON.stringify(tree));
const fileOk = async (f) => { try { return (await fs.stat(f)).size > 0; } catch { return false; } };
const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex');
const DEBUG_DIR = /(\S*\/\.maestro\/tests\/[^\s'"]+)/;
const tail = (r) => `${r.stderr ?? ''}${r.stdout ?? ''}`.trim().split('\n').slice(-3).join(' ').slice(0, 300);

// Resolves once no `simctl create` is running (at most 60 s), plus one turn so createSession's
// onCreated has pushed the UDID it returned.
async function waitForSparedChildren() {
  for (let t = 0; sparedChildCount() > 0 && t < 1200; t++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setImmediate(r));
}

// SIGINT/SIGTERM/SIGHUP: stop work, kill running children, wait for an in-flight `simctl create`,
// delete every simulator created so far (udids is filled by createSession's onCreated, so a signal
// during boot is covered), then exit. An entry is an iOS udid string, or an object with its own
// `remove(run)` (Android AVDs: see androidEntry) that prints as its label. The loop shifts from udids, so one that arrives while a
// delete is in flight is deleted too; isAborted() stops createSession from creating another.
export function makeSignalCleanup({
  run, udids, keep, exit = process.exit, killChildren = killLiveChildren, waitForCreates = waitForSparedChildren,
  log = (l) => process.stderr.write(l),
}) {
  let aborted = false;
  const cleanup = async (code) => {
    aborted = true;
    try {
      killChildren();
      await waitForCreates();
      if (keep) for (const u of udids) log(`kept: ${u}\n`);
      else {
        while (udids.length) {
          const u = udids.shift();
          if (typeof u !== 'string') {
            await u.remove(run).catch(() => {});
            continue;
          }
          await run('xcrun', ['simctl', 'shutdown', u]).catch(() => {});
          await run('xcrun', ['simctl', 'delete', u]).catch(() => {});
        }
      }
    } finally {
      exit(code);
    }
  };
  cleanup.isAborted = () => aborted;
  return cleanup;
}

// A created Android AVD for the signal list. The serial arrives after the emulator spawns and
// answers with this AVD's name (set it then); `kill` and `exited` come from the session (group kill of
// the launcher, and whether the launcher was seen to exit). remove asks the emulator to stop (only an
// emulator-<port> serial this run reported, and only while it still reports this AVD), waits up to
// waitMs for the launcher to exit, kills its process group if it has not, then deletes the AVD (uix-* only).
export function androidEntry({ avd, serial = null, tools, kill = null, exited = null, sleep = defaultSleep, waitMs = 5000 }) {
  const e = {
    avd, serial, tools, kill, exited,
    toString: () => `${e.avd}${e.serial ? ` ${e.serial}` : ''}`,
    async remove(run) {
      if (e.serial && /^emulator-\d+$/.test(e.serial)) {
        const who = await run(e.tools.adb, ['-s', e.serial, 'emu', 'avd', 'name']).catch(() => null);
        if (who && who.code === 0 && String(who.stdout).split('\n')[0].trim() === e.avd) await run(e.tools.adb, ['-s', e.serial, 'emu', 'kill']).catch(() => {});
      }
      if (e.kill) {
        for (let t = 0; t < waitMs && !e.exited?.(); t += 250) await sleep(250);
        if (!e.exited?.()) e.kill();
      }
      if (e.avd.startsWith('uix-')) await run(e.tools.avdmanager, ['delete', 'avd', '-n', e.avd]).catch(() => {});
    },
  };
  return e;
}

// on, not once: a second Ctrl-C during cleanup must not fall back to Node's default and kill the
// process mid-delete.
export function installSignalHandlers(proc, cleanup) {
  let cleaning = false;
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    proc.on(sig, () => {
      if (cleaning) return;
      cleaning = true;
      Promise.resolve(cleanup(code)).catch(() => {});
    });
  }
}

// One simctl openurl, tried up to 3 times; returns the last result.
export async function openUrlRetry(run, sleep, udid, url) {
  let r;
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(OPENURL_RETRY_MS);
    r = await openUrl(run, udid, url);
    if (r.code === 0) break;
  }
  return r;
}

// Cold root, wait, then the route warm (no terminate between). Returns the last open's result.
// beforeOpen runs right before the open that shows the route (the --video recording starts there).
export async function openRoute({ run, sleep, read }, sim, app, route, wait, file, beforeOpen) {
  await run('xcrun', ['simctl', 'terminate', sim.udid, EXPO_GO]); // non-zero (not running) is fine
  if (beforeOpen && route.path === '/') beforeOpen();
  const root = await openUrlRetry(run, sleep, sim.udid, deepLink(app, '/'));
  if (root.code !== 0 && route.path !== '/') return { ...root, atRoot: true };
  if (root.code !== 0 || route.path === '/') return root;
  await settle(run, sim.udid, { file, sleep, ...wait, ...(read ? { read } : {}) });
  if (beforeOpen) beforeOpen();
  return openUrlRetry(run, sleep, sim.udid, deepLink(app, route.path));
}

const openFailure = (o, route, sim) => (o.atRoot
  ? `Opening the app root before route "${route.name}" on ${sim.name} failed: ${tail(o)}`
  : `Opening route "${route.name}" (${route.args ? (route.args.length ? `args: ${route.args.join(' ')}` : 'no args') : route.path}) on ${sim.name} failed: ${tail(o)}`);

// Native mode: terminate, then launch the bundle with the route's launch arguments. A wait settles the
// screen after the launch (the retry passes ROOT_WAIT_LONG); the first open leaves that to the shot's settle.
export async function launchRoute({ run, sleep, read }, sim, bundle, args, wait, file, beforeOpen) {
  await run('xcrun', ['simctl', 'terminate', sim.udid, bundle]); // non-zero (not running) is fine
  if (beforeOpen) beforeOpen();
  const r = await run('xcrun', ['simctl', 'launch', assertUdid(sim.udid), bundle, ...args]);
  if (r.code === 0 && wait) await settle(run, sim.udid, { file, sleep, ...wait, ...(read ? { read } : {}) });
  return r;
}

export async function runMobileCheck(opts, deps = {}) {
  const {
    run = defaultRun, sleep = defaultSleep, fetchImpl = fetch, read, now, cacheRoot = os.tmpdir(), cwd = process.cwd(), onCreated, isAborted,
    log = (l) => process.stderr.write(l), tmpRoot = os.tmpdir(), fs: fsx = fs, debugRoot = path.join(os.homedir(), '.maestro', 'tests'),
    sdk: sdkDep, tools: toolsDep, spawn, adbDevices, logDir, readdir, arch,
  } = deps;
  const { app, routes, modes, out, video, flow, keep, appJson, pkgJson, native, appPath } = opts;
  const android = opts.platform === 'android';
  if (android && native) throw new EnvError('--platform android supports Expo apps (--app) only; native Android apps are not supported yet');
  let sdk = null;
  let tools = null;
  if (android) {
    sdk = sdkDep ?? await androidSdk({ run });
    tools = toolsDep ?? await androidTools({ sdk });
  }
  const pre = await preflight({ run, app, appJson, fetchImpl, cwd, native, appPath, platform: android ? 'android' : 'ios', adb: tools?.adb });
  const notes = [...pre.notes];
  const shots = [];
  const findings = [];
  let devices;
  let expoDir = null;
  let apk = null;
  let session;
  let metroPort = null;
  let appUrl = app; // adb reverse makes Metro reachable at 127.0.0.1 inside the emulator
  let ops = null;
  const runId = `${process.pid}-${Date.now().toString(36)}`;
  if (android) {
    const port = /^exp:\/\/[^/]+:(\d+)(\/|$)/.exec(app)?.[1];
    if (!port) throw new EnvError(`--app must include a port, like exp://127.0.0.1:8081 (got "${app}").`);
    appUrl = app.replace(/^exp:\/\/[^/]+/, `exp://127.0.0.1:${port}`);
    metroPort = port;
    devices = await pickAndroidDevices(opts.devices ?? undefined, { sdk, readdir, arch });
    apk = await ensureExpoGoApk({ fetchImpl, major: sdkMajor(pre.manifest, pkgJson), cacheRoot });
    await fs.mkdir(out, { recursive: true });
    session = await createAndroidSession({
      run, spawn, sleep, sdk, devices, runId, isAborted, keep, adbDevices, logDir, tools,
      onCreated: (s) => onCreated?.({ ...s, platform: 'android', tools }),
    });
    ops = androidOps({ run, sleep, allowed: session.allowed, adb: tools.adb });
    if (video) notes.push(ANDROID_VIDEO_NOTE);
  } else {
    const dt = await run('xcrun', ['simctl', 'list', '-j', 'devicetypes']);
    let types;
    try { types = JSON.parse(dt.stdout); } catch { throw new EnvError('Could not read simulator device types (xcrun simctl list -j devicetypes).'); }
    devices = pickDevices(types, pre.runtimes, opts.devices ?? undefined);
    expoDir = native ? null : await ensureExpoGo({ run, fetchImpl, major: sdkMajor(pre.manifest, pkgJson), cacheRoot });
    await fs.mkdir(out, { recursive: true });
    session = await createSession(run, { devices, runId, onCreated, isAborted, keep });
  }
  if (keep) notes.push(...session.sims.map((s) => `kept: ${s.name} ${s.udid}`));
  const open = async (udid, url) => {
    await run('xcrun', ['simctl', 'terminate', udid, EXPO_GO]);
    return openUrlRetry(run, sleep, udid, url);
  };
  // What differs between the modes: how the app gets onto a simulator and how a screen is opened.
  // The shot loop, hierarchy, flow and device code are shared.
  const devNotes = new Map(); // serial -> { notes, said } for the Android open's dismissal notes
  // One Android open: re-asserts the adb reverse, opens, and after a ready open turns off the Continue sheet /
  // Tools button if they show (they can come back after a force-stop).
  const openAndroid = async (sim, url) => {
    const o = await ops.openExpoUrl(sim.udid, url, { port: metroPort });
    if (o.code === 0 && o.ready) {
      const fo = await ops.dismissExpoGoFirstOpen(sim.udid, { xml: o.xml });
      const dn = devNotes.get(sim.udid);
      if (dn) {
        for (const n of fo.notes ?? []) if (!dn.said.has(n)) { dn.said.add(n); dn.notes.push(`unverified: ${n.replace(sim.udid, sim.deviceName ?? sim.name)}`); }
      }
    }
    return o;
  };
  const androidTarget = android
    ? {
      firstWait: null,
      open: (sim, route) => openAndroid(sim, deepLink(appUrl, route.path)),
      openRoot: (sim) => openAndroid(sim, deepLink(appUrl, '/')),
      notNavigated: (route, dev, mode, twin) => `${route.name} (${route.path}) on ${dev} ${mode} shows the same screen as ${twin}; the deep link did not navigate or the app was still loading; see react-native.md "Deep links in Expo Go"`,
    }
    : null;
  const target = androidTarget ?? (native
    ? {
      install: (sim) => run('xcrun', ['simctl', 'install', sim.udid, appPath]),
      what: 'app install',
      firstWait: null,
      open: (sim, route, wait, file, beforeOpen) => launchRoute({ run, sleep, read }, sim, native, route.args, wait, file, beforeOpen),
      openRoot: async (sim) => {
        await run('xcrun', ['simctl', 'terminate', sim.udid, native]);
        return run('xcrun', ['simctl', 'launch', assertUdid(sim.udid), native]);
      },
      notNavigated: (route, dev, mode, twin) => `${route.name} (${route.args.length ? `args: ${route.args.join(' ')}` : 'no args'}) on ${dev} ${mode} shows the same screen as ${twin}; the app ignored the launch arguments or was still loading; see swiftui.md "How to check"`,
    }
    : {
      install: (sim) => run('xcrun', ['simctl', 'install', sim.udid, expoDir]),
      what: 'Expo Go install',
      firstWait: ROOT_WAIT,
      open: (sim, route, wait, file, beforeOpen) => openRoute({ run, sleep, read }, sim, app, route, wait, file, beforeOpen),
      openRoot: (sim) => open(sim.udid, deepLink(app, '/')),
      notNavigated: (route, dev, mode, twin) => `${route.name} (${route.path}) on ${dev} ${mode} shows the same screen as ${twin}; the deep link did not navigate or the app was still loading; see react-native.md "Deep links in Expo Go"`,
    });
  const appErrorFinding = (o, route, mode, d) => ({
    rule: 'app-error', severity: 'error', route: route.name,
    message: `Expo Go could not load the app on ${devices[d].name} (${route.name} ${mode}): ${o.appError}; is Metro running on port ${metroPort}?`,
  });
  const need = (r, what) => {
    if (r.code !== 0) throw new EnvError(`${what} failed: ${tail(r)}`);
  };
  let flowDir = null;
  let mineAll = [];
  // Device 0's items first, then device 1's: the order a serial run gives.
  let collected = false;
  const collect = () => {
    if (collected) return;
    collected = true;
    for (const m of mineAll) { shots.push(...m.shots); findings.push(...m.findings); notes.push(...m.notes); }
  };
  try {
    let flowFile = null;
    if (pre.maestro && !native && !android) {
      flowDir = await fs.mkdtemp(path.join(tmpRoot, 'uix-flow-'));
      flowFile = path.join(flowDir, 'first-open.yaml');
      await fs.writeFile(flowFile, FIRST_FLOW);
    }
    const small = session.sims[0];
    if (!pre.maestro && !native && !android) notes.push('Expo Go first-open prompt was not dismissed (maestro missing); screenshots may show it.');
    if (pre.maestro && !modes.includes('light')) notes.push('hierarchy skipped: light mode not requested');
    else if (pre.maestro && opts.devices) notes.push(`hierarchy device: ${devices[0].name}`);
    let firstHierarchy = true;
    let nativeNoted = false;
    const total = session.sims.length * routes.length * modes.length;
    let step = 0;
    const readBytes = read ?? fs.readFile;
    const shootOpt = android ? { shoot: (u, f) => ops.screenshot(u, f) } : {};
    // Maestro's iOS driver is not safe to drive twice at once: every maestro command goes through one queue.
    let maestroTail = Promise.resolve();
    const qrun = (cmd, args, o) => {
      if (cmd !== 'maestro') return run(cmd, args, o);
      const p = maestroTail.then(() => (isAborted?.() ? { code: 130, stdout: '', stderr: 'aborted' } : run(cmd, args, o)));
      maestroTail = p.catch(() => {});
      return p;
    };
    const runDevice = async (d, mine) => {
      const sim = session.sims[d];
      const dev = fileSlug(devices[d].name);
      const { shots: dShots, findings: dFindings, notes: dNotes } = mine;
      let density = 160;
      if (android) {
        need(await ops.installApk(sim.udid, apk), `Expo Go install on ${sim.name}`);
        need(await ops.reversePort(sim.udid, metroPort), `adb reverse tcp:${metroPort} on ${sim.name}`);
        need(await ops.setDemoStatusBar(sim.udid), `status bar override on ${sim.name}`);
        if (pre.maestro) density = await ops.screenDensity(sim.udid);
        devNotes.set(sim.udid, { notes: dNotes, said: new Set() });
        const first = await target.open(sim, routes[0]);
        if (!first.appError) need(first, `opening ${routes[0].name}`); // an error screen is reported on the shot that follows
      } else {
        need(await setStatusBar(run, sim.udid), `status bar override on ${sim.name}`);
        need(await target.install(sim), `${target.what} on ${sim.name}`);
      }
      if (!native && !android) {
        const ob = await skipExpoOnboarding(run, sim.udid);
        if (ob.code !== 0) dNotes.push(`unverified: could not pre-dismiss the Expo Go onboarding on ${sim.name}: ${tail(ob)}`);
      }
      if (pre.maestro && !native && !android) {
        need(await open(sim.udid, deepLink(app, routes[0].path)), `opening ${routes[0].name}`);
        const f = await qrun('maestro', ['--device', sim.udid, 'test', flowFile], { timeoutMs: 180000 });
        if (f.code !== 0) dNotes.push(`unverified: first-open prompt flow on ${sim.name} failed: ${tail(f)}`);
      }
      const seen = new Map(); // mode -> Map(sha1 -> route name)
      for (const route of routes) {
        for (const mode of modes) {
          const rec = video && !android && mode === modes[0] ? path.join(out, `${dev}-${fileSlug(route.name)}.mp4`) : null;
          const file = path.join(out, `${dev}-${fileSlug(route.name)}-${mode}.png`);
          if (android) need(await ops.setNightMode(sim.udid, mode === 'dark'), `setting night mode on ${sim.name}`);
          else need(await setAppearance(run, sim.udid, mode === 'dark' ? 'dark' : 'light'), `setting appearance on ${sim.name}`);
          log(`check-mobile: [${++step}/${total}] ${devices[d].name} ${route.name} ${mode}\n`);
          let failure = null;
          let recording = null;
          let notNavigated = false;
          try {
            if (mode === 'xxxl' && android) {
              need(await ops.setFontScale(sim.udid, 2.0), `setting font scale on ${sim.name}`);
              need(await ops.setDemoStatusBar(sim.udid), `status bar override on ${sim.name}`); // a font_scale change resets the clock
            } else if (mode === 'xxxl') need(await setContentSize(run, sim.udid, BIG_TEXT), `setting text size on ${sim.name}`);
            const startRec = rec ? () => { recording = run('xcrun', ['simctl', 'io', sim.udid, 'recordVideo', rec], { timeoutMs: 3000, killSignal: 'SIGINT' }); } : null;
            const o = await target.open(sim, route, target.firstWait, file, startRec);
            if (o.appError) {
              // Expo Go's "Something went wrong." screen: keep the shot, report it, no hash / hierarchy for it.
              await settle(run, sim.udid, { file, sleep, minMs: 1000, capMs: 3000, ...shootOpt, ...(read ? { read } : {}) });
              dFindings.push(appErrorFinding(o, route, mode, d));
              dShots.push(file);
              notNavigated = true;
              continue;
            }
            if (o.code !== 0) throw new EnvError(openFailure(o, route, sim));
            if (recording) {
              await recording;
              recording = null;
              dNotes.push((await fileOk(rec)) ? `video: ${rec}` : `video failed: ${rec}`);
            }
            await settle(run, sim.udid, { file, sleep, ...(android ? ANDROID_SETTLE : {}), ...shootOpt, ...(read ? { read } : {}) });
            let ready = o.ready;
            const hashes = seen.get(mode) ?? seen.set(mode, new Map()).get(mode);
            let hash = sha1(await readBytes(file));
            let twin = hashes.get(hash);
            const declared = (t) => route.sameAs === t || routes.find((r) => r.name === t)?.sameAs === route.name || (route.sameAs !== undefined && routes.find((r) => r.name === t)?.sameAs === route.sameAs);
            if (twin !== undefined && declared(twin)) {
              // Declared look-alike (sameAs in the routes file): no retry, no finding.
            } else if (twin !== undefined) {
              // Same pixels as an earlier route: the deep link may not have navigated, or the splash
              // was still up. Reopen once with a doubled wait.
              const o2 = await target.open(sim, route, ROOT_WAIT_LONG, file);
              if (o2.appError) {
                await settle(run, sim.udid, { file, sleep, minMs: 1000, capMs: 3000, ...shootOpt, ...(read ? { read } : {}) });
                dFindings.push(appErrorFinding(o2, route, mode, d));
                dShots.push(file);
                notNavigated = true;
                continue;
              }
              if (o2.code !== 0) throw new EnvError(openFailure(o2, route, sim));
              ready = o2.ready;
              await settle(run, sim.udid, { file, sleep, ...(android ? ANDROID_SETTLE_RETRY : { minMs: 3000 }), ...shootOpt, ...(read ? { read } : {}) });
              hash = sha1(await readBytes(file));
              twin = hashes.get(hash);
              if (twin !== undefined) {
                notNavigated = true;
                dFindings.push({
                  rule: 'route-not-navigated', severity: 'error', route: route.name,
                  message: target.notNavigated(route, devices[d].name, mode, twin),
                });
              }
            }
            if (twin === undefined) hashes.set(hash, route.name);
            if (android && ready === false) dNotes.push(`unverified: ${devices[d].name} ${route.name} ${mode}: app did not report it started within 45s`);
            dShots.push(file);
          } catch (e) {
            failure = e;
            throw e;
          } finally {
            if (recording) await recording.catch(() => {});
            if (mode === 'xxxl' && android) {
              let r = await ops.setFontScale(sim.udid, 1.0);
              const bar = await ops.setDemoStatusBar(sim.udid); // the reset clears the demo clock too
              if (r.code === 0) r = bar;
              if (r.code !== 0 && !failure) throw new EnvError(`resetting font scale on ${sim.name} failed: ${tail(r)}`);
            } else if (mode === 'xxxl') {
              const r = await setContentSize(run, sim.udid, 'large');
              if (r.code !== 0 && !failure) throw new EnvError(`resetting text size on ${sim.name} failed: ${tail(r)}`);
            }
          }
          if (d === 0 && mode === 'light' && pre.maestro && !notNavigated) {
            const h = await readHierarchy(qrun, small.udid, { sleep, ...(now ? { now } : {}), timeoutMs: firstHierarchy ? 90000 : 45000, until: android ? hasContentAndroid : hasContent });
            firstHierarchy = false;
            if (native && !nativeNoted && h.tree) {
              nativeNoted = true;
              dNotes.push(NATIVE_HIERARCHY_NOTE);
            }
            if (h.note) dNotes.push(`unverified: hierarchy on ${devices[d].name} ${route.name}: ${h.note.replace(/^unverified: /, '')}`);
            if (h.tree) dFindings.push(...findingsFromHierarchy(h.tree, { route: route.name, native: Boolean(native), ...(android ? { platform: 'android', density } : {}) }));
          }
        }
      }
    };
    const mine = session.sims.map(() => ({ shots: [], findings: [], notes: [] }));
    mineAll = mine;
    const results = await Promise.allSettled(session.sims.map((_, d) => runDevice(d, mine[d])));
    collect();
    const bad = results.find((r) => r.status === 'rejected');
    results.forEach((r, d) => {
      if (r.status === 'rejected' && r !== bad) notes.push(`failed on ${devices[d].name}: ${String(r.reason?.message ?? r.reason).replace(/\s+/g, ' ').trim()}`);
    });
    if (bad) throw bad.reason;
    if (flow && pre.maestro) {
      let flowRun = flow;
      if (android) {
        // Expo Go's Android package id is host.exp.exponent; run a temp copy of the flow with that appId.
        try {
          const text = await fs.readFile(flow, 'utf8');
          flowDir ??= await fs.mkdtemp(path.join(tmpRoot, 'uix-flow-'));
          flowRun = path.join(flowDir, 'flow-android.yaml');
          await fs.writeFile(flowRun, text.replace(/appId:\s*host\.exp\.Exponent\b/g, 'appId: host.exp.exponent'));
          notes.push(ANDROID_FLOW_NOTE);
        } catch (e) {
          flowRun = flow;
          notes.push(`unverified: could not rewrite the flow appId for Android: ${String(e?.message ?? e).replace(/\s+/g, ' ').trim()}`);
        }
      }
      // Start from the app root, not from wherever the last route left Expo Go.
      const startFlow = async () => {
        const root = await target.openRoot(small);
        if (root.code !== 0) {
          findings.push({ rule: 'flow-failed', severity: 'error', message: `Maestro flow ${flow} not run: could not open the app root before the flow: ${tail(root)}`, route: null });
          return null;
        }
        return qrun('maestro', ['--device', small.udid, 'test', flowRun], { timeoutMs: 300000 });
      };
      let f = await startFlow();
      if (f && f.code !== 0 && DRIVER_DROPPED.test(`${f.stderr ?? ''}\n${f.stdout ?? ''}\n${(await failedCommand(f, fsx, debugRoot))?.message ?? ''}`)) {
        notes.push('flow retried once: maestro driver connection dropped');
        f = await startFlow();
      }
      if (f && f.code !== 0) findings.push({ rule: 'flow-failed', severity: 'error', message: await flowFailure(f, flow, out, fsx, debugRoot), route: null });
    }
    return { shots, findings, notes };
  } catch (e) {
    collect();
    notes.push(`failed: ${String(e?.message ?? e).replace(/\s+/g, ' ').trim()}`);
    if (e && typeof e === 'object') e.partial = { shots, findings, notes };
    throw e;
  } finally {
    if (flowDir) await fs.rm(flowDir, { recursive: true, force: true });
    await session.cleanup(keep);
  }
}

const DRIVER_DROPPED = /Failed to connect to \/?127\.0\.0\.1|Connection refused/;

// Maestro's debug folder from its output, only when it is inside the debug root (the path comes from process output).
function debugDirOf(f, debugRoot) {
  const found = DEBUG_DIR.exec(`${f.stderr ?? ''}\n${f.stdout ?? ''}`)?.[1];
  const root = path.resolve(debugRoot);
  const dir = found ? path.resolve(found) : null;
  return dir && (dir === root || dir.startsWith(root + path.sep)) ? dir : null;
}

// The first FAILED entry of the debug folder's commands-*.json: {key, selector, message}, or null.
async function failedCommand(f, fsx, debugRoot) {
  const dir = debugDirOf(f, debugRoot);
  if (!dir) return null;
  try {
    for (const n of (await fsx.readdir(dir)).filter((x) => /^commands-.*\.json$/.test(x)).sort()) {
      if ((await fsx.lstat(path.join(dir, n))).isSymbolicLink()) continue;
      const hit = JSON.parse(await fsx.readFile(path.join(dir, n), 'utf8')).find((e) => e?.metadata?.status === 'FAILED');
      if (!hit) continue;
      const key = Object.keys(hit.command ?? {})[0];
      const sel = hit.command?.[key]?.selector;
      return {
        key: key ?? 'command',
        selector: sel?.textRegex ?? sel?.idRegex,
        message: String(hit.metadata?.error?.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
      };
    }
  } catch { /* unreadable or malformed: the tail is enough */ }
  return null;
}

// The failing step (first FAILED/❌ line, else the failed command in the debug folder, else the tail),
// plus a copy of Maestro's first debug screenshot when its output names the debug folder.
async function flowFailure(f, flow, out, fsx, debugRoot) {
  const text = `${f.stderr ?? ''}\n${f.stdout ?? ''}`;
  let step = text.split('\n').map((l) => l.trim()).find((l) => /FAILED|❌/.test(l));
  if (!step) {
    const c = await failedCommand(f, fsx, debugRoot);
    step = c ? `${c.key}${c.selector ? ` "${c.selector}"` : ''}${c.message ? `: ${c.message}` : ''}` : tail(f);
  }
  let msg = `Maestro flow ${flow} failed: ${step}`;
  const dir = debugDirOf(f, debugRoot);
  if (dir) {
    try {
      let png;
      for (const n of (await fsx.readdir(dir)).filter((x) => x.endsWith('.png')).sort()) {
        if (!(await fsx.lstat(path.join(dir, n))).isSymbolicLink()) { png = n; break; }
      }
      if (png) {
        const dest = path.join(out, 'flow-failed.png');
        await fsx.copyFile(path.join(dir, png), dest);
        msg += ` screenshot: ${dest}`;
      }
    } catch { /* the folder is gone or unreadable: the step line is enough */ }
  }
  return msg;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function main(argv, { check = runMobileCheck, proc = process, run = defaultRun } = {}) {
  const args = parseArgs(argv);
  if (args.error) {
    proc.stderr.write(`check-mobile.mjs: ${args.error}\n${USAGE}\n`);
    return 2;
  }
  const udids = [];
  const kept = [];
  const cleanup = makeSignalCleanup({ run, udids, keep: args.keep, exit: (c) => proc.exit(c) });
  installSignalHandlers(proc, cleanup);
  try {
    const routes = filterRoutes(await loadRoutes(args.routes, args.native ? 'native' : 'expo'), args.only);
    const appJson = args.native ? null : await readJson('app.json');
    if (!appJson && !args.native) throw new EnvError('app.json not found in the current directory; run check-mobile.mjs from the Expo project root.');
    const pkgJson = args.native ? null : await readJson('package.json');
    const onCreated = (s) => {
      if (s.platform !== 'android') {
        udids.push(s.udid);
        kept.push(s);
        return;
      }
      // Android: reported at create (no serial yet) and again after spawn (serial); one entry per AVD.
      let e = udids.find((u) => typeof u !== 'string' && u.avd === s.name);
      if (e) {
        e.serial = s.udid;
        if (s.kill) { e.kill = s.kill; e.exited = s.exited; }
      } else udids.push(e = androidEntry({ avd: s.name, serial: s.udid, tools: s.tools, kill: s.kill, exited: s.exited }));
      const k = kept.find((x) => x.name === s.name);
      if (k) k.udid = s.udid;
      else kept.push({ name: s.name, udid: s.udid });
    };
    const { shots, findings, notes } = await check({ ...args, routes, appJson, pkgJson }, { onCreated, isAborted: cleanup.isAborted });
    proc.stdout.write(JSON.stringify({ shots, findings, notes }, null, 2) + '\n');
    return findings.some((f) => f.severity === 'error') ? 1 : 0;
  } catch (err) {
    proc.stderr.write(`check-mobile.mjs: ${err.message}\n`);
    if (err.partial) proc.stdout.write(JSON.stringify(err.partial, null, 2) + '\n');
    if (args.keep) for (const s of kept) proc.stderr.write(`kept: ${s.name}${s.udid ? ` ${s.udid}` : ''}\n`);
    return 2;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
