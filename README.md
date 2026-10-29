# uix-skill

A design skill for coding agents such as Claude Code and Codex. It picks a visual direction with you and saves it as a `DESIGN.md`. Then it builds the UI from that file and checks the result with scripts, so the output doesn't look like generic AI UI.

It works for web pages and for mobile and desktop apps: 22 stacks in all. It uses free tools only. No paid APIs and no keys.

**Status:** early. The skill was used on one real shop: a website, an Expo app tested on iPhone and Android, and a small SwiftUI app. Each run's misses were fixed. Please open an issue for anything it gets wrong; feedback is the reason this repo is public.

## What it does

| Command | Job |
| --- | --- |
| `/uix init` | Reads the project, asks 3 questions, offers 3 art directions and writes a `DESIGN.md` (colours, fonts, spacing, motion), then checks it. |
| `/uix build` | Builds a page, screen or component from `DESIGN.md`, checks it and fixes what the checks find. This is the default. |
| `/uix audit` | Runs the checks and reports. Edits nothing. |
| `/uix polish` | Fixes the top audit issues. Keeps logic, routes and the meaning of the copy. |
| `/uix motion` | Reviews or adds animation. |

You can also just ask: "make the settings page", "audit this screen", "make this look better".

## Stacks

- **Web:** React, Next.js, Vue, Nuxt, Nuxt UI, Svelte, Angular, Astro, Laravel, shadcn/ui, Three.js, HTML + Tailwind.
- **Native:** SwiftUI, Jetpack Compose, Flutter, React Native, WPF, WinUI, UWP, Uno, Avalonia, JavaFX.

## The checks

The skill runs these scripts itself. You can run them by hand too, from your project folder, with `node <skill folder>/scripts/<name>.mjs`.

| Script | What it checks | Needs |
| --- | --- | --- |
| `rules.mjs [--design DESIGN.md] <path...>` | Reads the code for common "AI look" mistakes and accessibility slips: overused fonts (allowed when `DESIGN.md` picks them), AI-style gradients, emoji used as icons, tiny text, pure black, linear or bouncy motion, missing reduced-motion handling, and slips specific to each stack. Prints JSON. | Node 22 |
| `check.mjs <url\|file>` | Opens the page in Chrome at 375, 768 and 1280 px wide and takes screenshots. Flags sideways scrolling, low contrast, small touch targets, heavy images and console errors. | Node 22, Chrome |
| `check-mobile.mjs --app exp://host:port` | Opens each screen of an Expo app on test phones it creates and then deletes, in light, dark and the largest text size. Takes screenshots, flags small touch targets, missing labels and error screens, and runs your Maestro flows. `--platform android` uses Android emulators. `--native <bundle id> --app-path <App.app>` checks a native iOS app such as SwiftUI. | Node 22, [Maestro](https://maestro.mobile.dev); Xcode for iPhone, Android SDK for Android |
| `images.mjs "<query>"` | Finds open-licence photos on Openverse and Wikimedia, with credit lines. | Node 22 |

`check-mobile.mjs` only touches phones and emulators it made itself, and removes them when it finishes. Details: [`references/mobile-testing.md`](skills/uix-skill/references/mobile-testing.md).

## Install

```
git clone https://github.com/dtthaison/uix-skill.git
cd uix-skill
bin/link-local.sh              # links the skill into ~/.claude/skills/uix-skill
bin/link-local.sh --codex      # or into ~/.codex/skills/uix-skill
```

The link points at your clone, so `git pull` updates the skill. `bin/link-local.sh --uninstall` removes the links. The script never overwrites a real folder or someone else's link.

Then, in your project, run `/uix-skill init` or say "uix init".

## Layout

```
bin/link-local.sh          # link the skill into Claude Code or Codex
skills/uix-skill/
├─ SKILL.md                # the entry point the agent reads first
├─ references/             # loaded only when a task needs them: directions,
│  │                       # layouts, motion, accessibility, mobile, anti-slop
│  └─ stacks/              # one guide per stack (22)
├─ data/                   # fonts, palettes, styles, mobile tokens, examples
└─ scripts/                # rules, check, check-mobile, images
tests/                     # npm test (Node 22)
```

## Contributing

Bug reports with a screenshot and the stack you used help most. Run `npm test` before sending a change.

## Credits

The skill's ideas come from reading other design skills and specs: impeccable, hallmark, taste-skill, ui-ux-pro-max, Emil Kowalski's skills, the DESIGN.md spec and gsap-skills. Those were for learning only. The directions, palettes, font pairs, rules and scripts here are written from scratch.

## License

MIT. See [LICENSE](LICENSE).
