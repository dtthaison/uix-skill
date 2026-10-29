---
stack: angular
kind: web
check: browser
---

# Angular

## Setup tokens from DESIGN.md

```
npx --yes @google/design.md@0.4.0 export --format css-vars DESIGN.md > src/theme.css
```

```json
// angular.json -> projects.<app>.architect.build.options
"styles": ["src/theme.css", "src/styles.css"]
```

```css
/* src/styles.css */
body { background: var(--color-surface); color: var(--color-deep); font: var(--text-body-md) / 1.6 var(--font-body-md), system-ui, sans-serif; }
```

Components read tokens with `var(--color-primary)` in their styles. Redefine the variables for dark mode under `@media (prefers-color-scheme: dark)` or a `[data-theme="dark"]` selector on `<html>`. Check the export's variable names against your DESIGN.md. Load fonts with `@font-face` or a `<link>`.

## Components

- Standalone components with `ChangeDetectionStrategy.OnPush`; signals (`signal`, `computed`, `input()`, `output()`) for state.
- Templates use built-in control flow: `@if`, `@for (item of items; track item.id)`, `@empty`, `@switch`. `@for` requires `track`.
- Component styles are scoped (emulated encapsulation); share tokens through the CSS variables, not copied hex values.
- Forms: typed reactive forms; show errors in text under the field, linked with `aria-describedby`.
- Cover hover, `:focus-visible`, active, disabled, loading, empty and error states.

## Motion

Prefer CSS transitions and keyframes on `transform` and `opacity`. Angular's `animate.enter` and `animate.leave` bindings (v20.2+) apply classes for enter/leave; the older `@angular/animations` package is being deprecated. With either, include the `prefers-reduced-motion` block from motion.md; with `@angular/animations` you can also pass `provideAnimationsAsync('noop')` to disable animations. 150 to 300 ms, ease-out.

## Accessibility

- Use `@angular/cdk/a11y` (`cdkTrapFocus`, `LiveAnnouncer`, `FocusMonitor`) for dialogs and announcements.
- After route changes, focus the page `h1`; the router does not move focus for you.
- Real `button`/`a` with `routerLink`; label every input; `aria-label` on icon-only buttons.

## Gotchas

- Do not bind to methods in templates for heavy work; use `computed`.
- Unsubscribe from observables (`takeUntilDestroyed()` or the `async` pipe) to avoid leaks.
- Component CSS cannot see another component's elements; pass classes or use CSS variables.
- Avoid `::ng-deep`.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md src
node <skill>/scripts/check.mjs http://localhost:4200
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.

Start `ng serve` first. `.html` templates and `.css` or `.scss` files are checked statically.
