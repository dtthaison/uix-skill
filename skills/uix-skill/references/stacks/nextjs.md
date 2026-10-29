---
stack: nextjs
kind: web
check: browser
---

# Next.js (App Router)

## Setup tokens from DESIGN.md

```
npx --yes @google/design.md@0.4.0 export --format css-tailwind DESIGN.md > app/theme.css
```

```css
/* app/globals.css, imported in app/layout.tsx */
@import "tailwindcss";
@import "./theme.css";
@theme inline {
  --font-display: var(--font-display-face), Georgia, serif;
  --font-body-md: var(--font-body-face), system-ui, sans-serif;
}
```

```tsx
// app/layout.tsx
import { DM_Serif_Display, DM_Sans } from 'next/font/google';
const display = DM_Serif_Display({ subsets: ['latin'], weight: '400', variable: '--font-display-face' });
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body-face' });
// <html className={`${display.variable} ${body.variable}`}>
```

Use the families DESIGN.md names. The `@theme inline` block overrides the exported font values with the `next/font` variables. PostCSS needs `@tailwindcss/postcss` in `postcss.config.mjs`.

**Plain CSS (no Tailwind):** export custom properties instead, import the file once in `app/layout.tsx`, and use the `var(--…)` tokens in your stylesheets.

```
npx --yes @google/design.md@0.4.0 export --format css-vars DESIGN.md > app/tokens.css
```

## Components

- Server Components by default. Add `'use client'` only to leaf components that need state, effects or browser APIs.
- Navigate with `next/link`; images with `next/image` (set `width`/`height` or `fill` plus `sizes`, and `priority` for the LCP image).
- Use `loading.tsx` for skeletons, `error.tsx` for errors and `not-found.tsx` for empty routes.
- Forms: Server Actions with `useActionState`; show field errors in text beside the input.
- Style with token utilities; all states (hover, `focus-visible`, active, disabled, loading) are required.

## Motion

CSS transitions first. Use `motion` or GSAP only in client components (see motion.md for `useGSAP` scoping). Honor `prefers-reduced-motion` in CSS and via `useReducedMotion()`. Keep route transitions at 300 ms or less, ease-out.

## Accessibility

- Put `lang` on `<html>`. One `h1` per page; `main` landmark in the layout.
- Provide a skip link to `#main`. After client navigation, focus is managed by the App Router; verify it lands on the new content.
- `next/image` needs meaningful `alt`.

## Gotchas

- A Server Component cannot use `useState`, `useEffect`, `onClick` or `window`. Move that part to a `'use client'` file.
- Never read `window`/`localStorage` during render in client components either; the first pass runs on the server (hydration mismatch). Use `useEffect`.
- Fonts via `<link>` in the head bypass `next/font` optimisation.
- Tailwind classes must be whole strings in source.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md app   # or src/app
node <skill>/scripts/check.mjs http://localhost:3000
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.
