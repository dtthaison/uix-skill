import { parseColor, toHsl } from './color.mjs';

export const BANNED_FONTS = ['inter', 'arial', 'roboto', 'space grotesk'];

const isBanned = (name, ctx) => {
  const n = name.trim().replace(/^['"]|['"]$/g, '').replace(/_/g, ' ').toLowerCase();
  if (!BANNED_FONTS.includes(n)) return false;
  return !(ctx.allowFonts ?? []).some((a) => a.toLowerCase() === n);
};

function* matches(re, text) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    yield m;
    if (m[0] === '') re.lastIndex++;
  }
}

function classAttrs(text) {
  const out = [];
  for (const m of matches(/class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g, text)) {
    out.push({ value: m[1] ?? m[2] ?? m[3] ?? '', index: m.index });
  }
  return out;
}

const hit = (ctx, index, message) => ({ line: ctx.lineAt(index), message });

function bannedFont(text, ctx) {
  const out = [];
  for (const m of matches(/font-?family\s*:\s*([^;}\n]*)/gi, text)) {
    const first = m[1].trim().replace(/^['"]/, '').split(',')[0];
    if (isBanned(first, ctx)) out.push(hit(ctx, m.index, `Banned default font "${first.trim().replace(/['"]/g, '')}". Pick a distinctive family or declare it in DESIGN.md.`));
  }
  for (const m of matches(/font-\[['"]?([^\]'",]+)/g, text)) {
    if (isBanned(m[1], ctx)) out.push(hit(ctx, m.index, `Banned default font "${m[1]}" in a Tailwind class.`));
  }
  for (const m of matches(/import\s*\{([^}]*)\}\s*from\s*['"]next\/font\/google['"]/g, text)) {
    for (const name of m[1].split(',')) {
      if (isBanned(name, ctx)) out.push(hit(ctx, m.index, `Banned default font "${name.trim().replace(/_/g, ' ')}" imported from next/font/google.`));
    }
  }
  return out;
}

function gradientBody(text, start) {
  let depth = 1;
  const end = Math.min(text.length, start + 600);
  for (let i = start; i < end; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return text.slice(start, i);
  }
  return null;
}

function aiGradient(text, ctx) {
  const out = [];
  for (const m of matches(/gradient\(/g, text)) {
    const body = gradientBody(text, m.index + m[0].length);
    if (!body) continue;
    const stops = [];
    for (const c of matches(/#[0-9a-fA-F]{3,8}(?![\w])|(?:rgba?|hsla?)\([^)]*\)/g, body)) {
      const col = parseColor(c[0]);
      if (col) stops.push(toHsl(col));
    }
    if (stops.length >= 2 && stops.every((s) => s.h >= 220 &&s.h <= 320 && s.s >= 40)) {
      out.push(hit(ctx, m.index, 'Purple-to-blue gradient is the default AI look. Use a flat or tonal surface.'));
    }
  }
  for (const { value, index } of classAttrs(text)) {
    if (/(?<![\w-])from-(?:purple|violet|indigo|fuchsia)-\d+/.test(value) &&
        /(?<![\w-])to-(?:blue|purple|pink|indigo|violet|fuchsia)-\d+/.test(value)) {
      out.push(hit(ctx, index, 'Purple-to-blue Tailwind gradient is the default AI look.'));
    }
  }
  return out;
}

const BLACK_VALUE = /(?:^|[\s'"(,])(?:#000(?:000)?|black|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(?:,\s*1(?:\.0+)?\s*)?\))(?![\w-])/i;

function pureBlack(text, ctx) {
  const out = [];
  for (const m of matches(/(?<![\w-])(?:background-color|background|color|fill)\s*:\s*([^;}\n]*)/gi, text)) {
    if (BLACK_VALUE.test(m[1])) out.push(hit(ctx, m.index, 'Pure black. Use a tinted near-black.'));
  }
  for (const m of matches(/(?<![\w-])(?:bg|text|fill)-(?:black|\[#000(?:000)?\])(?![\w/-])/g, text)) {
    out.push(hit(ctx, m.index, `Pure black class "${m[0]}". Use a tinted near-black.`));
  }
  return out;
}

function bounceEasing(text, ctx) {
  const re = /animate-bounce(?![\w-])|\b(?:bounce|elastic)\.(?:in|out|inout)\b|\bease(?:In|Out|InOut)?(?:Bounce|Elastic)\w*|(?:ease|easing)\w*\s*[:=]\s*['"]?(?:bounce|elastic)|--ease-(?:bounce|elastic)/gi;
  return [...matches(re, text)].map((m) => hit(ctx, m.index, `Bounce/elastic easing "${m[0]}". Use an exponential ease-out.`));
}

function overshootEasing(text, ctx) {
  const out = [];
  for (const m of matches(/cubic-bezier\(([^)]*)\)/g, text)) {
    const n = m[1].split(',').map(Number);
    if (n.length === 4 && n.every(Number.isFinite) && (n[1] < 0 || n[1] > 1 || n[3] < 0 || n[3] > 1)) {
      out.push(hit(ctx, m.index, `Overshooting curve ${m[0]}. Keep y values within 0 to 1.`));
    }
  }
  return out;
}

function scaleZero(text, ctx) {
  const re = /\bscale\(\s*0\s*\)|\bscale\s*:\s*0(?![\d.])|\bscale=\{0\}|(?<![\w-])scale-0(?![\w./-])/g;
  return [...matches(re, text)].map((m) => hit(ctx, m.index, 'Animating from scale 0. Start from 0.95 with opacity.'));
}

function transitionAll(text, ctx) {
  const re = /transition(?:-property)?\s*:\s*all(?![\w-])|(?<![\w-])transition-all(?![\w-])/g;
  return [...matches(re, text)].map((m) => hit(ctx, m.index, 'transition: all. List the properties you animate.'));
}

function outlineNone(text, ctx) {
  const out = [];
  for (const m of matches(/outline(?:-style)?\s*:\s*['"]?(?:none|0)(?![\w.])/g, text)) {
    const brace = text.lastIndexOf('{', m.index);
    let selector = '';
    if (brace >= 0) {
      const from = Math.max(0, brace - 300);
      const head = text.slice(from, brace);
      selector = head.slice(Math.max(head.lastIndexOf('}'), head.lastIndexOf(';')) + 1);
    }
    if (!selector.includes(':focus-visible')) out.push(hit(ctx, m.index, 'Removes the focus outline. Style :focus-visible instead.'));
  }
  for (const { value, index } of classAttrs(text)) {
    if (/(?<![\w-])outline-none(?![\w-])/.test(value) && !value.includes('focus-visible:')) {
      out.push(hit(ctx, index, 'outline-none without a focus-visible: replacement.'));
    }
  }
  return out;
}

const EMOJI_OK = /[\u2190-\u21FF\u2794-\u27BF\u2318\u2325\u2713\u2714\u2717\u2715\u2605\u2606\u2022]/u;
const COMMENT_RE = /\/\*[\s\S]*?\*\/|(?<![:\w"'`])\/\/[^\n]*|<!--[\s\S]*?-->/g;

function emojiIcon(text, ctx) {
  if (/\.s?css$/i.test(ctx.path)) return [];
  const comments = [...matches(COMMENT_RE, text)].map((m) => [m.index, m.index + m[0].length]);
  const out = [];
  let last = -1;
  for (const m of matches(/\p{Extended_Pictographic}/gu, text)) {
    if (m[0] === '©' || m[0] === '®' || m[0] === '™' || EMOJI_OK.test(m[0])) continue;
    if (comments.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const line = ctx.lineAt(m.index);
    if (line === last) continue;
    last = line;
    out.push({ line, message: `Emoji "${m[0]}" used as an icon. Use an icon from a real set.` });
  }
  return out;
}

export const WEB_RULES = [
  { id: 'banned-font', severity: 'warn', test: bannedFont },
  { id: 'ai-gradient', severity: 'error', test: aiGradient },
  { id: 'pure-black', severity: 'warn', test: pureBlack },
  { id: 'bounce-easing', severity: 'error', test: bounceEasing },
  { id: 'overshoot-easing', severity: 'warn', test: overshootEasing },
  { id: 'scale-zero', severity: 'error', test: scaleZero },
  { id: 'transition-all', severity: 'warn', test: transitionAll },
  { id: 'outline-none', severity: 'error', test: outlineNone },
  { id: 'emoji-icon', severity: 'warn', test: emojiIcon },
];

export const MOTION_RE = /@keyframes|(?<![\w-])(?:animation|transition)(?:-[a-z]+)?\s*:|(?<![\w-])(?:animate|transition)-|\bgsap\b|framer-motion|['"]motion(?:\/[\w-]+)?['"]/;
export const REDUCED_MOTION_RE = /prefers-reduced-motion|useReducedMotion|(?<![\w-])motion-(?:reduce|safe)/;
