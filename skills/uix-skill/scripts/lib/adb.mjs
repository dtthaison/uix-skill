// Android emulator helpers for check-mobile. Every function takes an injected `run` (and `spawn`,
// `sleep`, `fetchImpl`) so tests never touch a real emulator. Device safety: the session owns a Set
// of serials it started; every per-device helper asserts membership, and there is no adb call
// against a device without `-s <serial>` except the read-only `adb devices` listing.
import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EnvError, defaultSleep, trackChild, slug } from './sim.mjs';

export const EXPO_GO_ANDROID = 'host.exp.exponent';
export const OPENURL_RETRY_MS = 5000;
const EXPO_GO_ID = 'host.exp.exponent:id/';
const READY_CAP_MS = 45000;
const READY_DUMP = 'uiautomator dump /sdcard/uix-ui.xml >/dev/null 2>&1 && cat /sdcard/uix-ui.xml';
export const BASE_PORT = 5600;
const MAX_PORT = 5682; // emulator console ports end here

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export const DEVICE_IDS = {
  'Small Phone': 'small_phone',
  'Medium Phone': 'medium_phone',
  'Pixel 7': 'pixel_7',
  'Pixel 8': 'pixel_8',
  'Pixel 9': 'pixel_9',
  'Pixel 9 Pro XL': 'pixel_9_pro_xl',
  'Pixel 9a': 'pixel_9a',
};
export const DEFAULT_ANDROID_DEVICES = ['Small Phone', 'Pixel 9 Pro XL'];

export async function androidSdk({ env = process.env, run, realpath = (p) => fs.realpath(p), home = os.homedir() } = {}) {
  const has = async (root) => {
    try { await fs.access(path.join(root, 'emulator', 'emulator')); return true; } catch { return false; }
  };
  const cands = [];
  if (env.ANDROID_HOME) cands.push(env.ANDROID_HOME);
  if (env.ANDROID_SDK_ROOT) cands.push(env.ANDROID_SDK_ROOT);
  if (run) {
    const w = await run('sh', ['-c', 'command -v sdkmanager']);
    const p = w.code === 0 ? w.stdout.trim() : '';
    if (p) {
      try {
        const real = await realpath(p);
        cands.push(real.replace(/\/cmdline-tools\/[^/]+\/bin\/sdkmanager$/, ''));
      } catch { /* not resolvable */ }
    }
  }
  cands.push(path.join(home, 'Library', 'Android', 'sdk'));
  for (const c of cands) if (await has(c)) return c;
  throw new EnvError(`Android SDK with the emulator not found (looked in: ${cands.join(', ')}). Install it: brew install --cask android-commandlinetools, then sdkmanager "emulator" "platform-tools".`);
}

// The same device twice gives the same AVD name, and the second create would fail late.
function assertNoDuplicates(names) {
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup !== undefined) throw new EnvError(`Android device "${dup}" is listed twice in --devices; name each device once.`);
}

export async function pickAndroidDevices(requested, { sdk, readdir = (p) => fs.readdir(p), arch = process.arch } = {}) {
  const wanted = requested?.length ? requested : DEFAULT_ANDROID_DEVICES;
  assertNoDuplicates(wanted);
  const abi = arch === 'arm64' ? 'arm64-v8a' : 'x86_64';
  const known = Object.keys(DEVICE_IDS);
  const ids = wanted.map((name) => {
    if (DEVICE_IDS[name]) return { name, deviceId: DEVICE_IDS[name] };
    if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(name)) return { name, deviceId: name };
    throw new EnvError(`Android device "${name}" is not known; use one of: ${known.join(', ')}.`);
  });
  const root = path.join(sdk, 'system-images');
  let levels = [];
  try {
    levels = (await readdir(root)).map((d) => /^android-(\d+)$/.exec(d)?.[1]).filter(Boolean).map(Number).sort((a, b) => b - a);
  } catch { /* none installed */ }
  let image = null;
  for (const tag of ['google_apis', 'google_apis_playstore', 'default']) {
    for (const n of levels) {
      let abis = [];
      try { abis = await readdir(path.join(root, `android-${n}`, tag)); } catch { /* tag absent */ }
      if (abis.includes(abi)) { image = `system-images;android-${n};${tag};${abi}`; break; }
    }
    if (image) break;
  }
  if (!image) throw new EnvError(`No Android system image for ${abi} under ${root}. Install one: sdkmanager "system-images;android-35;google_apis;${abi}"`);
  return ids.map((d) => ({ ...d, image }));
}

// Tool paths from the SDK root: Android Studio users have nothing on PATH.
export async function androidTools({ sdk, exists = (p) => fs.access(p).then(() => true, () => false), readdir = (p) => fs.readdir(p) }) {
  const platformAdb = path.join(sdk, 'platform-tools', 'adb');
  const adb = (await exists(platformAdb)) ? platformAdb : 'adb';
  let avdmanager = 'avdmanager';
  const latest = path.join(sdk, 'cmdline-tools', 'latest', 'bin', 'avdmanager');
  if (await exists(latest)) avdmanager = latest;
  else {
    let dirs = [];
    try { dirs = (await readdir(path.join(sdk, 'cmdline-tools'))).sort(); } catch { /* none */ }
    for (const d of dirs) {
      const p = path.join(sdk, 'cmdline-tools', d, 'bin', 'avdmanager');
      if (await exists(p)) { avdmanager = p; break; }
    }
  }
  return { adb, avdmanager, emulator: path.join(sdk, 'emulator', 'emulator') };
}

// The emulator forks qemu; the detached launcher leads its process group, so kill the group.
const killTree = (child) => {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
};

export function assertSerial(serial, allowed) {
  if (typeof serial !== 'string' || !/^emulator-\d+$/.test(serial) || !allowed?.has(serial)) {
    throw new EnvError(`refusing to use Android device "${serial ?? ''}": it is not an emulator this run started`);
  }
  return serial;
}

const parseSerials = (out) => out.split('\n').slice(1).map((l) => l.split(/\s+/)[0]).filter((s) => /^emulator-\d+$/.test(s));

export async function createAndroidSession({
  run, spawn = nodeSpawn, sleep = defaultSleep, sdk, devices, runId, onCreated, isAborted = () => false, keep = false,
  adbDevices, logDir, env = process.env, tools, kill = killTree,
}) {
  assertNoDuplicates(devices.map((d) => d.name));
  tools ??= await androidTools({ sdk });
  const adbList = async () => {
    const r = await run(tools.adb, ['devices']);
    if (r.code !== 0) throw new Error(`adb devices failed: ${r.stderr}`);
    return r;
  };
  const listSerials = adbDevices ?? (async () => parseSerials((await adbList()).stdout));
  const sims = [];
  const allowed = new Set();
  const procs = new Map(); // avd -> { child, exited }
  const emulator = tools.emulator;
  // The AVD name the emulator on `serial` reports, or null when it does not answer.
  const avdNameOn = async (serial) => {
    const r = await run(tools.adb, ['-s', serial, 'emu', 'avd', 'name']).catch(() => null);
    return r && r.code === 0 ? (r.stdout.split('\n')[0] ?? '').trim() || null : null;
  };
  const removeAll = async () => {
    for (const s of sims) {
      const proc = procs.get(s.avd);
      let gone = true;
      // Only talk to the serial while it still reports our AVD: another emulator may have taken the port.
      if (s.udid && allowed.has(s.udid) && (await avdNameOn(s.udid)) === s.avd) {
        await run(tools.adb, ['-s', s.udid, 'emu', 'kill']).catch(() => {});
        gone = false;
        for (let i = 0; i < 20 && !gone; i++) {
          // A failed listing is not proof that the serial left.
          const list = await listSerials().catch(() => null);
          if (list && !list.includes(s.udid)) { gone = true; break; }
          await sleep(1000);
        }
      }
      // The emulator may never have shown up on adb: kill its process group unless the launcher was seen to exit.
      if (proc && (!gone || !proc.exited)) kill(proc.child);
      if (s.avd.startsWith('uix-')) await run(tools.avdmanager, ['delete', 'avd', '-n', s.avd]).catch(() => {});
    }
  };
  try {
    const logs = logDir ?? await fs.mkdtemp(path.join(os.tmpdir(), 'uix-emulator-'));
    await fs.mkdir(logs, { recursive: true });
    for (const d of devices) {
      if (isAborted()) throw new EnvError('aborted by signal before creating the next emulator');
      const avd = `uix-${slug(d.name)}-${runId}`;
      const sim = { name: avd, udid: null, avd, port: null, deviceName: d.name };
      sims.push(sim);
      onCreated?.({ name: avd, udid: null }); // the planned AVD, so a signal during create can still delete it
      const c = await run('sh', ['-c', `echo no | ${q(tools.avdmanager)} create avd -n ${q(avd)} -k ${q(d.image)} -d ${q(d.deviceId)}`], { timeoutMs: 120000 });
      if (c.code !== 0) throw new EnvError(`avdmanager create failed for ${d.name}: ${(c.stderr || c.stdout).trim()}`);
      if (isAborted()) throw new EnvError('aborted by signal after creating an emulator');
      const used = new Set(parseUsed(await listSerials(), sims));
      let port = BASE_PORT;
      while (used.has(port)) port += 2;
      if (port > MAX_PORT) throw new EnvError(`no free emulator port between ${BASE_PORT} and ${MAX_PORT}; stop some emulators and run again.`);
      const serial = `emulator-${port}`;
      sim.port = port;
      const fd = openSync(path.join(logs, `${avd}.log`), 'a');
      let child;
      try {
        child = spawn(emulator, ['-avd', avd, '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim', '-port', String(port)],
          { detached: true, stdio: ['ignore', fd, fd], env: { ...env, ANDROID_SDK_ROOT: sdk } });
      } catch (e) {
        sim.port = null;
        throw e;
      } finally { closeSync(fd); }
      const proc = { child, exited: false };
      procs.set(avd, proc);
      const untrack = trackChild(child);
      child.once?.('exit', () => { proc.exited = true; untrack(); });
      child.unref?.();
      // The serial is reported (and allowed) only once it answers with our AVD name.
      const handle = { kill: () => kill(child), exited: () => proc.exited };
      onCreated?.({ name: avd, udid: null, ...handle });
      const w = await run(tools.adb, ['-s', serial, 'wait-for-device'], { timeoutMs: 180000 });
      if (w.code !== 0) throw new EnvError(`emulator ${d.name} did not appear on adb: ${(w.stderr || w.stdout).trim()}`);
      let seen = await avdNameOn(serial);
      for (let i = 0; i < 5 && seen === null; i++) { await sleep(1000); seen = await avdNameOn(serial); } // the console can lag behind wait-for-device
      if (seen !== avd) {
        throw new EnvError(`${serial} reports AVD "${seen ?? 'unknown'}", not ${avd}: another emulator is using port ${port}. Left it alone; stop it or run again.`);
      }
      sim.udid = serial;
      allowed.add(serial);
      onCreated?.({ name: avd, udid: serial, ...handle });
      let booted = false;
      for (let i = 0; i < 90 && !booted; i++) {
        const r = await run(tools.adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']);
        if (r.stdout.trim() === '1') { booted = true; break; }
        await sleep(2000);
      }
      if (!booted) throw new EnvError(`emulator ${d.name} (${serial}) did not finish booting within 180 s`);
    }
  } catch (e) {
    if (!keep) await removeAll();
    throw e;
  }
  return {
    sims,
    allowed,
    async cleanup(keepIt = false) {
      if (keepIt) return;
      await removeAll();
    },
  };
}

const parseUsed = (serials, sims) => [
  ...serials.map((s) => Number(s.slice('emulator-'.length))),
  ...sims.map((s) => s.port).filter(Boolean),
];

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export function parseNodes(xml) {
  const nodes = [];
  for (const m of String(xml).matchAll(/<node\b([^>]*)>/g)) {
    const attrs = {};
    for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
    const b = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attrs.bounds ?? '');
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    nodes.push({ text: attrs.text ?? '', desc: attrs['content-desc'] ?? '', pkg: attrs.package ?? '', rid: attrs['resource-id'] ?? '', clickable: attrs.clickable === 'true', x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) });
  }
  return nodes;
}

// Per-device helpers bound to the session's allowed set: every call asserts the serial first.
export function androidOps({ run, sleep = defaultSleep, allowed, adb: adbPath = 'adb' }) {
  const adb = (serial, ...args) => {
    assertSerial(serial, allowed);
    return ['-s', serial, ...args];
  };
  const sh = (serial, ...args) => run(adbPath, adb(serial, 'shell', ...args));
  // A dump can fail while the app is still loading: retry up to 3 times, 1 s apart.
  const dump = async (serial) => {
    let last;
    for (let i = 0; i < 3; i++) {
      if (i) await sleep(1000);
      const d = await sh(serial, 'uiautomator', 'dump', '/sdcard/uix-ui.xml');
      if (d.code !== 0) { last = { code: d.code, xml: '', stderr: d.stderr }; continue; }
      const c = await sh(serial, 'cat', '/sdcard/uix-ui.xml');
      last = { code: c.code, xml: c.stdout, stderr: c.stderr };
      if (c.code === 0) break;
    }
    return last;
  };
  // Screen size in px, read once per device; the dev-menu swipe is scaled to it.
  const sizes = new Map();
  const screenSize = async (serial) => {
    if (!sizes.has(serial)) {
      const r = await sh(serial, 'wm', 'size');
      const m = /Override size:\s*(\d+)x(\d+)/.exec(r.stdout) ?? /Physical size:\s*(\d+)x(\d+)/.exec(r.stdout);
      sizes.set(serial, m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 1080, h: 2400 });
    }
    return sizes.get(serial);
  };
  const toolsGaveUp = new Set(); // devices where the Tools toggle failed once: not retried on later opens
  const topLine = async (serial) => {
    const r = await sh(serial, 'dumpsys', 'activity', 'activities');
    return r.stdout.split('\n').find((l) => l.includes('topResumedActivity=')) ?? '';
  };

  return {
    // A screencap or pull can fail once for no reason: up to 3 tries, 1 s apart; the error names the failing command.
    async screenshot(serial, file) {
      const why = (what, r) => ({ ...r, stderr: `${what} exited ${r.code}${(r.stderr || r.stdout || '').trim() ? `: ${(r.stderr || r.stdout).trim()}` : ''}` });
      let last;
      for (let i = 0; i < 3; i++) {
        if (i) await sleep(1000);
        const s = await sh(serial, 'screencap', '-p', '/sdcard/uix-shot.png');
        if (s.code !== 0) { last = why('screencap', s); continue; }
        const p = await run(adbPath, adb(serial, 'pull', '/sdcard/uix-shot.png', file));
        if (p.code === 0) return p;
        last = why('pull', p);
      }
      return last;
    },
    setNightMode: (serial, dark) => sh(serial, 'cmd', 'uimode', 'night', dark ? 'yes' : 'no'),
    setFontScale: (serial, scale) => sh(serial, 'settings', 'put', 'system', 'font_scale', String(scale)),
    async setDemoStatusBar(serial) {
      const bc = (...a) => ['am', 'broadcast', '-a', 'com.android.systemui.demo', ...a];
      const cmds = [
        ['settings', 'put', 'global', 'sysui_demo_allowed', '1'],
        bc('-e', 'command', 'enter'),
        bc('-e', 'command', 'clock', '-e', 'hhmm', '0941'),
        bc('-e', 'command', 'battery', '-e', 'level', '100', '-e', 'plugged', 'false'),
        bc('-e', 'command', 'network', '-e', 'wifi', 'show', '-e', 'level', '4', '-e', 'fully', 'true'),
        bc('-e', 'command', 'network', '-e', 'mobile', 'hide'),
        bc('-e', 'command', 'network', '-e', 'airplane', 'hide'),
        bc('-e', 'command', 'network', '-e', 'nosim', 'hide'),
        bc('-e', 'command', 'notifications', '-e', 'visible', 'false'),
      ];
      let r;
      for (const c of cmds) {
        r = await sh(serial, ...c);
        if (r.code !== 0) return r;
      }
      return r;
    },
    reversePort: (serial, port) => run(adbPath, adb(serial, 'reverse', `tcp:${port}`, `tcp:${port}`)),
    installApk: (serial, apk) => run(adbPath, adb(serial, 'install', '-r', apk), { timeoutMs: 300000 }),
    async screenDensity(serial) {
      const r = await sh(serial, 'wm', 'density');
      const o = /Override density:\s*(\d+)/.exec(r.stdout);
      const p = /Physical density:\s*(\d+)/.exec(r.stdout);
      const n = Number((o ?? p)?.[1]);
      if (!n) throw new EnvError(`could not read the screen density of ${serial}: ${(r.stderr || r.stdout).trim()}`);
      return n;
    },
    // `port`: re-asserts `adb reverse tcp:port tcp:port` before every try (it can vanish when the adb server restarts).
    // Expo Go's "Something went wrong." screen ends a try; if every try ends there the result is
    // { code: 1, appError: '<header>: <message>' }.
    async openExpoUrl(serial, url, { port } = {}) {
      let top = '';
      let appError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await sleep(OPENURL_RETRY_MS);
        if (port !== undefined) {
          const rv = await run(adbPath, adb(serial, 'reverse', `tcp:${port}`, `tcp:${port}`));
          if (rv.code !== 0) return { code: rv.code, stdout: '', stderr: `adb reverse tcp:${port} failed on ${serial}: ${(rv.stderr || rv.stdout).trim()}` };
        }
        await sh(serial, 'am', 'force-stop', EXPO_GO_ANDROID);
        for (let i = 0; i < 20; i++) {
          const p = await sh(serial, 'pidof', EXPO_GO_ANDROID);
          if (!p.stdout.trim()) break;
          await sleep(250);
        }
        await sleep(1000);
        await sh(serial, 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', q(url));
        top = await topLine(serial);
        if (/topResumedActivity=.*host\.exp\.exponent\//.test(top)) {
          // Expo Go draws a still splash after `am start -W` (and after the JS starts): the screen is ready
          // once Expo Go shows a clickable node other than its Tools button. A failed dump means "not yet".
          let ready = false;
          let xml = '';
          let errored = false;
          for (let w = 0; w <= READY_CAP_MS && !ready && !errored; w += 1000) {
            if (w) await sleep(1000);
            const d = await sh(serial, READY_DUMP);
            if (d.code !== 0) continue;
            xml = d.stdout;
            const nodes = parseNodes(xml);
            const head = nodes.find((n) => n.rid === `${EXPO_GO_ID}error_header`);
            if (head) {
              const msg = nodes.find((n) => n.rid === `${EXPO_GO_ID}error_message`);
              appError = [head.text, msg?.text].filter(Boolean).join(': ');
              errored = true;
              break;
            }
            // Expo Go's own views (resource-id host.exp.exponent:id/...) and the Tools button are not the app.
            ready = nodes.some((n) => n.pkg === EXPO_GO_ANDROID && n.clickable && n.desc !== 'Tools' && !n.rid.startsWith(EXPO_GO_ID));
          }
          if (errored) continue;
          return { code: 0, stdout: '', stderr: '', ready, xml };
        }
      }
      if (appError) return { code: 1, stdout: '', stderr: `Expo Go showed its error screen on ${serial}: ${appError}`, appError };
      return { code: 1, stdout: '', stderr: `Expo Go did not come to the front on ${serial}; on top: ${top.trim() || 'unknown'}` };
    },
    // Starts from `xml` (the dump of a ready open) when given. Turns off the Continue sheet and the Tools
    // button when they show; costs nothing otherwise. Notes name what is still showing afterwards.
    async dismissExpoGoFirstOpen(serial, { xml } = {}) {
      const notes = [];
      const tap = (n) => sh(serial, 'input', 'tap', String(n.x), String(n.y));
      let d = { code: 0, xml };
      if (xml === undefined) d = await dump(serial);
      if (d.code !== 0) return { code: d.code, notes, stderr: d.stderr };
      const cont = parseNodes(d.xml).find((n) => n.text === 'Continue');
      if (cont) {
        await tap(cont);
        await sleep(1000);
        d = await dump(serial);
        if (d.code === 0 && parseNodes(d.xml).some((n) => n.text === 'Continue')) notes.push(`Expo Go Continue sheet still showing on ${serial}`);
      }
      if (d.code !== 0 || toolsGaveUp.has(serial) || !parseNodes(d.xml).some((n) => n.desc === 'Tools')) return { code: 0, notes };
      await sh(serial, 'input', 'keyevent', '82');
      await sleep(2000);
      d = await dump(serial);
      let row = parseNodes(d.xml).find((n) => n.text === 'Tools button');
      if (!row) {
        const { w, h } = await screenSize(serial);
        await sh(serial, 'input', 'swipe', String(Math.round(w / 2)), String(Math.round(0.8 * h)), String(Math.round(w / 2)), String(Math.round(0.3 * h)), '400');
        await sleep(1000);
        d = await dump(serial);
        row = parseNodes(d.xml).find((n) => n.text === 'Tools button');
      }
      if (row) await tap(row);
      await sh(serial, 'input', 'keyevent', '4');
      if (!row) {
        toolsGaveUp.add(serial);
        notes.push(`Expo Go Tools button still showing on ${serial}`);
        return { code: 0, notes };
      }
      await sleep(1000);
      d = await dump(serial);
      if (d.code !== 0 || parseNodes(d.xml).some((n) => n.desc === 'Tools')) {
        toolsGaveUp.add(serial);
        notes.push(`Expo Go Tools button still showing on ${serial}`);
      }
      return { code: 0, notes };
    },
  };
}

export async function ensureExpoGoApk({ fetchImpl, major, cacheRoot }) {
  const file = path.join(cacheRoot, `uix-expo-go-android-${major}.apk`);
  try {
    await fs.access(file);
    return file;
  } catch { /* download below */ }
  let v;
  try {
    const r = await fetchImpl('https://api.expo.dev/v2/versions/latest', { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    v = JSON.parse(await r.text());
  } catch (e) {
    throw new EnvError(`Could not read Expo Go versions from api.expo.dev/v2/versions/latest: ${e.message}`);
  }
  const url = v?.data?.sdkVersions?.[`${major}.0.0`]?.androidClientUrl;
  if (!url) throw new EnvError(`Expo has no Android Expo Go build for SDK ${major} (api.expo.dev/v2/versions/latest).`);
  let bytes;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(20 * 60 * 1000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    throw new EnvError(`Downloading Expo Go failed from ${url}: ${e.message}`);
  }
  await fs.mkdir(cacheRoot, { recursive: true });
  const part = `${file}.partial-${process.pid}`;
  await fs.writeFile(part, bytes);
  await fs.rename(part, file);
  return file;
}
