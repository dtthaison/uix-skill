---
stack: react
kind: web
check: browser
---

# React (Vite)

## Setup tokens from DESIGN.md

```
npx --yes @google/design.md@0.4.0 export --format css-tailwind DESIGN.md > src/theme.css
```

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
export default { plugins: [react(), tailwindcss()] };
```

```css
/* src/index.css, imported once in main.tsx */
@import "tailwindcss";
@import "./theme.css";
```

Add font fallbacks to the exported `--font-*` values and load the fonts with `@font-face` or `@fontsource/<family>`.

**Plain CSS (no Tailwind):** export custom properties instead, import the file once in `src/main.tsx`, and use the `var(--…)` tokens in your stylesheets.

```
npx --yes @google/design.md@0.4.0 export --format css-vars DESIGN.md > src/tokens.css
```

## Components

- Function components with typed props. Derive state; do not mirror props in `useState`.
- Style with token utilities (`bg-primary text-on-primary rounded-md`). Merge conditional classes with `clsx`; never build class names by string concatenation.
- Every component ships hover, `focus-visible`, active, disabled, loading, empty and error states.
- Lists need stable `key`s (ids, not indexes). Forms use `<label htmlFor>` and controlled inputs.
- Icons come from one library (`lucide-react`); never emoji.

## Motion

CSS transitions on `transform` and `opacity` cover most needs. For sequences use `motion` (`import { motion, useReducedMotion } from 'motion/react'`) or GSAP with `useGSAP` and a `scope` ref (see motion.md). Read `useReducedMotion()` and drop movement; keep fades. Always honor `prefers-reduced-motion`. Animate exits with `AnimatePresence`, 150 to 300 ms, ease-out.

## Accessibility

- Buttons are `<button type="button">`; links are `<a>`/router `Link`. Never `onClick` on a `div`.
- After a route change, move focus to the new `h1` or `main`.
- Dialogs: use the native `<dialog>` or a library (Radix, React Aria) that traps focus and restores it.
- Icon-only buttons need `aria-label`; announce async results with `aria-live="polite"`.

## Gotchas

- Effects with subscriptions or timers must return a cleanup. Strict Mode runs effects twice in dev.
- Do not read layout (`getBoundingClientRect`) during render.
- Tailwind classes must appear whole in source or they are not generated.
- Gate window-dependent code (`matchMedia`) behind `useEffect` if you server-render.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md src
node <skill>/scripts/check.mjs http://localhost:5173
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.
