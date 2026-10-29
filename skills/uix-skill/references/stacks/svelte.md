---
stack: svelte
kind: web
check: browser
---

# Svelte 5 / SvelteKit

## Setup tokens from DESIGN.md

```
npx --yes @google/design.md@0.4.0 export --format css-tailwind DESIGN.md > src/theme.css
```

```css
/* src/app.css */
@import "tailwindcss";
@import "./theme.css";
```

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
export default { plugins: [tailwindcss(), sveltekit()] };
```

Import `../app.css` in `src/routes/+layout.svelte`. Add font fallbacks to the exported `--font-*` values.

**Plain CSS (no Tailwind):** export custom properties instead, import the file once in `src/routes/+layout.svelte`, and use the `var(--…)` tokens in your stylesheets.

```
npx --yes @google/design.md@0.4.0 export --format css-vars DESIGN.md > src/tokens.css
```

## Components

Svelte 5 runes, not `export let` or `$:`.

```svelte
<script lang="ts">
  let { label, onclick, children } = $props();
  let busy = $state(false);
  const upper = $derived(label.toUpperCase());
</script>
<button class="rounded-md bg-primary px-4 py-2 text-on-primary" {onclick} disabled={busy}>
  {upper}{@render children?.()}
</button>
```

- Use `$state`, `$derived`, `$effect` (with cleanup return), snippets and `{@render}` instead of slots.
- `{#each items as item (item.id)}` always has a key. Handlers are plain props (`onclick`), not `on:click`.
- Cover hover, `focus-visible`, active, disabled, loading, empty and error states.

## Motion

Use `transition:fade={{ duration: 200 }}` or `in:fly={{ y: 8, duration: 200 }}` from `svelte/transition`, with a deceleration easing from `svelte/easing` (`cubicOut`). Gate it: read `matchMedia('(prefers-reduced-motion: reduce)')` and set durations to 0, and keep the CSS `prefers-reduced-motion` block from motion.md. Svelte transitions do not respect it on their own.

## Accessibility

- Svelte's compiler emits a11y warnings (`a11y_*`). Treat them as errors; never silence them with `svelte-ignore`.
- Real `button`/`a`; label every input; modals via `<dialog>`.
- After navigation, move focus to the page `h1` (SvelteKit resets focus to `body` by default).

## Gotchas

- Destructured `$props()` values stay reactive; do not copy them into plain variables.
- `$effect` does not run on the server. Put browser-only code there.
- Scoped styles do not reach child components; pass classes as props or use `:global`.
- Tailwind classes must be whole strings.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md src
node <skill>/scripts/check.mjs http://localhost:5173
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.
