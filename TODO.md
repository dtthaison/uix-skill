# TODO

Features to add, roughly in priority order. Each item names the gap it closes.
Keep the skill free (no paid APIs, no keys) and the scripts dependency-free where possible.

## Next up

- [ ] **Token drift rule** in `rules.mjs`: `off-token-color`, `off-token-radius`, `off-token-font` for hard-coded values not in DESIGN.md. Hard rule 1 ("never invent colors, fonts or radii") has no script behind it.
- [ ] **Media emulation** in `check.mjs`: `--emulate dark,reduced-motion,forced-colors` via CDP `Emulation.setEmulatedMedia`. `--themes` only covers attribute/class themes, not `prefers-color-scheme`.
- [ ] **Keyboard probe** in `check.mjs`: Tab through the page, flag focusables with no visible focus ring and tab order that jumps against reading order.

## Checks

- [ ] Optional axe-core run in `check.mjs` (MIT; vendored or CDN): labels, ARIA, landmarks, heading order.
- [ ] Reflow and text-spacing probes (WCAG 1.4.10, 1.4.12): 320 px at 200% zoom, forced letter/line spacing. Reuse `h-overflow` and `text-clipped`.
- [ ] Core Web Vitals: LCP and CLS via PerformanceObserver; count of font weights loaded.
- [ ] Static web rules: `div-onclick`, `placeholder-as-label`, `positive-tabindex`, `img-no-dimensions`, `autoplay-video`, `gradient-text` (`background-clip:text`).
- [ ] Turn judgment rules into DOM probes: `nested-cards`, `everything-centered`, `icon-tile-grid`.
- [ ] Native rules beyond React Native:
  - [ ] Compose: `clickable` without semantics or minimum size.
  - [ ] Flutter: `GestureDetector` without `Semantics`.
  - [ ] XAML (WPF, WinUI, UWP, Uno, Avalonia): hard-coded brushes instead of `ThemeResource`/`StaticResource`, missing `AutomationProperties.Name`.

## Commands

- [ ] `/uix critique`: screenshot-based design review (hierarchy, rhythm, consistency) with a score. Separate from `audit`.
- [ ] `/uix tune bolder|quieter|denser|airier`: shift DESIGN.md tokens one way, show `design.md diff`, rebuild.
- [ ] `/uix harden`: empty, loading, error, offline and long-text states. Add `check.mjs --pseudo` (40% longer strings) and `--dir rtl`.
- [ ] `/uix extract`: `scripts/inventory.mjs` groups the colors, spacing and radii in use, proposes DESIGN.md tokens, lists strays.
- [ ] `/uix theme`: add dark mode or a second theme from DESIGN.md, contrast-checked per theme.

## Tokens and assets

- [ ] `scripts/tokens.mjs`: DESIGN.md to SwiftUI color assets, Compose `Theme.kt`, Flutter `ThemeData`, XAML `ResourceDictionary`. The design.md CLI only exports Tailwind, CSS vars and DTCG.
- [ ] Brand assets: favicon set, OG/social images rendered by Chrome from a DESIGN.md template, web manifest.
- [ ] `references/dataviz.md`: chart choice, chart palette taken from DESIGN.md, axis and legend rules.

## Workflow and infrastructure

- [ ] Multi-page web checks: `check.mjs --routes routes.json` or read the sitemap.
- [ ] Visual regression: `--baseline <dir>` with a plain-JS PNG diff, so `polish` can show nothing changed that shouldn't have.
- [ ] Hover, focus and active screenshots via CDP `CSS.forcePseudoState`.
- [ ] HTML report at `.uix/report.html`: contact sheet of shots next to findings.
- [ ] CI mode: SARIF output and a sample GitHub Action.
- [ ] Skill evals: fixture projects with expected outcomes, to catch regressions as the guides grow.
- [ ] Windows: PowerShell install script and Chrome path detection.

## Stacks

- [ ] .NET MAUI
- [ ] Blazor
- [ ] Electron / Tauri (reuse `check.mjs` over CDP)
- [ ] Rails and Django templates
- [ ] Email (MJML or React Email)
- [ ] `check-mobile.mjs --native` for Android (Compose) and Flutter; it is iOS-only today.
