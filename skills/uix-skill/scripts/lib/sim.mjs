// Simulator helpers for check-mobile. Every function takes an injected `run`
// so tests never touch a real simulator. Always address devices by UDID.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

export class EnvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnvError';
  }
}

export const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Children spawned by defaultRun that have not exited yet; the signal path kills them so no
// maestro or recordVideo process outlives the check. A `simctl create` is spared: killing it can
// leave a device behind whose UDID we never learn, so the signal path waits for it instead.
const liveChildren = new Map();
export const sparesKill = (cmd, args) => cmd === 'xcrun' && args[0] === 'simctl' && args[1] === 'create';
export const trackChild = (child, { spare = false } = {}) => {
  liveChildren.set(child, spare);
  return () => liveChildren.delete(child);
};
export const liveChildCount = () => liveChildren.size;
export const sparedChildCount = () => [...liveChildren.values()].filter(Boolean).length;
export function killLiveChildren(signal = 'SIGTERM') {
  for (const [c, spare] of [...liveChildren]) {
    if (spare) continue;
    try { c.kill(signal); } catch { /* already gone */ }
  }
}

export function defaultRun(cmd, args, { timeoutMs = 120000, killSignal = 'SIGKILL' } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let done = false;
    let child;
    let timedOut = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(res);
    };
    const timer = setTimeout(() => {
      child?.kill(killSignal);
      if (killSignal === 'SIGKILL' || !child) return finish({ code: 124, stdout, stderr: `${stderr}timeout after ${timeoutMs}ms` });
      // A gentler signal (e.g. SIGINT to let recordVideo finalize the file): wait for the
      // process to close, and fall back to SIGKILL after 5 s.
      timedOut = true;
      setTimeout(() => { child.kill('SIGKILL'); finish({ code: 124, stdout, stderr: `${stderr}timeout after ${timeoutMs}ms` }); }, 5000).unref();
    }, timeoutMs);
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return finish({ code: 127, stdout: '', stderr: String(e.message) });
    }
    const untrack = trackChild(child, { spare: sparesKill(cmd, args) });
    child.once('close', untrack);
    child.once('error', untrack);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => finish({ code: e.code === 'ENOENT' ? 127 : 1, stdout, stderr: `${stderr}${e.message}` }));
    child.on('close', (code) => finish({ code: timedOut ? 124 : (code ?? 1), stdout, stderr }));
  });
}

const IOS_PREFIX = 'com.apple.CoreSimulator.SimRuntime.iOS-';
const verNum = (v) => String(v ?? '0').split('.').map(Number);
const cmpVer = (a, b) => {
  const x = verNum(a);
  const y = verNum(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

// Ids are discovered from `simctl list -j` output, never hardcoded.
export function pickDevices(devicetypes, runtimes, requested) {
  const types = devicetypes?.devicetypes ?? [];
  const iosRuntimes = (runtimes?.runtimes ?? [])
    .filter((r) => r.isAvailable !== false && (r.platform === 'iOS' || String(r.identifier).startsWith(IOS_PREFIX)))
    .sort((a, b) => cmpVer(b.version, a.version));
  if (!iosRuntimes.length) throw new EnvError('No available iOS simulator runtime found; install one in Xcode > Settings > Components.');
  const findType = (name) => types.find((t) => t.name.toLowerCase() === String(name).toLowerCase() || t.identifier === name);
  const runtimeFor = (t) => iosRuntimes.find((r) => !r.supportedDeviceTypes || r.supportedDeviceTypes.some((x) => x.identifier === t.identifier));
  const se = findType('iPhone SE (3rd generation)');
  const wanted = requested?.length ? requested : [se && runtimeFor(se) ? se.name : 'iPhone 17e', 'iPhone 17 Pro Max'];
  return wanted.map((name) => {
    const t = findType(name);
    if (!t) throw new EnvError(`Simulator device type "${name}" is not installed (see: xcrun simctl list devicetypes).`);
    const rt = runtimeFor(t);
    if (!rt) throw new EnvError(`No available iOS runtime supports "${t.name}".`);
    return { name: t.name, typeId: t.identifier, runtimeId: rt.identifier };
  });
}

const UUID_RE = /^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i;

export function assertUdid(udid) {
  if (typeof udid !== 'string' || !udid.trim() || udid === 'booted') throw new EnvError(`a concrete simulator udid is required (got "${udid ?? ''}")`);
  return udid;
}

export const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function createSession(run, { devices, runId, onCreated, isAborted = () => false, keep = false }) {
  const sims = [];
  const removeAll = async () => {
    for (const s of sims) {
      await run('xcrun', ['simctl', 'shutdown', s.udid]).catch(() => {});
      await run('xcrun', ['simctl', 'delete', s.udid]).catch(() => {});
    }
  };
  try {
    for (const d of devices) {
      if (isAborted()) throw new EnvError('aborted by signal before creating the next simulator');
      const name = `uix-${slug(d.name)}-${runId}`;
      const c = await run('xcrun', ['simctl', 'create', name, d.typeId, d.runtimeId]);
      const udid = c.stdout.trim();
      if (c.code !== 0 || !UUID_RE.test(udid)) throw new EnvError(`simctl create failed for ${d.name}: ${(c.stderr || c.stdout).trim()}`);
      sims.push({ name, udid });
      onCreated?.({ name, udid });
      if (isAborted()) throw new EnvError('aborted by signal after creating a simulator');
      const b = await run('xcrun', ['simctl', 'boot', udid]);
      if (b.code !== 0) throw new EnvError(`simctl boot failed for ${d.name}: ${b.stderr.trim()}`);
      const s = await run('xcrun', ['simctl', 'bootstatus', udid, '-b'], { timeoutMs: 180000 });
      if (s.code !== 0) throw new EnvError(`simulator ${d.name} did not finish booting: ${s.stderr.trim()}`);
    }
  } catch (e) {
    if (!keep) await removeAll();
    throw e;
  }
  return {
    sims,
    async cleanup(keep = false) {
      if (keep) return;
      await removeAll();
    },
  };
}

export const openUrl = (run, udid, url) => run('xcrun', ['simctl', 'openurl', assertUdid(udid), url]);
export const screenshot = (run, udid, file) => run('xcrun', ['simctl', 'io', assertUdid(udid), 'screenshot', file]);
export const setAppearance = (run, udid, mode) => run('xcrun', ['simctl', 'ui', assertUdid(udid), 'appearance', mode]);
export const setContentSize = (run, udid, size) => run('xcrun', ['simctl', 'ui', assertUdid(udid), 'content_size', size]);
export const setStatusBar = (run, udid) => run('xcrun', ['simctl', 'status_bar', assertUdid(udid), 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100', '--wifiBars', '3', '--cellularBars', '4']);

// Expo Go shows a developer-menu onboarding sheet on first launch; these two defaults mark it as seen.
export async function skipExpoOnboarding(run, udid) {
  for (const key of ['EXDevMenuIsOnboardingFinished', 'ExpoGoOnboardingFinished']) {
    const r = await run('xcrun', ['simctl', 'spawn', assertUdid(udid), 'defaults', 'write', 'host.exp.Exponent', key, '-bool', 'YES']);
    if (r.code !== 0) return r;
  }
  return { code: 0, stdout: '', stderr: '' };
}

export async function settle(run, udid, { file, minMs = 1500, capMs = 5000, intervalMs = 500, sleep = defaultSleep, read = fs.readFile, shoot } = {}) {
  let waited = 0;
  await sleep(minMs);
  waited += minMs;
  const shot = async () => {
    const r = await (shoot ? shoot(udid, file) : screenshot(run, udid, file));
    if (r.code !== 0) throw new EnvError(`screenshot failed for simulator ${udid}: ${(r.stderr || r.stdout).trim()}`);
    return read(file);
  };
  let prev = await shot();
  while (waited < capMs) {
    await sleep(intervalMs);
    waited += intervalMs;
    const cur = await shot();
    if (prev.equals(cur)) return { file, settled: true };
    prev = cur;
  }
  return { file, settled: false };
}
