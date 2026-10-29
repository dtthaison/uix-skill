import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor, toHsl, composite, resolveBackground, contrastRatio, isLargeText,
} from '../skills/uix-skill/scripts/lib/color.mjs';

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} not within ${eps} of ${b}`);

test('parseColor hex, rgb, hsl, names', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  near(parseColor('#00000080').a, 0.502, 0.001);
  assert.deepEqual(parseColor('rgb(10 20 30 / 50%)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColor('rgba(10, 20, 30, 0.25)'), { r: 10, g: 20, b: 30, a: 0.25 });
  assert.deepEqual(parseColor('hsl(240, 100%, 50%)'), { r: 0, g: 0, b: 255, a: 1 });
  assert.deepEqual(parseColor('#f008'), { r: 255, g: 0, b: 0, a: 0x88 / 255 });
  assert.deepEqual(parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
  assert.deepEqual(parseColor('black'), { r: 0, g: 0, b: 0, a: 1 });
  assert.equal(parseColor('nonsense'), null);
});

test('contrastRatio', () => {
  const white = parseColor('white');
  near(contrastRatio(parseColor('black'), white), 21, 0.01);
  near(contrastRatio(parseColor('#777'), white), 4.48, 0.01);
});

test('resolveBackground', () => {
  assert.deepEqual(resolveBackground(['rgba(0,0,0,0)', 'transparent', '#111111']), { r: 17, g: 17, b: 17, a: 1 });
  assert.deepEqual(resolveBackground(['rgba(0,0,0,0)']), { r: 255, g: 255, b: 255, a: 1 });
  const g = resolveBackground(['rgba(0,0,0,0.5)']);
  near(g.r, 128, 1); near(g.g, 128, 1); near(g.b, 128, 1);
});

test('composite alpha-over', () => {
  const out = composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
  near(out.r, 127.5, 0.01);
  assert.equal(out.a, 1);
});

test('isLargeText', () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(19, 700), true);
  assert.equal(isLargeText(18, 700), false);
});

test('toHsl', () => {
  near(toHsl({ r: 128, g: 0, b: 255 }).h, 270, 1);
});
