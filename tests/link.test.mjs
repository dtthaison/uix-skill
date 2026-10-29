import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, lstatSync, symlinkSync, readlinkSync, realpathSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'bin', 'link-local.sh');
const skillDir = join(root, 'skills', 'uix-skill');

function run(args, home) {
  return spawnSync('bash', [script, ...args], { env: { ...process.env, HOME: home }, encoding: 'utf8', cwd: tmpdir() });
}
function withHome(fn) {
  const home = mkdtempSync(join(tmpdir(), 'uix-link-'));
  try { return fn(home); } finally { rmSync(home, { recursive: true, force: true }); }
}

test('default run links into ~/.claude/skills/uix-skill', () => withHome((home) => {
  const r = run([], home);
  assert.equal(r.status, 0, r.stderr);
  const t = join(home, '.claude', 'skills', 'uix-skill');
  assert.ok(lstatSync(t).isSymbolicLink());
  assert.equal(realpathSync(t), realpathSync(skillDir));
}));

test('second run is idempotent', () => withHome((home) => {
  assert.equal(run([], home).status, 0);
  const r = run([], home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /already linked/);
}));

test('real directory at target: exit 2, untouched', () => withHome((home) => {
  const t = join(home, '.claude', 'skills', 'uix-skill');
  mkdirSync(t, { recursive: true });
  writeFileSync(join(t, 'keep.txt'), 'x');
  const r = run([], home);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing to overwrite/);
  assert.ok(lstatSync(t).isDirectory());
  assert.equal(readFileSync(join(t, 'keep.txt'), 'utf8'), 'x');
}));

test('--uninstall removes only our symlink', () => withHome((home) => {
  const t = join(home, '.claude', 'skills', 'uix-skill');
  const other = join(home, '.claude', 'skills', 'other');
  mkdirSync(other, { recursive: true });
  assert.equal(run([], home).status, 0);
  const r = run(['--uninstall'], home);
  assert.equal(r.status, 0);
  assert.equal(existsSync(t), false);
  assert.ok(existsSync(other));
  assert.equal(run(['--uninstall'], home).status, 0); // missing is fine
}));

test('--uninstall leaves a real directory alone', () => withHome((home) => {
  const t = join(home, '.claude', 'skills', 'uix-skill');
  mkdirSync(t, { recursive: true });
  const r = run(['--uninstall'], home);
  assert.equal(r.status, 0);
  assert.ok(lstatSync(t).isDirectory());
}));

test('--codex creates ~/.codex/skills/uix-skill only', () => withHome((home) => {
  const r = run(['--codex'], home);
  assert.equal(r.status, 0, r.stderr);
  const t = join(home, '.codex', 'skills', 'uix-skill');
  assert.equal(realpathSync(t), realpathSync(skillDir));
  assert.equal(existsSync(join(home, '.claude')), false);
}));

test('--claude --codex links both', () => withHome((home) => {
  assert.equal(run(['--claude', '--codex'], home).status, 0);
  assert.ok(lstatSync(join(home, '.claude', 'skills', 'uix-skill')).isSymbolicLink());
  assert.ok(lstatSync(join(home, '.codex', 'skills', 'uix-skill')).isSymbolicLink());
}));

test('symlink pointing elsewhere: exit 2, untouched', () => withHome((home) => {
  const elsewhere = join(home, 'elsewhere');
  mkdirSync(elsewhere);
  const parent = join(home, '.claude', 'skills');
  mkdirSync(parent, { recursive: true });
  const t = join(parent, 'uix-skill');
  symlinkSync(elsewhere, t);
  const r = run([], home);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing to overwrite/);
  assert.equal(readlinkSync(t), elsewhere);
  assert.equal(run(['--uninstall'], home).status, 0);
  assert.equal(readlinkSync(t), elsewhere);
}));

test('unknown flag: usage, exit 2', () => withHome((home) => {
  const r = run(['--bogus'], home);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /[Uu]sage/);
}));

test('--help prints usage, exit 0', () => withHome((home) => {
  const r = run(['--help'], home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /[Uu]sage/);
}));
