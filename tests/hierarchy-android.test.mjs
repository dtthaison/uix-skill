import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findingsFromHierarchy } from '../skills/uix-skill/scripts/lib/hierarchy.mjs';

const fx = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (p) => JSON.parse(readFileSync(join(fx, p), 'utf8'));
const droid = (tree, density = 420) => findingsFromHierarchy(tree, { route: 'shop', platform: 'android', density });

// Minimal Android tree: root > wrapper > app window; each leaf is [class, clickable, bounds, text, accessibilityText, children].
const node = (class_, clickable, bounds, { text = '', a = '', id = '', kids = [] } = {}) =>
  ({ attributes: { class: class_, clickable: String(clickable), bounds, text, accessibilityText: a, 'resource-id': id }, children: kids });
const tree = (...kids) => ({ attributes: {}, children: [{ attributes: {}, children: [node('android.widget.FrameLayout', false, '[0,0][1080,2400]', { kids })] }] });
const at160 = (tr) => droid(tr, 160);

test('iOS output is unchanged on every existing hierarchy fixture (golden from before the Android change)', () => {
  const golden = load('android/ios-golden.json');
  const files = readdirSync(join(fx, 'mobile')).filter((x) => /^hierarchy.*\.json$/.test(x)).map((x) => `mobile/${x}`).concat('hierarchy-swiftui.json');
  assert.equal(Object.keys(golden).length, files.length * 2);
  for (const f of files) for (const native of [false, true]) {
    const t = load(f);
    assert.equal(JSON.stringify(findingsFromHierarchy(t, { route: '/r', native })), JSON.stringify(golden[`${f}|native=${native}`]), f);
    assert.equal(JSON.stringify(findingsFromHierarchy(t, { route: '/r', native, platform: 'ios', density: 420 })), JSON.stringify(golden[`${f}|native=${native}`]), `${f} explicit ios`);
  }
});

test('android shop fixture: chips and filter button are 44 dp tall; status bar, tabs and cards pass', () => {
  const f = droid(load('android/hierarchy-shop.json'));
  assert.deepEqual(f.map((x) => [x.rule, x.severity, x.message, x.bounds]), [
    ['small-target', 'warn', 'Touch target 121x44 dp is under 48x48 (Tất cả).', '[16,125][137,169]'],
    ['small-target', 'warn', 'Touch target 266x44 dp is under 48x48 (Phụ kiện handmade).', '[145,125][411,169]'],
    ['small-target', 'warn', 'Touch target 206x44 dp is under 48x48 (Lọc và sắp xếp).', '[202,181][408,225]'],
  ]);
  assert.ok(f.every((x) => x.route === 'shop'));
  assert.ok(!f.some((x) => /Trang chủ|Giỏ hàng|Len /.test(x.message)));
});

test('android onboarding fixture: Expo Go sheet gives no finding (Close 48x48 dp, Continue 331x48 dp)', () => {
  assert.deepEqual(droid(load('android/hierarchy-onboarding.json')), []);
});

test('android: dp rounding is per coordinate, 48 dp passes, 47 dp does not', () => {
  // 420 dpi: 126 px is exactly 48 dp; 123 px is 47 dp.
  const ok = tree(node('android.view.View', true, '[0,0][126,126]', { a: 'ok' }));
  assert.deepEqual(droid(ok), []);
  const small = tree(node('android.view.View', true, '[0,0][123,126]', { a: 'tight' }));
  assert.deepEqual(droid(small).map((x) => x.message), ['Touch target 47x48 dp is under 48x48 (tight).']);
  // at 160 dpi px == dp, and a 48x48 box passes
  assert.deepEqual(at160(tree(node('android.view.View', true, '[10,10][58,58]', { a: 'x' }))), []);
  // 420 dpi: [43,0][531,200] -> x 16..201, so w is the difference of rounded coordinates
  const b = droid(tree(node('android.view.View', true, '[43,0][531,100]', { a: 'r' })));
  assert.equal(b[0].bounds, '[16,0][202,38]');
});

test('android: a non-clickable TextView leaf with text is never a small target', () => {
  assert.deepEqual(at160(tree(node('android.widget.TextView', false, '[0,0][100,20]', { text: 'Hello' }))), []);
  assert.deepEqual(at160(tree(node('android.widget.TextView', false, '[0,0][30,30]', { text: 'Hi' }))), []);
});

test('android: clickable unlabelled 40x40 dp icon gives missing-label and small-target', () => {
  const f = at160(tree(node('android.view.View', true, '[100,100][140,140]')));
  assert.deepEqual(f.map((x) => [x.rule, x.severity]), [['small-target', 'warn'], ['missing-label', 'warn']]);
  assert.equal(f[0].message, 'Touch target 40x40 dp is under 48x48 (unlabelled).');
  assert.equal(f[1].message, 'Interactive element 40x40 dp has no text or accessibility label (lower confidence: may be decorative)');
  assert.ok(!at160(tree(node('android.view.View', true, '[0,0][65,65]'))).some((x) => x.rule === 'missing-label')); // over 64 dp
  assert.ok(at160(tree(node('android.widget.Button', false, '[0,0][50,50]'))).some((x) => x.rule === 'missing-label')); // class Button counts
});

test('android: a label from a descendant text counts; parts inside a labelled clickable are not flagged', () => {
  const card = node('android.widget.Button', true, '[0,0][200,200]', { a: 'Card', kids: [
    node('android.widget.Button', false, '[10,10][40,40]'),
    node('android.view.View', true, '[50,10][80,40]'),
  ] });
  assert.deepEqual(at160(tree(card)), []);
  const wrapped = node('android.view.View', true, '[0,0][100,100]', { kids: [node('android.widget.TextView', false, '[0,0][50,20]', { text: 'Go' })] });
  assert.deepEqual(at160(tree(wrapped)), []);
  // an unlabelled clickable's own small children are still checked
  const bare = node('android.view.View', true, '[0,0][200,200]', { kids: [node('android.widget.Button', false, '[10,10][40,40]')] });
  assert.deepEqual(at160(tree(bare)).map((x) => x.rule), ['small-target', 'missing-label']);
});

test('android: the systemui subtree is dropped, including its unnamed window wrapper', () => {
  const sys = { attributes: {}, children: [
    node('android.widget.FrameLayout', false, '[0,0][1080,136]', { id: 'com.android.systemui:id/status_bar', kids: [node('android.widget.ImageView', true, '[0,0][20,20]', { a: 'Wifi' })] }),
  ] };
  const t = { attributes: {}, children: [{ attributes: {}, children: [sys, node('android.view.View', true, '[0,200][100,300]', { a: 'App' })] }] };
  assert.deepEqual(at160(t), []);
  const unnamed = { attributes: {}, children: [{ attributes: {}, children: [{ attributes: {}, children: [node('android.widget.ImageView', true, '[0,0][20,20]', { a: 'Notif' })] }, node('android.widget.FrameLayout', false, '[0,0][5,5]', { id: 'com.android.systemui:id/x' })] }] };
  assert.equal(at160(unnamed).length, 1); // only an emptied wrapper goes; a wrapper that kept children stays
});

test('android: Expo Go Tools button (no text, ImageView) and its single-child wrappers are skipped', () => {
  const tools = node('android.widget.ImageView', true, '[900,2000][950,2050]', { a: 'Tools' });
  const wrapped = node('android.view.View', true, '[890,1990][960,2060]', { kids: [node('android.view.View', false, '[895,1995][955,2055]', { kids: [tools] })] });
  assert.deepEqual(at160(tree(wrapped)), []);
  // same label on a Button with text, or a wrapper holding something else, is not the Tools button
  assert.equal(at160(tree(node('android.widget.ImageView', true, '[0,0][40,40]', { a: 'Tools', text: 'Tools' }))).length, 1);
  assert.ok(at160(tree(node('android.view.View', true, '[0,0][40,40]', { kids: [tools, node('android.widget.ImageView', false, '[0,0][5,5]')] }))).length > 0);
});

test('android: the unchanged app-error detector still wins', () => {
  const lbl = (a) => node('android.view.View', false, '[0,0][100,100]', { a });
  const t = tree(lbl('Log 1 of 1'), lbl('Error'), lbl('Boom'), lbl('Dismiss'), lbl('Minimize'));
  assert.equal(droid(t)[0].rule, 'app-error');
});

test('android: a tree that is only system UI gives no findings (the unpruned tree is not used)', () => {
  const onlySys = { attributes: {}, children: [{ attributes: {}, children: [node('android.widget.FrameLayout', false, '[0,0][1080,136]', { id: 'com.android.systemui:id/status_bar', kids: [node('android.widget.ImageView', true, '[0,0][20,20]', { a: 'Wifi' })] })] }] };
  assert.deepEqual(at160(onlySys), []);
});

test('android: a full-screen labelled clickable does not hide controls under it; a card-sized one still does', () => {
  const small = node('android.view.View', true, '[10,10][50,50]', { a: 'Icon' });
  const scrim = node('android.view.View', true, '[0,0][700,900]', { text: 'Dismiss', kids: [small] });
  assert.ok(at160(tree(scrim)).some((f) => f.rule === 'small-target' && f.bounds === '[10,10][50,50]'));
  const card = node('android.view.View', true, '[0,0][600,600]', { text: 'Card', kids: [small] });
  assert.deepEqual(at160(tree(card)), []);
});

test('android: controls clipped by a scroll area edge are not small targets (real captures)', () => {
  const shop = findingsFromHierarchy(load('android/clip-shop-small-phone.json'), { route: 'shop', platform: 'android', density: 320 });
  const m = shop.filter((x) => x.rule === 'small-target').map((x) => x.message);
  assert.equal(m.length, 4, m.join('\n'));
  for (const t of ['Tất cả', 'Phụ kiện handmade', 'Thành phẩm len móc', 'Lọc và sắp xếp']) assert.ok(m.some((x) => x.includes(t)), t);
  assert.ok(m.every((x) => /x44 dp/.test(x) && !x.includes('160x19')));
  const prod = findingsFromHierarchy(load('android/clip-product-small-phone.json'), { route: 'p', platform: 'android', density: 320 });
  const pm = prod.filter((x) => x.rule === 'small-target').map((x) => x.message);
  assert.equal(pm.length, 2, pm.join('\n'));
  assert.ok(pm.every((x) => x.includes('44x44')) && !pm.some((x) => x.includes('Phân loại 05')));
});

test('android: a 19 dp control not touching a scroll edge is still reported; one touching the bottom edge is not', () => {
  const scroller = (...kids) => ({ attributes: { class: 'android.widget.ScrollView', clickable: 'false', scrollable: 'true', bounds: '[0,100][400,500]', text: '', accessibilityText: '', 'resource-id': '' }, children: kids });
  const inner = at160(tree(scroller(node('android.view.View', true, '[10,200][200,219]', { a: 'mid' }))));
  assert.deepEqual(inner.map((x) => x.message), ['Touch target 190x19 dp is under 48x48 (mid).']);
  const edge = at160(tree(scroller(node('android.view.View', true, '[10,481][200,500]', { a: 'cut' }))));
  assert.deepEqual(edge, []);
});
