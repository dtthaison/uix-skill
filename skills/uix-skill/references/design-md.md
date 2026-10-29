# DESIGN.md

DESIGN.md is the one file that locks a project's look. YAML frontmatter holds the tokens (the exact values). The markdown body holds the reasons. The tokens win when the two disagree. Write it before the first screen, read it before every change, and keep it short.

Format spec: `npx --yes @google/design.md@0.4.0 spec`. Working samples: `data/examples/ledger.md`, `field-notes.md`, `harbor.md`.

## Commands

```bash
npx --yes @google/design.md@0.4.0 lint DESIGN.md
npx --yes @google/design.md@0.4.0 export --format css-tailwind DESIGN.md > theme.css
```

- `lint <file>` prints JSON findings and a summary. Fix every `error`. Fix warnings unless you can say why not.
- `export --format <name> <file>` prints to stdout. Formats: `css-tailwind` (Tailwind v4 `@theme` CSS), `json-tailwind` (v3 `theme.extend`, alias `tailwind`), `dtcg` (W3C design tokens), `css-vars` (custom properties; `--prefix` adds a prefix).
- `diff <a> <b>` compares two files. `spec` prints the format spec.

The linter checks:

- `broken-ref` (error): a `{path.to.token}` that points at nothing.
- `contrast-ratio` (warning): a component's `backgroundColor` and `textColor` fall under 4.5:1.
- `section-order`, `missing-sections`, `missing-typography`, and duplicate `##` headings (a duplicate is an error).
- `orphaned-tokens` (warning): a color no component uses.

## Frontmatter

```yaml
---
version: alpha
name: Ledger
description: optional one line
colors:
  primary: "#0B6B4F"        # any CSS color; hex is the default
typography:
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 16px          # px, em or rem only
    fontWeight: 400
    lineHeight: 1.55        # unitless or a dimension
    letterSpacing: 0em      # optional
    fontFeature: "tnum"     # optional
rounded: { sm: 4px, md: 8px }
spacing: { sm: 8px, md: 16px }   # dimensions or plain numbers
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "#095A42"
---
```

- Component properties the linter knows: `backgroundColor`, `textColor`, `typography`, `rounded`, `padding`, `size`, `height`, `width`. Others (such as `borderColor`) draw a warning.
- Express states and variants as separate keys: `button-primary`, `button-primary-hover`, `button-primary-active`.
- Reference tokens with `{group.name}`. Token groups must point at a single value. Only `components` may point at a whole typography entry.
- Name tokens by role (`primary`, `on-primary`, `surface`, `muted`) rather than by value (`green-500`).
- Use a `neutral` or page background, `on-surface` for text, and `on-primary` for text on the accent.

## The 8 sections, in this order

Use `##` headings, skip any that do not apply, never repeat one, never reorder. `## Motion` is the one optional extra section, placed after Components (see below).

1. **Overview** (or "Brand & Style"). Who it is for, the feeling, density. Name the `palettes.csv` row and the `fonts.csv` row you took values from.
2. **Colors**. Each color with its role and the one place it is allowed. State contrast pairs you rely on.
3. **Typography**. Families, the scale, what each level is for, case rules.
4. **Layout** (or "Layout & Spacing"). Grid, max width, spacing unit, alignment rules.
5. **Elevation & Depth** (or "Elevation"). Shadows, or how a flat design separates layers.
6. **Shapes**. Radius rules per element type.
7. **Components**. Behavior of buttons, inputs, lists and so on, in prose; values live in `components:`.
8. **Do's and Don'ts**. Four to eight short, checkable rules.

## Mobile notes

- Sizes are dp (Android) or pt (iOS) written as px: `fontSize: 16px` means 16 dp/pt. The linter wants a unit; the code uses the bare number.
- Dark mode: add a `<role>-dark` colour token for each role that changes (`surface`, `surface-dark`, `primary-dark`). Give each component that changes in dark a separate key that points at them (`card-dark: { backgroundColor: "{colors.surface-dark}", textColor: "{colors.on-surface-dark}" }`). This keeps lint free of orphaned-token warnings. The Colors section names the pairs.
- `## Motion` sits between Components and Do's and Don'ts.

## Mobile motion tier

Mobile projects record how lively the motion is. Under the `## Motion` heading of DESIGN.md, write one line: `Motion tier: calm` or `Motion tier: lively`. Calm favors effects springs and short timing with no overshoot. Lively allows spatial springs, gestures that follow the finger and shared elements. `references/mobile-motion.md` explains both tiers and maps `motion_feel` from `data/mobile-styles.csv` onto them.

Optionally add a frontmatter key too, `motion: { tier: calm }`. Result of `npx --yes @google/design.md@0.4.0 lint` on a sample with that key: zero errors and zero warnings, so the linter accepts it, but it does not read or check the key, so keep the prose line as the source of truth.

## Workflow

1. Pick a palette row and a font row from `data/`. Copy values into tokens. Do not invent colors that fail 4.5:1.
2. Write frontmatter, then the 8 sections. Keep each section to a few lines.
3. Run `lint`. Fix until there are zero errors and zero warnings.
4. Export for your stack: `css-tailwind` for Tailwind v4, `css-vars` for plain CSS, `json-tailwind` for Tailwind v3.
5. Make the source use the tokens only. `node <skill>/scripts/rules.mjs --design DESIGN.md <path>` then reports `banned-font` for any font not declared there.

## Native stacks

A DESIGN.md is stack-neutral, even when it was written for another stack. On iOS px means pt; on Android px means dp. Swap the icon set for the platform's own (SF Symbols on iOS, Material Symbols on Android). Take springs from the stack's column in `data/mobile-motion.csv`, not from the numbers in DESIGN.md. `fontFeature: "tnum"` is `.monospacedDigit()` in SwiftUI.

Tokens are stack-neutral. Translate colors to asset-catalog colors or a theme object, `typography` to text styles, `rounded` and `spacing` to constants. See `references/stacks/` for the target file layouts. Keep the token names unchanged across stacks.
