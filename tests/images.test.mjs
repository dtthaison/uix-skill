import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { searchOpenverse, searchWikimedia, findImages, toCredit } from '../skills/uix-skill/scripts/images.mjs';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/api/${n}.json`, import.meta.url), 'utf8'));
const stub = (body, { ok = true, status = 200, calls } = {}) => async (url, init) => {
  calls?.push({ url: String(url), init });
  return { ok, status, json: async () => body };
};
const router = (map) => async (url) => {
  const key = String(url).includes('openverse') ? 'openverse' : 'wikimedia';
  return { ok: true, status: 200, json: async () => map[key] };
};

test('searchOpenverse maps the first result with every field non-empty', async () => {
  const calls = [];
  const imgs = await searchOpenverse('pottery', { count: 2, fetchImpl: stub(load('openverse'), { calls }) });
  assert.equal(imgs.length, 2);
  for (const [k, v] of Object.entries(imgs[0])) assert.ok(v, `${k} is empty`);
  assert.equal(imgs[0].source, 'openverse');
  assert.match(imgs[0].license, /^CC [A-Z-]+ \d\.\d$/);
  assert.match(calls[0].url, /^https:\/\/api\.openverse\.org\/v1\/images\/\?q=pottery&page_size=2&license_type=commercial,modification/);
  assert.match(calls[0].init.headers['User-Agent'], /^uix-skill\/0\.1/);
  assert.ok(calls[0].init.signal);
});

test('searchOpenverse normalizes cc0 and pdm and defaults creator', async () => {
  const body = { results: [
    { url: 'u', thumbnail: 't', title: 'A', creator: null, license: 'cc0', license_version: '1.0', license_url: 'l', foreign_landing_url: 'f' },
    { url: 'u', thumbnail: 't', title: 'B', creator: 'X', license: 'pdm', license_version: '1.0', license_url: 'l', foreign_landing_url: 'f' },
  ] };
  const imgs = await searchOpenverse('x', { fetchImpl: stub(body) });
  assert.equal(imgs[0].license, 'CC0 1.0');
  assert.equal(imgs[0].creator, 'Unknown');
  assert.equal(imgs[1].license, 'Public Domain Mark 1.0');
});

test('searchWikimedia strips HTML from Artist', async () => {
  const calls = [];
  const imgs = await searchWikimedia('ceramic', { fetchImpl: stub(load('wikimedia'), { calls }) });
  assert.ok(imgs.length >= 1);
  for (const img of imgs) {
    assert.doesNotMatch(img.creator, /[<>]/);
    for (const [k, v] of Object.entries(img)) assert.ok(v, `${k} is empty`);
    assert.equal(img.source, 'wikimedia');
  }
  assert.ok(imgs.some((i) => i.creator === 'W.carter'));
  assert.match(calls[0].url, /iiprop=url(\||%7C)extmetadata(\||%7C)mime/);
});

test('searchWikimedia drops non-image mime types and falls back title', async () => {
  const body = { query: { pages: {
    1: { title: 'File:Doc.pdf', imageinfo: [{ url: 'u', descriptionurl: 'd', mime: 'application/pdf', extmetadata: {} }] },
    2: { title: 'File:Nice pot.png', imageinfo: [{ url: 'u2', descriptionurl: 'd2', mime: 'image/png', extmetadata: { LicenseShortName: { value: 'CC0' } } }] },
  } } };
  const imgs = await searchWikimedia('x', { fetchImpl: stub(body) });
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].title, 'Nice pot');
  assert.equal(imgs[0].thumbnail, 'u2');
  assert.equal(imgs[0].creator, 'Unknown');
  assert.equal(imgs[0].licenseUrl, '');
});

test('non-OK response throws naming source and status', async () => {
  await assert.rejects(searchOpenverse('x', { fetchImpl: stub({}, { ok: false, status: 429 }) }), /Openverse.*429/);
  await assert.rejects(searchWikimedia('x', { fetchImpl: stub({}, { ok: false, status: 503 }) }), /Wikimedia.*503/);
});

test('findImages falls back to Wikimedia when Openverse is empty', async () => {
  const imgs = await findImages('x', { fetchImpl: router({ openverse: { results: [] }, wikimedia: load('wikimedia') }) });
  assert.ok(imgs.length > 0);
  assert.equal(imgs[0].source, 'wikimedia');
});

test('findImages falls back when Openverse throws, and prefers Openverse otherwise', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('openverse')) throw new Error('boom');
    return { ok: true, status: 200, json: async () => load('wikimedia') };
  };
  assert.equal((await findImages('x', { fetchImpl }))[0].source, 'wikimedia');
  const imgs = await findImages('x', { fetchImpl: router({ openverse: load('openverse'), wikimedia: load('wikimedia') }) });
  assert.equal(imgs[0].source, 'openverse');
});

test('findImages throws when both sources fail', async () => {
  await assert.rejects(findImages('x', { fetchImpl: async () => { throw new Error('offline'); } }));
});

test('toCredit gives the exact string', () => {
  const img = { title: 'Pot', creator: 'Jane Doe', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: 'openverse' };
  assert.equal(toCredit(img), '"Pot" by Jane Doe, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), via Openverse');
  assert.match(toCredit({ ...img, source: 'wikimedia' }), /, via Wikimedia Commons$/);
});

test('searchWikimedia decodes HTML entities in creator and title', async () => {
  const body = { query: { pages: { 1: { title: 'File:x.jpg', imageinfo: [{
    url: 'u', descriptionurl: 'd', mime: 'image/jpeg',
    extmetadata: {
      Artist: { value: '<a href="x">Tom &amp; Jerry&#039;s</a>' },
      ObjectName: { value: 'Caf&eacute;&nbsp;&quot;Noir&quot; &#x41;&#66; &lt;3' },
      LicenseShortName: { value: 'CC BY-SA 4.0' },
    },
  }] } } } };
  const [img] = await searchWikimedia('x', { fetchImpl: stub(body) });
  assert.equal(img.creator, "Tom & Jerry's");
  assert.equal(img.title, 'Café "Noir" AB <3');
});
