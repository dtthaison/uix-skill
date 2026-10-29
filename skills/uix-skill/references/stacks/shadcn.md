---
stack: shadcn
kind: web
check: browser
---

# shadcn/ui

Also load the host framework's guide (see SKILL.md, Stack detection); this file covers only the shadcn/ui layer.

## Setup tokens from DESIGN.md

shadcn/ui themes through CSS variables. Export for reference, then map DESIGN.md keys onto shadcn's variables:

```
npx --yes @google/design.md@0.4.0 export --format css-vars DESIGN.md
```

| shadcn variable | DESIGN.md key |
| --- | --- |
| `--background` / `--foreground` | page surface / main text |
| `--card` / `--card-foreground` | raised surface / its text |
| `--primary` / `--primary-foreground` | brand color / `on-primary` |
| `--secondary`, `--accent`, `--muted`, `--muted-foreground` | secondary surfaces and quiet text |
| `--destructive`, `--border`, `--input`, `--ring` | danger, line, field border, focus |
| `--radius` | the base shape radius |

```css
/* app/globals.css or src/index.css */
:root { --background: #eff8f7; --foreground: #0b3434; --primary: #0e7c86; --primary-foreground: #fff; --radius: 0.5rem; }
.dark { --background: /* dark surface */; --foreground: /* dark text */; --primary: /* dark primary */; }
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --radius-md: var(--radius);
}
```

Every variable shadcn's components use must exist in both `:root` and `.dark`; copy the full list from your generated `globals.css` and replace the values. Set fonts in `@theme inline` (`--font-sans`).

## Components

- Add components with `npx shadcn@latest add button card dialog`. They are copied into `components/ui`, so you own and may edit them.
- Compose, do not fork: build page components from the `ui` primitives and use `cn()` for class merging.
- Use the `variant` and `size` props (`cva`) and add a variant instead of overriding classes at each call site.
- Replace the default look: change radius, density and font to match DESIGN.md. Untouched defaults read as generic.

## Motion

Components use `data-[state=open]:animate-in` and `tw-animate-css` utilities. Keep durations 150 to 300 ms and ease-out, and add the `prefers-reduced-motion` block from motion.md or `motion-reduce:` classes. Do not add bounce or large scale.

## Accessibility

- The primitives (Radix or Base UI) give focus trapping and keyboard support. Keep `DialogTitle` (use `sr-only` if hidden) and `DialogDescription`, or you get console warnings and unlabeled dialogs.
- `Button size="icon"` needs `aria-label`. Pair `Label` with `htmlFor`.
- Check `--primary` vs `--primary-foreground` and `--muted-foreground` vs `--background` contrast in both themes.

## Gotchas

- Colors are referenced as `bg-primary`; they only work through the `@theme inline` mapping.
- Do not rename shadcn variables; components depend on them.
- Edit components in place instead of wrapping them with `!important` overrides.
- Icons: lucide-react only; never emoji.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md app components src
node <skill>/scripts/check.mjs http://localhost:3000
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.
