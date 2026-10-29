import { BANNED_FONTS } from './rules-web.mjs';

function* matches(re, text) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) yield m;
}

function pureBlack(text, ctx) {
  const re = /\bColors?\.[Bb]lack\b|\bColor\(\s*0x[Ff][Ff]000000\s*\)|["']#(?:[Ff][Ff])?000000["']/g;
  const hits = [...matches(re, text)];
  if ((ctx.path ?? '').toLowerCase().endsWith('.swift')) {
    // Implicit .black counts only as a color argument; .fontWeight(.black) and weight: .black are font weights.
    hits.push(...matches(/\.(?:foregroundColor|foregroundStyle|background|fill|stroke|tint)\(\s*\.black\b|\bUIColor\.black\b/g, text));
    hits.sort((a, b) => a.index - b.index);
  }
  return hits.map((m) => ({ line: ctx.lineAt(m.index), message: `Pure black "${m[0]}". Use a tinted near-black.` }));
}

function bannedFont(text, ctx) {
  const out = [];
  const re = /\.custom\(\s*["']([^"']+)["']|fontFamily\s*[:=]\s*["']([^"']+)["']/gi;
  for (const m of matches(re, text)) {
    const raw = (m[1] ?? m[2]).split(',')[0];
    const name = raw.slice(raw.lastIndexOf('#') + 1).trim().toLowerCase();
    if (BANNED_FONTS.includes(name) && !(ctx.allowFonts ?? []).some((a) => a.toLowerCase() === name)) {
      out.push({ line: ctx.lineAt(m.index), message: `Banned default font "${name}". Pick a distinctive family or declare it in DESIGN.md.` });
    }
  }
  return out;
}

const STRING_RE = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;

// True when the code (outside comments and strings) opens a JSX tag. A `<` right after a word, `)`, `]` or `>` is a generic or a comparison.
export function hasJsx(text) {
  const code = maskNonCode(text).replace(STRING_RE, (s) => s.replace(/[^\n]/g, ' '));
  return /(?<![\w$)\]>])<[A-Za-z]/.test(code);
}

function emojiIcon(text, ctx) {
  const out = [];
  if (/\.[tj]s$/i.test(ctx.path ?? '') && !hasJsx(text)) return out;
  for (const m of matches(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, text)) {
    const e = /\p{Extended_Pictographic}/u.exec(m[0].replace(/[©®™]/g, ''));
    if (e) out.push({ line: ctx.lineAt(m.index), message: `Emoji "${e[0]}" used as an icon. Use a real icon set.` });
  }
  return out;
}

function tinyText(text, ctx) {
  const out = [];
  const re = /\.system\(\s*size\s*:\s*(\d+(?:\.\d+)?)|fontsize\s*[:=]\s*["']?(\d+(?:\.\d+)?)/gi;
  for (const m of matches(re, text)) {
    const size = Number(m[1] ?? m[2]);
    if (size < 12) out.push({ line: ctx.lineAt(m.index), message: `Text size ${size} is below 12.` });
  }
  return out;
}

const BASE_NATIVE_RULES = [
  { id: 'pure-black', severity: 'warn', test: pureBlack },
  { id: 'banned-font', severity: 'warn', test: bannedFont },
  { id: 'emoji-icon', severity: 'warn', test: emojiIcon },
  { id: 'tiny-text', severity: 'warn', test: tinyText },
];

// ---- React Native ----

const JS_SPEC_RE = /\bfrom\s*(['"])([^'"\n]+)\1|\brequire\(\s*(['"])([^'"\n]+)\3\s*\)|\bimport\s*(['"])([^'"\n]+)\5/g;
const STMT_START_RE = /(?:^|;)[ \t]*(?:import|export)\b|^[ \t]*\}/;
const SIDE_EFFECT_START_RE = /(?:^|;)[ \t]*$/;

// Blank out comments and template literals (keeping newlines) so import-looking text inside them is ignored.
function maskNonCode(text) {
  const out = [];
  let i = 0;
  let last = 0;
  const blank = (from, to) => {
    out.push(text.slice(last, from), text.slice(from, to).replace(/[^\n]/g, ' '));
    last = to;
  };
  while (i < text.length) {
    const c = text[i];
    const prev = i === 0 ? ' ' : text[i - 1];
    if (c === '/' && text[i + 1] === '/' && /[\s;{}()]/.test(prev)) {
      const e = text.indexOf('\n', i);
      const end = e === -1 ? text.length : e;
      blank(i, end);
      i = end;
    } else if (c === '/' && text[i + 1] === '*' && /[\s;{}()]/.test(prev)) {
      const e = text.indexOf('*/', i + 2);
      const end = e === -1 ? text.length : e + 2;
      blank(i, end);
      i = end;
    } else if (c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== '`') j += text[j] === '\\' ? 2 : 1;
      const end = Math.min(j + 1, text.length);
      blank(i, end);
      i = end;
    } else i++;
  }
  out.push(text.slice(last));
  return out.join('');
}

function isNativeSpec(s) {
  if (s === 'react-native' || s.startsWith('react-native/') || s === 'expo' || s.startsWith('expo-')) return true;
  return s.startsWith('react-native-') && s !== 'react-native-web' && !s.startsWith('react-native-web/');
}

/** True when the file has an import/export-from/require of a React Native or Expo module (react-native-web does not count). */
export function isNativeJs(text) {
  if (!/react-native|expo/.test(text)) return false;
  const code = maskNonCode(text);
  for (const m of matches(JS_SPEC_RE, code)) {
    const spec = m[2] ?? m[4] ?? m[6];
    if (!isNativeSpec(spec)) continue;
    if (m[4] !== undefined) return true;
    const from = Math.max(code.lastIndexOf('\n', m.index) + 1, m.index - 300);
    const prefix = code.slice(from, m.index);
    if (m[2] !== undefined ? STMT_START_RE.test(prefix) : SIDE_EFFECT_START_RE.test(prefix)) return true;
  }
  return false;
}

// End of a JSX open tag that starts at `start`: first `>` outside braces, bounded in length.
function tagEnd(text, start) {
  let depth = 0;
  const stop = Math.min(text.length, start + 3000);
  for (let i = start; i < stop; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth <= 0) return { end: i, selfClose: text[i - 1] === '/' };
  }
  return null;
}

const SCRIM_FILL_RE = /\bstyle\s*=\s*\{\s*\[?\s*(?:StyleSheet\.)?absoluteFill(?:Object)?\b/;
const SCRIM_LABEL_RE = /\b(?:accessibilityLabel|testID)\s*=\s*\{?\s*['"`][^'"`]*(?:scrim|backdrop|overlay)/i;

const PRESSABLE_RE = /<(Pressable|Touchable\w*)(?![\w.])/g;

const SCROLLVIEW_WINDOW = 20000;

const MAP_LOOKBACK = 2000;

const LITERAL_SCAN = 5000;

// Body of the array literal whose `[` is at `open`, or null when it does not close within LITERAL_SCAN.
function literalBody(text, open) {
  let depth = 0;
  const stop = Math.min(text.length, open + LITERAL_SCAN);
  for (let i = open; i < stop; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

// A literal is bounded when it has items and no spread.
const fixedLiteral = (body) => body !== null && body.trim() !== '' && !body.includes('...');

// One pass: const names bound to a fixed array literal, minus names grown or reassigned anywhere in the file.
function boundedConsts(text) {
  const ok = new Set();
  for (const m of matches(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*\[/g, text)) {
    if (fixedLiteral(literalBody(text, m.index + m[0].length - 1))) ok.add(m[1]);
  }
  for (const m of matches(/\b([A-Za-z_$][\w$]*)\s*\.\s*(?:push|unshift|splice)\s*\(/g, text)) ok.delete(m[1]);
  for (const m of matches(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=(?![=>])/g, text)) {
    if (ok.has(m[1]) && !/\bconst\s+$/.test(text.slice(Math.max(0, m.index - 10), m.index))) ok.delete(m[1]);
  }
  return ok;
}

// True when the expression ending just before `.map(` is a bounded list: a literal, a same-file const literal, or .slice(0, n<=12).
function boundedSource(text, at, consts) {
  const head = text.slice(Math.max(0, at - MAP_LOOKBACK), at).trimEnd();
  const slice = /\.slice\(\s*0\s*,\s*(\d+)\s*\)$/.exec(head);
  if (slice) return Number(slice[1]) <= 12;
  if (head.endsWith(']')) {
    let depth = 0;
    for (let i = head.length - 1; i >= 0; i--) {
      if (head[i] === ']') depth++;
      else if (head[i] === '[' && --depth === 0) return !/[\w$)\]]\s*$/.test(head.slice(0, i)) && !head.slice(i, -1).includes('...');
    }
    return false;
  }
  const id = /(?<![\w$.])([A-Za-z_$][\w$]*)$/.exec(head);
  return id !== null && consts.has(id[1]);
}

function scrollviewMap(text, ctx) {
  const out = [];
  const seen = new Set();
  const consts = boundedConsts(text);
  for (const m of matches(/<ScrollView(?![\w.])/g, text)) {
    // Search a bounded window so many opens stay linear; a ScrollView body over 20000 chars is rare and skipped.
    const win = text.slice(m.index, m.index + SCROLLVIEW_WINDOW);
    const close = win.indexOf('</ScrollView>');
    if (close === -1) continue;
    const body = win.slice(0, close);
    for (const mm of matches(/\.map\(/g, body)) {
      const line = ctx.lineAt(m.index + mm.index);
      if (seen.has(line) || boundedSource(text, m.index + mm.index, consts)) continue;
      seen.add(line);
      out.push({ line, message: 'ScrollView renders a mapped list; every row mounts at once. Use FlatList or FlashList, or map a short literal list.' });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

// The config argument is a bare identifier or contains a spread, so useNativeDriver cannot be seen.
function configUnseen(call) {
  let depth = 0;
  for (let i = call.indexOf('(') + 1; i < call.length; i++) {
    const c = call[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      const arg = call.slice(i + 1);
      return /^\s*[A-Za-z_$][\w$.]*\s*,?\s*$/.test(arg) || /\.\.\.\s*[\w$]/.test(arg);
    }
  }
  return false;
}

function jsDriver(text, ctx) {
  const out = [];
  for (const m of matches(/\bAnimated\.(?:timing|spring|decay)\(/g, text)) {
    let depth = 0;
    let end = m.index + m[0].length - 1;
    const stop = Math.min(text.length, end + 800);
    for (; end < stop; end++) {
      if (text[end] === '(') depth++;
      else if (text[end] === ')' && --depth === 0) break;
    }
    const call = text.slice(m.index, end);
    if (!/useNativeDriver\s*:\s*true\b/.test(call) && !configUnseen(call)) {
      out.push({ line: ctx.lineAt(m.index), message: 'Animated call without useNativeDriver: true runs on the JS thread and drops frames.' });
    }
  }
  return out;
}

function linearMotion(text, ctx) {
  const out = [];
  for (const m of matches(/\bEasing\.linear\b/g, text)) {
    const near = text.slice(Math.max(0, m.index - 200), m.index + 200);
    if (/rotat|spin|loop|repeat|shimmer/i.test(near)) continue;
    out.push({ line: ctx.lineAt(m.index), message: 'Linear easing on a one-shot move feels mechanical. Use a spring or an ease-out curve.' });
  }
  return out;
}

function noPressFeedback(text, ctx) {
  const out = [];
  for (const m of matches(PRESSABLE_RE, text)) {
    if (m[1] === 'TouchableWithoutFeedback') {
      out.push({ line: ctx.lineAt(m.index), message: 'TouchableWithoutFeedback gives no visible response to a tap. Use Pressable with a pressed style.' });
    } else if (m[1] === 'Pressable') {
      const t = tagEnd(text, m.index);
      if (t) {
        const tag = text.slice(m.index, t.end);
        if (SCRIM_FILL_RE.test(tag) || SCRIM_LABEL_RE.test(tag)) continue;
      }
      const rel = t ? text.slice(t.end, t.end + 812).indexOf('</Pressable>') : -1;
      const upto = !t ? undefined : rel === -1 || rel > 800 ? Math.min(t.end + 800, text.length) : t.end + rel;
      if (t && !/pressed|android_ripple|onPressIn/.test(text.slice(m.index, upto))) {
        out.push({ line: ctx.lineAt(m.index), message: 'Pressable has no pressed style and no ripple. Add a pressed state or android_ripple.' });
      }
    }
  }
  return out;
}

function smallTarget(text, ctx) {
  const out = [];
  for (const m of matches(PRESSABLE_RE, text)) {
    const t = tagEnd(text, m.index);
    if (!t) continue;
    const tag = text.slice(m.index, t.end);
    if (/hitSlop/.test(tag)) continue;
    for (const d of tag.matchAll(/(?<![A-Za-z])(?:width|height)\s*:\s*(\d+(?:\.\d+)?)\b/g)) {
      if (Number(d[1]) < 44) {
        out.push({ line: ctx.lineAt(m.index), message: `Touch target ${d[1]} is below 44 and has no hitSlop.` });
        break;
      }
    }
  }
  return out;
}

const ICON_NAME_RE = /^(?:\w*Icon\w*|Image|Svg|Ionicons|Feather|AntDesign|Entypo|Octicons|FontAwesome\d*|MaterialIcons|MaterialCommunityIcons)$/;

function iconNoLabel(text, ctx) {
  const out = [];
  for (const m of matches(PRESSABLE_RE, text)) {
    const t = tagEnd(text, m.index);
    if (!t || t.selfClose) continue;
    const rel = text.slice(t.end, t.end + 1501).indexOf(`</${m[1]}>`);
    if (rel === -1) continue;
    const close = t.end + rel;
    const inner = text.slice(t.end + 1, close);
    const child = /^\s*<([A-Z][\w.]*)(?![\w.])[^<]*\/>\s*$/.exec(inner);
    if (!child || !ICON_NAME_RE.test(child[1])) continue;
    if (/accessibilityLabel|aria-label|accessibilityLabelledBy/.test(text.slice(m.index, t.end) + inner)) continue;
    out.push({ line: ctx.lineAt(m.index), message: 'Pressable holds only an icon or image and has no accessibilityLabel.' });
  }
  return out;
}

function fontScalingOff(text, ctx) {
  const out = [];
  for (const m of matches(/\ballowFontScaling\s*(?:=\s*\{?\s*|:\s*)false\b|\bmaxFontSizeMultiplier\s*(?:=\s*\{\s*|:\s*)(\d+(?:\.\d+)?)/g, text)) {
    // maxFontSizeMultiplier 0 means "no limit" in React Native.
    if (m[1] !== undefined && (Number(m[1]) === 0 || Number(m[1]) >= 1.3)) continue;
    out.push({ line: ctx.lineAt(m.index), message: 'Text scaling is switched off or capped below 1.3. People who enlarge their font lose the content.' });
  }
  return out;
}

const SAFE_AREA_RE = /useSafeAreaInsets|SafeAreaView|safe-area-context|StatusBar\.currentHeight/;

function hardcodedInset(text, ctx) {
  if (SAFE_AREA_RE.test(text)) return [];
  const re = /\b(?:paddingTop|marginTop)\s*:\s*(?:(?:44|47|59|62)\b(?!\.)|Platform\.OS\s*===?\s*['"]ios['"]\s*\?\s*20\b|Platform\.OS\s*===?\s*['"]android['"]\s*\?[^:?,}]{1,12}:\s*20\b)/g;
  return [...matches(re, text)].map((m) => ({ line: ctx.lineAt(m.index), message: 'Fixed top inset guesses the status bar or notch height. Read it from useSafeAreaInsets().' }));
}

const JS_EXTS = ['.tsx', '.jsx', '.ts', '.js'];

const MOTION_USE_RE = /\b(?:withSpring|withTiming|withRepeat)\b|\b(?:entering|exiting)\s*=|\blayout=\{/;
const IMPORT_RE = /\bimport\s+[^;'"]*?\bfrom\s*['"][^'"\n]*['"]/g;

// Reanimated motion in a file that never reads Reduce Motion. Reports the first animation line.
function noReducedMotion(text, ctx) {
  const code = maskNonCode(text).replace(IMPORT_RE, (s) => s.replace(/[^\n]/g, ' '));
  const m = MOTION_USE_RE.exec(code);
  if (!m || /useReducedMotion|ReduceMotion|reduceMotion/.test(code)) return [];
  return [{ line: ctx.lineAt(m.index), message: 'This file animates and never reads Reduce Motion. Use useReducedMotion() or ReduceMotion.System.' }];
}

export const RN_RULES = [
  { id: 'rn-scrollview-map', severity: 'error', exts: JS_EXTS, test: scrollviewMap },
  { id: 'rn-js-driver', severity: 'error', exts: JS_EXTS, test: jsDriver },
  { id: 'rn-linear-motion', severity: 'warn', exts: JS_EXTS, test: linearMotion },
  { id: 'rn-no-press-feedback', severity: 'warn', exts: JS_EXTS, test: noPressFeedback },
  { id: 'rn-small-target', severity: 'warn', exts: JS_EXTS, test: smallTarget },
  { id: 'rn-icon-no-label', severity: 'error', exts: JS_EXTS, test: iconNoLabel },
  { id: 'rn-font-scaling-off', severity: 'warn', exts: JS_EXTS, test: fontScalingOff },
  { id: 'rn-hardcoded-inset', severity: 'warn', exts: JS_EXTS, test: hardcodedInset },
  { id: 'rn-no-reduced-motion', severity: 'warn', exts: JS_EXTS, test: noReducedMotion },
];

export const NATIVE_PROJECT_RULES = [];

// ---- SwiftUI, Compose, Flutter ----

// Names of the calls that enclose `index`, innermost first, looking back at most `window` characters.
function enclosingCalls(text, index, window = 400) {
  const names = [];
  let depth = 0;
  for (let i = index - 1; i >= Math.max(0, index - window); i--) {
    const c = text[i];
    if (c === ')' || c === ']' || c === '}') depth++;
    else if (c === '(' || c === '[' || c === '{') {
      if (depth > 0) depth--;
      else if (c === '(') names.push(/([A-Za-z_]\w*)\s*(?:<[^<>()]*>)?\s*$/.exec(text.slice(Math.max(0, i - 60), i))?.[1] ?? '');
    }
  }
  return names;
}

function swiftuiLinear(text, ctx) {
  const out = [];
  for (const m of matches(/\bAnimation\.linear\b|(?<![\w)\]}"])\.linear\b/g, text)) {
    const before = text.slice(Math.max(0, m.index - 400), m.index);
    const after = text.slice(m.index, m.index + 200);
    if (/ProgressView|\bGauge\b/.test(before) || /\.repeatForever\b/.test(after)) continue;
    out.push({ line: ctx.lineAt(m.index), message: 'Linear animation on a one-shot change feels mechanical. Use .spring or .easeOut.' });
  }
  return out;
}

// True when `index` sits inside an unclosed `.transition(` argument.
function insideTransition(text, index) {
  let depth = 0;
  const start = Math.max(0, index - 400);
  for (let i = index - 1; i >= start; i--) {
    const c = text[i];
    if (c === ')') depth++;
    else if (c === '(') {
      if (depth === 0) {
        if (/\.transition$/.test(text.slice(Math.max(0, i - 11), i))) return true;
      } else depth--;
    }
  }
  return false;
}

function swiftuiAnimationNoValue(text, ctx) {
  const out = [];
  for (const m of matches(/\.animation\(/g, text)) {
    if (/[\w$]/.test(text[m.index - 1] ?? '')) continue;
    let depth = 0;
    let end = m.index + m[0].length - 1;
    const stop = Math.min(text.length, end + 400);
    for (; end < stop; end++) {
      if (text[end] === '(') depth++;
      else if (text[end] === ')' && --depth === 0) break;
    }
    if (/^\s*\{/.test(text.slice(end + 1))) continue; // iOS 17 closure form: animation(_:body:)
    if (insideTransition(text, m.index)) continue; // AnyTransition.animation(_:)
    if (!/\bvalue\s*:/.test(text.slice(m.index, end))) {
      out.push({ line: ctx.lineAt(m.index), message: '`.animation` without `value:` is deprecated and animates every change. Add `value:`.' });
    }
  }
  return out;
}

function swiftuiFillNoClip(text, ctx) {
  const out = [];
  for (const m of matches(/\.scaledToFill\(\)|\.aspectRatio\([^)]*contentMode\s*:\s*\.fill/g, text)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 300);
    if (/\.clipped\(|\.clipShape\(/.test(after)) continue;
    out.push({ line: ctx.lineAt(m.index), message: "scaledToFill reports the image's full size to its parent and can push the layout off screen. Put the image in a fixed frame and add .clipped()." });
  }
  return out;
}

function swiftuiFixedFont(text, ctx) {
  const out = [];
  for (const m of matches(/\.system\(\s*size\s*:/g, text)) {
    let depth = 0;
    let end = m.index + m[0].indexOf('(');
    const stop = Math.min(text.length, end + 300);
    for (; end < stop; end++) {
      if (text[end] === '(') depth++;
      else if (text[end] === ')' && --depth === 0) break;
    }
    if (!/relativeTo\s*:/.test(text.slice(m.index, end))) {
      out.push({ line: ctx.lineAt(m.index), message: 'Fixed font size ignores Dynamic Type. Use a text style, or Font.custom(..., size:, relativeTo:).' });
    }
  }
  return out;
}

function composeLinear(text, ctx) {
  const out = [];
  for (const m of matches(/\bLinearEasing\b/g, text)) {
    const ls = text.lastIndexOf('\n', m.index) + 1;
    if (/^\s*import\b/.test(text.slice(ls, m.index))) continue;
    const near = text.slice(Math.max(0, m.index - 120), m.index);
    if (!/\btween\b[^;]*$|\beasing\s*=\s*$/.test(near)) continue;
    if (enclosingCalls(text, m.index).includes('infiniteRepeatable')) continue;
    out.push({ line: ctx.lineAt(m.index), message: 'LinearEasing on UI motion feels mechanical. Use FastOutSlowInEasing or a spring.' });
  }
  return out;
}

function flutterLinear(text, ctx) {
  const out = [];
  for (const m of matches(/\bCurves\.linear\b/g, text)) {
    const near = text.slice(Math.max(0, m.index - 200), m.index + 200);
    if (/\.repeat\(|\brepeat\(/.test(near)) continue;
    out.push({ line: ctx.lineAt(m.index), message: 'Curves.linear on UI motion feels mechanical. Use Curves.easeOutCubic or a spring.' });
  }
  return out;
}

function flutterNoTextScale(text, ctx) {
  const re = /\bTextScaler\.noScaling\b|\btextScaleFactor\s*:\s*1(?:\.0+)?(?![\d.])/g;
  return [...matches(re, text)].map((m) => ({ line: ctx.lineAt(m.index), message: 'Text scaling is pinned to 1. People who enlarge their font lose the content. Clamp with TextScaler.clamp instead.' }));
}

const MOBILE_NATIVE_RULES = [
  { id: 'swiftui-linear', severity: 'warn', exts: ['.swift'], test: swiftuiLinear },
  { id: 'swiftui-animation-no-value', severity: 'warn', exts: ['.swift'], test: swiftuiAnimationNoValue },
  { id: 'swiftui-fill-no-clip', severity: 'warn', exts: ['.swift'], test: swiftuiFillNoClip },
  { id: 'swiftui-fixed-font', severity: 'warn', exts: ['.swift'], test: swiftuiFixedFont },
  { id: 'compose-linear', severity: 'warn', exts: ['.kt'], test: composeLinear },
  { id: 'flutter-linear', severity: 'warn', exts: ['.dart'], test: flutterLinear },
  { id: 'flutter-no-text-scale', severity: 'error', exts: ['.dart'], test: flutterNoTextScale },
];

export const NATIVE_RULES = [...BASE_NATIVE_RULES, ...MOBILE_NATIVE_RULES];

NATIVE_PROJECT_RULES.push({
  id: 'swiftui-no-reduce-motion',
  severity: 'warn',
  exts: ['.swift'],
  uses: /\bwithAnimation\b|\.animation\(/,
  handles: /accessibilityReduceMotion/,
  message: 'Animations run and nothing reads accessibilityReduceMotion. Check @Environment(\\.accessibilityReduceMotion) and tone motion down.',
});
