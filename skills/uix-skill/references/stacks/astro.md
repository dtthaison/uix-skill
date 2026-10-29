---
stack: astro
kind: web
check: browser
---

# Astro

## Setup tokens from DESIGN.md

```
npx --yes @google/design.md@0.4.0 export --format css-tailwind DESIGN.md > src/styles/theme.css
```

```css
/* src/styles/global.css */
@import "tailwindcss";
@import "./theme.css";
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ vite: { plugins: [tailwindcss()] } });
```

Import `../styles/global.css` in the layout's frontmatter (`import '../styles/global.css';`). Add font fallbacks to the exported `--font-*` values.

## Components

- `.astro` components render to static HTML with zero JS. Prefer them for everything that does not need state.
- Add an island only where needed, with the lightest directive: `client:visible` or `client:idle` over `client:load`.
- Type props with `interface Props` and read `Astro.props`. Use `<Image />` from `astro:assets` with `alt`.
- Content: use content collections, not hand-copied markup.
- Style with token utilities; cover all interactive states.

## Motion

CSS first. For page transitions add `<ClientRouter />` from `astro:transitions` (named `<ViewTransitions />` before Astro 5) and tune with `transition:animate`. Honor `prefers-reduced-motion`; view transitions are disabled by the browser for it, but keep the CSS block from motion.md for your own animations. Scroll-driven effects run in a small `<script>` with an `IntersectionObserver`.

## Accessibility

- `<html lang>` in the layout; one `h1`; `main` landmark; skip link.
- With view transitions, check focus and `aria-live` announcements after navigation.
- Island components must be keyboard operable on their own.

## Gotchas

- Scripts in `.astro` run once and are bundled; use `astro:page-load` to re-run after client navigation.
- Framework islands do not share state; pass data via props or a store such as nanostores.
- Do not hydrate whole pages (`client:load` everywhere) and lose Astro's main benefit.
- Tailwind classes must be whole strings.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md src
node <skill>/scripts/check.mjs http://localhost:4321
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.
