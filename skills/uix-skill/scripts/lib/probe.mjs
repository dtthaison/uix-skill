import { resolveBackground, contrastRatio, isLargeText, parseColor } from './color.mjs';

export const RENDERED_RULE_IDS = [
  'h-overflow', 'low-contrast', 'small-target', 'img-no-alt',
  'eyebrow-every-heading', 'text-clipped', 'console-error', 'heavy-image',
];

function probe() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  const rgba = (str) => {
    if (cache.has(str)) return cache.get(str);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = str;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const out = `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
    cache.set(str, out);
    return out;
  };
  const nameClass = (n) => [...n.classList].find((c) => c.length > 2 && !/[:[\]/]/.test(c));
  const stableId = (id) => !/^\d|[:.[\]#\s]/.test(id);
  const part = (n, withTag) => {
    const tag = n.tagName.toLowerCase();
    if (n.id && stableId(n.id)) return `${tag}#${n.id}`;
    const c = nameClass(n);
    return c ? (withTag ? tag : '') + '.' + c : tag;
  };
  const selector = (el) => {
    if (el.id && stableId(el.id)) return part(el, true);
    let s = part(el, true);
    const parent = el.parentElement;
    if (!nameClass(el) && parent) {
      const same = [...parent.children].filter((c) => c.tagName === el.tagName);
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(el) + 1})`;
    }
    const anc = [];
    for (let n = parent; n && n !== document.body && n !== document.documentElement && anc.length < 2; n = n.parentElement) {
      if (!(n.id && stableId(n.id)) && !nameClass(n)) continue;
      anc.unshift(n);
      if (n.id && stableId(n.id)) break;
    }
    if (anc.length === 0) return s;
    return [...anc.map((n, i) => part(n, i === 0)), s].join(' ');
  };
  const DEV = 'nextjs-portal, vite-error-overlay, astro-dev-toolbar, [id^="nuxt-devtools"], #__next-build-watcher, [data-nextjs-toast]';
  const inDev = (el) => !!el.closest(DEV);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0;
  };
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

  const texts = [];
  const clipped = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (texts.length >= 2000) break;
    if (SKIP.has(el.tagName) || !hasText(el) || !visible(el) || inDev(el)) continue;
    const cs = getComputedStyle(el);
    const bgLayers = [];
    let hasBgImage = false;
    for (let n = el; n; n = n.parentElement) {
      const ncs = getComputedStyle(n);
      if (ncs.backgroundImage !== 'none') hasBgImage = true;
      const bg = rgba(ncs.backgroundColor);
      bgLayers.push(bg);
      if (/, 1\)$/.test(bg)) break;
    }
    texts.push({
      selector: selector(el),
      sample: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40),
      color: rgba(cs.color),
      bgLayers,
      hasBgImage,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
    });
    if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') {
      clipped.push(selector(el));
    }
  }

  const targets = [];
  for (const el of document.querySelectorAll('a[href], button, [role=button], input, select, textarea')) {
    if (el.tagName === 'INPUT' && el.type === 'hidden') continue;
    if (!visible(el) || inDev(el)) continue;
    const r = el.getBoundingClientRect();
    const inline = el.tagName === 'A' && !!el.parentElement &&
      [...el.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
    targets.push({ selector: selector(el), x: r.x, y: r.y, w: r.width, h: r.height, inline });
  }

  const images = [...document.querySelectorAll('img')].filter((el) => !inDev(el)).map((el) => ({
    selector: selector(el),
    alt: el.getAttribute('alt'),
    src: (el.currentSrc || el.src || '').slice(-40),
    loaded: el.complete && el.naturalWidth > 0,
    naturalWidth: el.naturalWidth,
    renderedWidth: el.getBoundingClientRect().width,
    dpr: window.devicePixelRatio || 1,
  }));

  const headings = [...document.querySelectorAll('h2')].filter((el) => !inDev(el)).map((el) => {
    const prev = el.previousElementSibling;
    let prevIsEyebrow = false;
    if (prev) {
      const ps = getComputedStyle(prev);
      prevIsEyebrow = ps.textTransform === 'uppercase' && (parseFloat(ps.letterSpacing) || 0) > 0;
    }
    return { selector: selector(el), prevIsEyebrow, inChrome: !!el.closest('footer, nav, aside') };
  });

  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: document.documentElement.clientWidth,
    texts, targets, images, headings, clipped,
  };
}

export const PROBE_SOURCE = `(${probe.toString()})()`;

const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export function evaluateFacts(facts, width) {
  const findings = [];
  const seen = new Set();
  const add = (rule, severity, message, selector) => {
    const key = `${rule}\0${selector ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const f = { rule, severity, message, width };
    if (selector) f.selector = selector;
    findings.push(f);
  };

  if (facts.scrollWidth > facts.innerWidth + 1) {
    add('h-overflow', 'error', `Page scrolls horizontally: content is ${facts.scrollWidth}px wide in a ${facts.innerWidth}px viewport.`);
  }

  const groups = new Map();
  for (const t of facts.texts) {
    if (t.hasBgImage) continue;
    const fg = parseColor(t.color);
    if (!fg) continue;
    const bg = resolveBackground(t.bgLayers);
    const ratio = contrastRatio(fg, bg);
    const need = isLargeText(t.fontSize, t.fontWeight) ? 3 : 4.5;
    if (ratio >= need) continue;
    const key = `${hex(fg)}\0${hex(bg)}\0${need}`;
    let g = groups.get(key);
    if (!g) {
      g = { rule: 'low-contrast', severity: 'error', message: `Contrast ${ratio.toFixed(2)}:1 is below ${need}:1 (${hex(fg)} on ${hex(bg)})`, width, count: 0, sample: (t.sample ?? '').slice(0, 40), selector: t.selector, selectors: [] };
      groups.set(key, g);
      findings.push(g);
    }
    g.count++;
    if (g.selectors.length < 5 && !g.selectors.includes(t.selector)) g.selectors.push(t.selector);
  }

  if (width === 375) {
    const small = (t) => !t.inline && (t.w < 24 || t.h < 24);
    const centre = (t) => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 });
    const circleHitsBox = (c, t) => {
      const dx = Math.max(t.x - c.x, 0, c.x - (t.x + t.w));
      const dy = Math.max(t.y - c.y, 0, c.y - (t.y + t.h));
      return Math.hypot(dx, dy) < 12;
    };
    const spaced = (t) => {
      if (typeof t.x !== 'number' || typeof t.y !== 'number') return false;
      const c = centre(t);
      return !facts.targets.some((o) => {
        if (o === t) return false;
        if (!small(o)) return circleHitsBox(c, o);
        const oc = centre(o);
        return Math.hypot(oc.x - c.x, oc.y - c.y) < 24;
      });
    };
    for (const t of facts.targets) {
      if (small(t) && !spaced(t)) {
        add('small-target', 'warn', `Touch target is ${Math.round(t.w)}x${Math.round(t.h)}px; aim for at least 24x24, ideally 44x44.`, t.selector);
      }
    }
  }

  for (const i of facts.images) {
    if (i.alt === null || i.alt === undefined) add('img-no-alt', 'error', 'Image has no alt attribute. Use alt="" if it is decorative.', i.selector);
  }

  const heavy = facts.images.filter((i) => i.loaded && i.naturalWidth >= 1000 && i.renderedWidth > 0 && i.naturalWidth > 2 * i.renderedWidth * (i.dpr || 1));
  if (heavy.length) {
    const first = heavy[0];
    findings.push({
      rule: 'heavy-image', severity: 'warn', width, count: heavy.length,
      message: `Image is ${first.naturalWidth}px wide but shown at ${Math.round(first.renderedWidth)}px; serve a resized version.`,
      sample: first.src ?? '', selector: first.selector, selectors: heavy.slice(0, 5).map((i) => i.selector),
    });
  }

  const h2 = facts.headings.filter((h) => !h.inChrome);
  if (h2.length >= 3 && h2.filter((h) => h.prevIsEyebrow).length / h2.length >= 0.75) {
    add('eyebrow-every-heading', 'warn', 'Nearly every h2 has an uppercase eyebrow label above it; keep eyebrows for a few headings.');
  }

  for (const s of facts.clipped) add('text-clipped', 'warn', 'Text is clipped by overflow: hidden without an ellipsis.', s);

  return findings;
}
