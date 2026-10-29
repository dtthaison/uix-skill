#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = 'uix-skill/0.1 (open-source design skill)';
const MIMES = ['image/jpeg', 'image/png', 'image/webp'];

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', eacute: 'é' };
const decode = (s) =>
  s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, (m, dec, hex, name) => {
    if (name) return ENTITIES[name] ?? m;
    const cp = dec ? Number(dec) : parseInt(hex, 16);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
const clean = (s) => decode(String(s ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

async function getJson(source, url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${source} request failed with status ${res.status}`);
  return res.json();
}

function openverseLicense(r) {
  const l = String(r.license ?? '').toLowerCase();
  if (l === 'cc0') return 'CC0 1.0';
  if (l === 'pdm') return 'Public Domain Mark 1.0';
  return `CC ${l.toUpperCase()} ${r.license_version ?? ''}`.trim();
}

export async function searchOpenverse(query, { count = 6, fetchImpl = fetch } = {}) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${count}&license_type=commercial,modification`;
  const data = await getJson('Openverse', url, fetchImpl);
  return (data.results ?? []).map((r) => ({
    url: r.url,
    thumbnail: r.thumbnail || r.url,
    title: clean(r.title),
    creator: clean(r.creator) || 'Unknown',
    license: openverseLicense(r),
    licenseUrl: r.license_url ?? '',
    source: 'openverse',
    landingUrl: r.foreign_landing_url ?? '',
  }));
}

export async function searchWikimedia(query, { count = 6, fetchImpl = fetch } = {}) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${count}&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=1600&format=json&origin=*`;
  const data = await getJson('Wikimedia', url, fetchImpl);
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info || !MIMES.includes(info.mime)) continue;
    const m = info.extmetadata ?? {};
    const fallbackTitle = String(p.title ?? '').replace(/^File:/, '').replace(/\.[^.]+$/, '');
    out.push({
      url: info.url,
      thumbnail: info.thumburl || info.url,
      title: clean(m.ObjectName?.value) || fallbackTitle,
      creator: clean(m.Artist?.value) || 'Unknown',
      license: clean(m.LicenseShortName?.value),
      licenseUrl: m.LicenseUrl?.value ?? '',
      source: 'wikimedia',
      landingUrl: info.descriptionurl ?? '',
    });
  }
  return out;
}

export async function findImages(query, opts = {}) {
  try {
    const imgs = await searchOpenverse(query, opts);
    if (imgs.length) return imgs;
  } catch {
    // fall through to Wikimedia
  }
  return searchWikimedia(query, opts);
}

export function toCredit(img) {
  const via = img.source === 'openverse' ? 'Openverse' : 'Wikimedia Commons';
  return `"${img.title}" by ${img.creator}, ${img.license} (${img.licenseUrl}), via ${via}`;
}

async function main(argv) {
  let count = 6;
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count') count = Number(argv[++i]);
    else words.push(argv[i]);
  }
  const query = words.join(' ').trim();
  if (!query || !Number.isInteger(count) || count < 1) {
    process.stderr.write('usage: images.mjs "<query>" [--count 6]\n');
    return 2;
  }
  try {
    const images = (await findImages(query, { count })).map((img) => ({ ...img, credit: toCredit(img) }));
    process.stdout.write(`${JSON.stringify({ images }, null, 2)}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`images: both Openverse and Wikimedia failed: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
