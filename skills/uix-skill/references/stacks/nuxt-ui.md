---
stack: nuxt-ui
kind: web
check: browser
---

# Nuxt UI (v3)

Also load `nuxtjs.md`; this file covers only the Nuxt UI layer.

## Setup tokens from DESIGN.md

Nuxt UI v3 sits on Tailwind v4. Install `@nuxt/ui`, then:

```css
/* app/assets/css/main.css (registered in nuxt.config `css`) */
@import "tailwindcss";
@import "@nuxt/ui";
```

```
npx --yes @google/design.md@0.4.0 export --format css-tailwind DESIGN.md > app/assets/css/theme.css
```

Import `theme.css` after `@nuxt/ui`, then map tokens to Nuxt UI's semantic variables:

```css
:root {
  --ui-primary: var(--color-primary);
  --ui-bg: var(--color-surface);
  --ui-text: var(--color-deep);
  --ui-text-muted: var(--color-muted);
  --ui-border: var(--color-tide);
  --ui-radius: var(--radius-md);
}
.dark { --ui-primary: /* dark primary */; --ui-bg: /* dark surface */; --ui-text: /* dark text */; }
```

Alias names to your DESIGN.md keys. Wrap the app in `<UApp>`. Set `ui.colors` (`primary`, `neutral`) in `app.config.ts` to palette names, and provide a full 50 to 950 scale in `@theme` if you add a custom palette name.

## Components

- Use `UButton`, `UInput`, `UFormField`, `UCard`, `UModal`, `UTable` instead of rebuilding. Override with the `ui` prop or `app.config.ts` `ui: { button: { slots: {...} } }`, not by editing `node_modules`.
- Icons use Iconify names: `i-lucide-search`. Keep to one set.
- Forms: `UForm` with a schema (zod/valibot) and `UFormField` for labels and errors.
- Set `variant`/`size` deliberately; do not leave every button on the default solid style.

## Motion

Nuxt UI does not guarantee reduced-motion handling for its components. Add the `prefers-reduced-motion` block from motion.md to your CSS so component animations (accordion, modal and other keyframes) collapse too. For your own animation use `<Transition>`. Do not override component durations above 300 ms.

## Accessibility

- Nuxt UI builds on Reka UI primitives, so keyboard handling and ARIA come built in. Do not strip them.
- Always give `UFormField` a `label`; icon-only `UButton` needs `aria-label`.
- Verify contrast of `--ui-primary` against `--ui-bg` and on filled buttons in light and dark.

## Gotchas

- Colors in `app.config.ts` are palette names, not hex values. Hex goes in CSS variables.
- Missing `<UApp>` breaks toasts, tooltips and modals.
- The `.dark` class is set by `@nuxtjs/color-mode`; define dark tokens under `.dark`.
- Default Nuxt UI green primary is a tell; always set your own.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md app
node <skill>/scripts/check.mjs http://localhost:3000
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.
