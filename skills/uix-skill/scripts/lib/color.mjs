const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function parseAlpha(s) {
  if (s === undefined) return 1;
  const n = s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s);
  return Number.isNaN(n) ? NaN : clamp(n, 0, 1);
}

function parseChannel(s) {
  const n = s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s);
  return clamp(Math.round(n), 0, 255);
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

export function parseColor(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim().toLowerCase();
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const byte = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: h.length === 8 ? byte(6) / 255 : 1 };
  }

  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const a = parseAlpha(parts[3]);
  if (Number.isNaN(a)) return null;
  if (fn[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map(parseChannel);
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }
  const h = parseFloat(parts[0]);
  const sat = parseFloat(parts[1]);
  const lig = parseFloat(parts[2]);
  if ([h, sat, lig].some(Number.isNaN)) return null;
  return { ...hslToRgb(((h % 360) + 360) % 360, clamp(sat, 0, 100), clamp(lig, 0, 100)), a };
}

export function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function composite(top, bottom) {
  const ba = bottom.a ?? 1;
  const a = top.a + ba * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const ch = (t, b) => (t * top.a + b * ba * (1 - top.a)) / a;
  return { r: ch(top.r, bottom.r), g: ch(top.g, bottom.g), b: ch(top.b, bottom.b), a };
}

export function resolveBackground(layers) {
  let acc = null;
  for (const layer of layers) {
    const c = parseColor(layer);
    if (!c || c.a === 0) continue;
    acc = acc ? composite(acc, c) : c;
    if (acc.a >= 1) break;
  }
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const out = acc ? composite(acc, white) : white;
  return { r: out.r, g: out.g, b: out.b, a: 1 };
}

function luminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(fg, bg) {
  const solid = (bg.a ?? 1) < 1 ? composite(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const top = (fg.a ?? 1) < 1 ? composite(fg, solid) : fg;
  const [hi, lo] = [luminance(top), luminance(solid)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function isLargeText(px, weight) {
  return px >= 24 || (px >= 18.66 && weight >= 700);
}
