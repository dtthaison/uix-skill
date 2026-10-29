---
stack: vue
kind: web
check: browser
---

# Vue 3 (Vite)

## Setup tokens from DESIGN.md

```
npx --yes @google/design.md@0.4.0 export --format css-tailwind DESIGN.md > src/assets/theme.css
```

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
export default { plugins: [vue(), tailwindcss()] };
```

```css
/* src/assets/main.css, imported in main.ts */
@import "tailwindcss";
@import "./theme.css";
```

Add font fallbacks to the exported `--font-*` values.

**Plain CSS (no Tailwind):** export custom properties instead, import the file once in `src/main.ts`, and use the `var(--…)` tokens in your stylesheets.

```
npx --yes @google/design.md@0.4.0 export --format css-vars DESIGN.md > src/assets/tokens.css
```

## Components

- Single-file components with `<script setup lang="ts">`. Type props with `defineProps<{ label: string }>()` and events with `defineEmits`.
- Use `ref`/`computed`; derive instead of watching when you can. Two-way binding on custom inputs: `defineModel()`.
- Style with token utilities in the template. Use the `:class` object/array syntax for state, never string concatenation.
- `v-for` always has a stable `:key`. Forms bind `<label for>` to an `id`.
- Cover hover, `focus-visible`, active, disabled, loading, empty and error states.

## Motion

Use `<Transition>` and `<TransitionGroup>` with CSS classes: `.fade-enter-active { transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1); }`, `.fade-enter-from { opacity: 0; }`. Animate only `transform` and `opacity`. Add the `prefers-reduced-motion` block from motion.md so these collapse to near zero for users who ask for it.

## Accessibility

- Use real `button`/`a`/`RouterLink`. Never `@click` on a `div`.
- On route change, move focus to the page `h1` and update `document.title`.
- Modal: `<dialog>` or a headless library (Reka UI) for focus trap and Escape.
- Keep `aria-live="polite"` on async status regions.

## Gotchas

- Do not destructure `props` or `reactive()` objects without `toRefs`, or reactivity is lost.
- Never mutate props; emit an event or use `defineModel`.
- Tailwind classes must be whole strings in the template.
- Teardown timers and listeners in `onUnmounted`.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md src
node <skill>/scripts/check.mjs http://localhost:5173
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.
