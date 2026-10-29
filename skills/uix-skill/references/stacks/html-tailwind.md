---
stack: html-tailwind
kind: web
check: browser
---

# Plain HTML + Tailwind

## Setup tokens from DESIGN.md

Tailwind v4 is configured in CSS, not `tailwind.config.js`. Export the tokens into the entry CSS.

```
npx --yes @google/design.md@0.4.0 export --format css-tailwind DESIGN.md > src/theme.css
```

```css
/* src/input.css */
@import "tailwindcss";
@import "./theme.css";   /* contains the @theme { --color-*, --font-*, --radius-* } block */
```

Build with `npx @tailwindcss/cli -i src/input.css -o dist/output.css --watch` and link `dist/output.css`. Tokens become utilities: `bg-primary`, `text-deep`, `rounded-md`, `font-display`. The export lists font names without fallbacks, so add them: `--font-display: "DM Serif Display", Georgia, serif;`. Load the fonts with `<link>` or `@font-face`.

## Components

- Use semantic elements (`button`, `a`, `nav`, `main`) and style them with utilities; never `div` with `onclick`.
- Repeat a pattern three times, then extract it with `@apply` in a component class or a template partial. Never invent arbitrary values (`w-[317px]`) when a token exists.
- State variants: `hover:`, `focus-visible:`, `active:scale-[0.97]`, `disabled:`, `aria-[invalid=true]:`. Dark mode: `dark:` variants, or redefine the color variables under `@media (prefers-color-scheme: dark)`.
- Icons: inline SVG from one set (Lucide, Phosphor or Heroicons). No emoji.

## Motion

Use `transition-[opacity,transform] duration-200 ease-out`, never `transition-all`. Gate movement with `motion-safe:` or neutralise it with `motion-reduce:transition-none` and the `prefers-reduced-motion` block from motion.md. Entrances start at `scale-95 opacity-0`, never `scale-0`.

## Accessibility

- Keep the focus ring: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`. Never `outline-none` without a replacement.
- Targets at least 24 px, aim for 44 px on touch (`min-h-11 min-w-11`).
- Check contrast of every token pair (text 4.5:1, large text 3:1) in light and dark.
- `<img>` always has `alt`; decorative images use `alt=""`.

## Gotchas

- Tailwind scans files for class names. Build class strings whole (`bg-primary`), never by concatenation (`'bg-' + name`).
- v4 uses `@import "tailwindcss"`, not `@tailwind base;`. `bg-opacity-*` is gone; write `bg-primary/50`.
- Default Tailwind blue and `shadow-lg` everywhere look generic. Use your tokens and the DESIGN.md elevation rules.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md src index.html
node <skill>/scripts/check.mjs http://localhost:3000
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.

Serve the built folder first, for example `npx --yes serve .` (port 3000).
