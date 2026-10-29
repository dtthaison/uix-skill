---
stack: nuxtjs
kind: web
check: browser
---

# Nuxt

## Setup tokens from DESIGN.md

```
npx --yes @google/design.md@0.4.0 export --format css-tailwind DESIGN.md > app/assets/css/theme.css
```

```css
/* app/assets/css/main.css */
@import "tailwindcss";
@import "./theme.css";
```

```ts
// nuxt.config.ts
import tailwindcss from '@tailwindcss/vite';
export default defineNuxtConfig({
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
});
```

In Nuxt 3 the directory is `assets/css/` at the project root, not under `app/`. Load fonts with `@nuxt/fonts` (it resolves families used in CSS) and add fallbacks to the exported `--font-*` values.

## Components

- Components in `components/` are auto-imported; composables in `composables/`. Pages come from `pages/`.
- `<script setup lang="ts">`, `defineProps`, `defineModel`. Use `<NuxtLink>` for internal links and `<NuxtImg>` (with `@nuxt/image`) for images.
- Fetch with `useFetch`/`useAsyncData` and render the `status` states: pending (skeleton), error (message plus retry), empty (next action).
- Style with token utilities; cover all interactive states.

## Motion

Use `<Transition>` with CSS, and `pageTransition: { name: 'page', mode: 'out-in' }` in `nuxt.config` or `definePageMeta`. Keep 300 ms or less, ease-out, `transform` and `opacity` only. Add the `prefers-reduced-motion` block from motion.md.

## Accessibility

- Set `lang` with `useHead({ htmlAttrs: { lang: 'en' } })`, one `h1` per page, `main` in the layout.
- Use `<NuxtRouteAnnouncer />` in `app.vue` so route changes are announced.
- Real `button`/`a`; label every input.

## Gotchas

- Code in setup runs on the server first. Touch `window`/`document` only in `onMounted` or inside `<ClientOnly>`.
- Do not use plain `ref` module state for shared data (it leaks across requests); use `useState`.
- Hydration mismatches come from random or time-based values in render.
- Tailwind classes must be whole strings.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md app components pages layouts assets
node <skill>/scripts/check.mjs http://localhost:3000
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.
