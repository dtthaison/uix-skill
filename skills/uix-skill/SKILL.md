---
name: uix-skill
description: Design and build distinctive, accessible UI, and audit, polish or animate it. Use when building, redesigning, auditing, theming or animating landing pages, marketing sites, dashboards, app screens, forms or components; when writing or reading a DESIGN.md; or when the user says "/uix", "make this look better", "audit this screen" or "add animation". Picks an art direction, locks tokens in DESIGN.md, then builds with static and browser checks. Covers 22 stacks. Web - React, Next.js, Vue, Nuxt, Nuxt UI, Svelte, Angular, Astro, Laravel, shadcn/ui, Three.js, HTML + Tailwind. Native - SwiftUI, Jetpack Compose, Flutter, React Native, WPF, WinUI, UWP, Uno, Avalonia, JavaFX. Free tools only.
---

# uix-skill

Build UI that looks designed, not generated. Decide the look once (DESIGN.md), build from it, check the result with scripts.

Paths: every `references/`, `data/` and `scripts/` path below is relative to the folder containing this SKILL.md. Run scripts from the user's project root as `node <that folder>/scripts/<name>.mjs`. Scripts need Node 22.

## Commands

| Command | Job |
| --- | --- |
| `/uix init` | Read the project, ask 3 questions, offer 3 directions, write and lint DESIGN.md. |
| `/uix build` | Build a page, screen or component from DESIGN.md, check it, fix it. Default. |
| `/uix audit` | Run the checks and report. Edit nothing. |
| `/uix polish` | Fix the top audit issues. Keep logic, routes and copy meaning. |
| `/uix motion` | Review or add motion, after the 4 questions. |

The verb can arrive as `/uix-skill <verb>`, as `uix <verb>`, or as a plain request ("make the settings page", "audit this screen"). Map a plain request to the closest verb. No clear match: `build`.

## Hard rules

1. DESIGN.md exists: read it first and build from it. Skip intake and directions. Never invent colors, fonts or radii it does not define.
2. Never report done before `scripts/rules.mjs` has run and, for web stacks, `scripts/check.mjs` too. If a check cannot run (see Checks), report `unverified: <reason>`.
3. At most 2 repair rounds after a check. Then report what remains.
4. Images: project assets, then Openverse/Wikimedia with credit, then CSS/SVG art. Never an empty placeholder.
5. Free tools only. No paid APIs, no keys.
6. Do not edit files outside the UI scope of the request. `/uix audit` edits nothing.
7. Load only the files the tables below name. Load one stack file, except `shadcn` and `nuxt-ui`: load that guide plus the host framework's guide.

## Run order

1. Read the project: package.json, config, existing styles, DESIGN.md, `public/` or `assets/`.
2. Detect the stack (table below). Load its guide.
3. Intake. Ask 3 questions together, in one message: audience, the screen's job, tone. Mobile stacks: tone also asks "calm or lively motion?"; record the answer as the motion tier in DESIGN.md (`references/design-md.md`). Skip any the user or project already answered.
4. Offer 3 directions from `references/directions.md` that clearly differ in tone, density and color temperature. Wait for the pick. A direction the owner already chose up front skips the offer.
5. Write DESIGN.md (`references/design-md.md`) and lint it. Fix every lint error.
6. Pick a structure from `references/layouts-web.md` (marketing, content) or `references/layouts-app.md` (signed-in screens).
7. Build the first section. Real copy, real images, all component states.
8. Check (below). Fix errors, then warnings. At most 2 rounds.
9. Report.

Steps 3 to 5 belong to `init`. `build` uses an existing DESIGN.md; with none, run `init` first.

## Existing design systems win

- DESIGN.md exists: read it, lint it, build from it.
- No DESIGN.md but the project has its own tokens or theme (Tailwind config, CSS variables, theme file): `/uix init` writes a DESIGN.md (at the project root) from those tokens. Do not offer new directions unless the user asks for a new look.
- Neither: full `init`.
- Own tokens means colors, fonts or spacing beyond the framework's starter defaults, in a Tailwind v4 `@theme` block, a Tailwind config, CSS custom properties or a platform theme file. The default `--background`/`--foreground` from create-next-app do not count.

## What to load

Load nothing else until needed.

| When | Load |
| --- | --- |
| Any build, polish or audit | `references/anti-slop.md`, `references/components-a11y.md` |
| `init`, or any DESIGN.md write | `references/design-md.md` |
| `init` (offering directions) | `references/directions.md`, then the chosen rows of `data/fonts.csv`, `data/palettes.csv`, `data/styles.csv` |
| Marketing, content, catalog page | `references/layouts-web.md` |
| Dashboard, table, form, settings, auth | `references/layouts-app.md` |
| Any motion, or `/uix motion` | `references/motion.md` |
| Mobile build, polish or audit | `references/mobile-foundations.md`, `references/mobile-patterns.md` |
| Mobile motion | `references/mobile-motion.md` instead of `references/motion.md` |
| Mobile: viewing the app safely, Expo Go versus a dev build, tap and swipe checks | `references/mobile-testing.md` |
| `init` for a mobile app | `data/mobile-styles.csv` instead of `data/styles.csv` (the chosen rows) |
| Any image slot | `references/images.md` |
| Sample DESIGN.md shape | `data/examples/ledger.md`, `field-notes.md` or `harbor.md`. One only. |
| Every task | One `references/stacks/<id>.md`. For `shadcn` or `nuxt-ui`, also the host guide (see Stack detection). |

## Stack detection

First match wins, top to bottom. Nothing matches: `html-tailwind`. Match exact dependency names (`next`, not `next-themes`).

| Signal | Stack id |
| --- | --- |
| `@nuxt/ui` in package.json | `nuxt-ui` |
| `components.json` with shadcn, or `@/components/ui` | `shadcn` |
| `artisan` file or `laravel/framework` in composer.json | `laravel` |
| `nuxt` in package.json | `nuxtjs` |
| `next` in package.json | `nextjs` |
| `@angular/core` or `angular.json` | `angular` |
| `astro` in package.json or `astro.config.*` | `astro` |
| `svelte` or `@sveltejs/kit` | `svelte` |
| `vue` in package.json | `vue` |
| `three` in package.json | `threejs` |
| `react-native` or `expo` in package.json | `react-native` |
| `react` in package.json | `react` |
| `pubspec.yaml` | `flutter` |
| `build.gradle(.kts)` with Compose (`androidx.compose`) | `jetpack-compose` |
| `*.xcodeproj` or `Package.swift` with SwiftUI | `swiftui` |
| `*.csproj` with `Avalonia` | `avalonia` |
| `*.csproj` with `Uno.` or `Uno.WinUI` | `uno` |
| `*.csproj` with `Microsoft.WindowsAppSDK` | `winui` |
| `*.csproj` with `<UseWPF>true</UseWPF>` | `wpf` |
| `*.csproj` with `TargetPlatformIdentifier` `UAP` or `Microsoft.NETCore.UniversalWindowsPlatform` | `uwp` |
| `pom.xml` or `build.gradle` with `javafx` | `javafx` |
| none of the above | `html-tailwind` |

Web ids: angular, astro, html-tailwind, laravel, nextjs, nuxt-ui, nuxtjs, react, shadcn, svelte, threejs, vue. The rest are native.
"Mobile stack" means `react-native`, `flutter`, `swiftui` or `jetpack-compose`. Their requests also load the mobile rows of "What to load".
The more specific stack wins: `nextjs` over `react`, `react-native` over `react`, `laravel` over its JS frontend.
Component-layer stacks load two guides: `shadcn` plus the host guide (`nextjs`, `react`, `astro`, `laravel`, ... detected by this table with the `shadcn` row skipped), and `nuxt-ui` plus `nuxtjs`. Every other project loads one.

## Checks

From the user's project root. Replace `<skill>` with the folder holding this SKILL.md.

```bash
node <skill>/scripts/rules.mjs [--design DESIGN.md] <path...>
node <skill>/scripts/check.mjs <url|file> [--widths 375,768,1280] [--out .uix/shots] [--themes attr=v1,v2]
node <skill>/scripts/images.mjs "<query>" [--count 6]
```

- All three print JSON. `rules.mjs` prints `{findings, skipped}`: minified, over-1 MB or unreadable files land in `skipped` with a reason and are not an error. `check.mjs` prints `{shots, findings, notes}`; read `notes` (for example a load timeout probed early, or a screenshot that failed). Exit 0: clean. Exit 1: error findings (`rules.mjs`, `check.mjs`). Exit 2: usage or environment problem (all three). `images.mjs` only exits 0 or 2.
- Exit 2 is never a clean result and never counts as a repair round. If `check.mjs` cannot reach the page and the project has an obvious dev script (`npm run dev` etc.), start it once in the background and retry. Otherwise ask the user. Name what is missing (Chrome, Node 22, a server that is not running).
- If the check still cannot run, the report says `unverified: <reason>`.
- Web stacks: run `rules.mjs` on the source, then `check.mjs` on the dev server URL or the built file. Widths are 375, 768 and 1280. Screenshots land in `.uix/shots`: `<w>.png` is the full page, and `<w>-<n>.png` are tiles of at most 1600 px. Look at the tiles, not the full shot; it shrinks to unreadable. `check.mjs` scrolls the page first so reveal-on-scroll content shows.
- When the project defines several themes (`[data-theme]`, `[data-skin]`, `.dark`), pass them with `--themes`, for example `--themes data-skin=oatmeal,rose` or `--themes class=dark`. Each theme is probed at the last width; its findings carry `theme`.
- Contrast findings are grouped per color pair (`count`, `sample`, `selectors`). Fix the token, not each element.
- React Native (Expo): run `rules.mjs`, then `node <skill>/scripts/check-mobile.mjs --app exp://127.0.0.1:<port>` against a running Metro server; add `--platform android` for Android emulators (flags and the routes file are in the stack guide). It prints `{shots, findings, notes}` and exits 0, 1 or 2 like `check.mjs`. A note starting `maestro missing:` means hierarchy and flow did not run; report it as `unverified: <reason>`, not a success run. Shots land in `.uix/mobile-shots`. A finding `route-not-navigated` is an error and never a clean result: the shot shows another screen. Repair loop: re-check with `--only <routes>` and one `--devices` entry, not the full matrix.
- Other mobile stacks: run `rules.mjs`. Native iOS apps (SwiftUI) then use `check-mobile.mjs --native` (flags in the stack guide); in an audit pass `--out "$(mktemp -d)"`. Others use the manual screenshot recipe in the stack file's "How to check" (light, dark, `xxxl` text). No simulator available: `unverified: <reason>`. The 2-round cap applies.
- Other native stacks: run `rules.mjs`, then the manual checklist in the stack file's "How to check". There is no browser check.
- Fix `error` findings before `warn`. A warn you keep needs a one-line reason.
- Repair loop: check, fix, re-check. At most 2 rounds. Then stop and report.
- Rule ids and their fixes are in `references/anti-slop.md`. It also lists judgment rules no script catches; review those yourself.

## Command contracts

**init**
1. Read the project, detect the stack, load its guide.
2. Existing tokens or DESIGN.md: see "Existing design systems win".
3. Otherwise ask the 3 questions, offer 3 clearly different directions, wait.
   Any stack: detect the content language (`lang`, i18n files, copy) and pick only `data/fonts.csv` rows whose `scripts` column covers it.
4. Write DESIGN.md. Lint: `npx --yes @google/design.md@0.4.0 lint DESIGN.md`. Fix errors.
5. Report the chosen direction, the files written, and the lint result.

**build**
1. Read DESIGN.md, the stack guide and the layout file.
2. Pick a structure. Say which and why in one line.
3. Build the first section fully. Then the rest.
4. Run the checks. Fix in at most 2 rounds.
5. Report.

**audit**
1. Detect the stack and load its guide.
2. Run the checks. Review the judgment rules. Pass `--out "$(mktemp -d)"` to `check.mjs` and to `check-mobile.mjs` too, so audit writes nothing in the project.
3. Output a table. Edit nothing.

| Before | After | Why |
| --- | --- | --- |
| what is there now | what it should be | the rule id or reason |

**polish**
1. Detect the stack and load its guide.
2. Run an audit first.
3. Fix the top issues, errors first. Do not change logic, routes or copy meaning.
4. Re-run the checks. At most 2 rounds. Report.

**motion**
1. Load `references/motion.md` (mobile stacks: `references/mobile-motion.md`). Answer its 4 questions in writing for each animation: needed, what it communicates, which easing, how long.
2. Drop any animation without a clear answer. Add `prefers-reduced-motion` handling (the stack guide names the native equivalent).
3. Output a Before / After / Why table. Apply the change only when the user asked to add or fix motion, not to review it.

## Report

End every run with:
- What changed (files).
- Findings that remain, each with rule id and reason.
- Screenshot and tile paths in `.uix/shots` (web), shot paths in `.uix/mobile-shots` (mobile) or the manual checks done (other native).
- Image credits added.
