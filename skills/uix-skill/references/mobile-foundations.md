# Mobile foundations

Read this before you build or audit any phone screen. Numbers live in `data/mobile-tokens.csv`; cite the row id when you use one. Style choices live in `data/mobile-styles.csv`. If a value is not in the token file, read it from the platform at runtime instead of hard-coding it.

## Platform differences

Follow the platform you ship on. A cross-platform app keeps one brand and lets the native parts differ.

| Topic | iOS | Android (Material 3) |
| --- | --- | --- |
| Primary navigation | Bottom tab bar, large title on root screens | Navigation bar, top app bar (small, medium or large) |
| Back | Edge swipe plus a back button | System back gesture, handled by the app |
| Unit | pt | dp for size, sp for text |
| Text scaling | Dynamic Type | Font scale setting |
| Sheets | Detents (medium, large) | Modal bottom sheet with a drag handle |
| Main action | Bar button or in-content button | FAB or extended FAB |
| Press feedback | Scale or dim | Ripple |
| Motion | Spring, interruptible | M3 spring tokens |

- Do not draw an iOS tab bar on Android or a FAB on iOS. Use native components first, custom ones only for brand moments.
- Safe-area, density and type rules below apply to every style. Style rows only change tone.
- Pick a style row in `mobile-styles.csv` before you design. Its `platform` column says where it fits.

## Layout and touch

- Compact Android windows use a 16dp side margin (mt-android-margin-compact). Keep the same margin on iOS for one rhythm.
- There is no column grid for phones here: the skill gives a margin of 16 and a gap of 8, and screens stack full-width blocks.
- Keep a gap of 8dp between touch targets (mt-android-target-gap).
- Touch targets: 44pt on iOS (mt-ios-control-default, mt-ios-button-hit-region), 48dp on Android (mt-android-touch-target). Pad a small icon out to the full target size.
- iOS allows 28pt only when 44 truly will not fit (mt-ios-control-minimum). Treat it as a last resort.
- Space around controls on iOS: 12pt if they draw a bezel (mt-ios-padding-bezel), 24pt if they are bare (mt-ios-padding-no-bezel).
- Android bars: classic navigation bar 80dp (mt-android-navigation-bar-height), expressive 64dp (mt-android-navigation-bar-expressive), small top app bar 64dp (mt-android-top-bar-small).
- Put the primary action in the lower half of the screen. See `mp-thumb-zone` in `data/mobile-patterns.csv`.
- Radius on Android follows the M3 scale: 4, 8, 12, 16, 28, 48dp (mt-android-radius-xs to mt-android-radius-xxl). iOS has no radius token here; use the continuous corner the system gives and nest radii (inner = outer minus padding).

## Type

- iOS sizes at the default Dynamic Type setting: Large Title 34pt (mt-ios-type-large-title), Title 1 28pt, Title 2 22pt, Title 3 20pt, Headline and Body 17pt (mt-ios-type-body), Callout 16pt, Subhead 15pt, Footnote 13pt, Caption 12pt and 11pt. All are rows `mt-ios-type-*`.
- Nothing on iOS goes under 11pt (mt-ios-text-minimum).
- Android uses the M3 roles. Body Large is 16sp (mt-android-type-body-large), Body Medium 14sp, Title Large 22sp, Headline Large 32sp, Display Large 57sp. All are rows `mt-android-type-*`.
- Display and headline text sets `maxFontSizeMultiplier` to 1.3 to 1.5 so a large title does not fill the screen at the largest sizes. Body text stays uncapped. In SwiftUI the cap is `.dynamicTypeSize(...DynamicTypeSize.accessibility2)` (see `references/stacks/swiftui.md`).
- Use the role names in code (text styles, `Typography`), not raw sizes. Then scaling works for free.
- Test at the largest accessibility size. Let text wrap and grow the container; never clip or truncate a price or a label that carries meaning.
- On every screen with a primary control in a row (a quantity stepper, a remove button), check the largest text size: the control must stay on screen. See `xxxl-hides-primary-control`.
- Prices, totals and quantities use tabular figures so digits line up: `fontVariant: ['tabular-nums']` in React Native, `FontFeature.tabularFigures()` in Flutter, `.monospacedDigit()` in SwiftUI, `fontFeatureSettings = "tnum"` in Compose.
- Pick fonts with `scripts` containing `vietnamese` in `data/fonts.csv` for Vietnamese UI.

## Safe areas and keyboard

- Draw backgrounds edge to edge. Keep text, buttons and bars inside the safe area.
- Never hard-code insets. Read them from the system: `useSafeAreaInsets`, `SafeArea`, `safeAreaInset`, `WindowInsets`.
- Reference values for sizing mockups only: iPhone 17 top inset 62pt, bottom 34pt, status bar 54pt (mt-ios-safe-top, mt-ios-safe-bottom, mt-ios-status-bar-height). These are third-party measurements for iPhone 17 only; other devices differ. In landscape the sides are 62pt (mt-ios-safe-landscape-side).
- Android defaults are 24dp status bar and 48dp three-button bar (mt-android-status-bar-height, mt-android-navigation-bar-inset). Cutouts and gesture navigation override them.
- Sticky bars sit above the home indicator. A sticky buy bar adds the bottom inset to its own padding.
- When the keyboard opens, the focused field and its submit button stay visible. See `mp-forms` and `mo-keyboard-avoid`.

## Dark mode

- Build dark as its own palette, not an inverted light one. Pull each color from a semantic role (surface, on-surface, accent), never from a literal.
- Raise surfaces by lightness: higher layers are lighter. Do not use black shadows for depth on dark.
- Pure white text on pure black glares. Use an off-white on a near-black.
- Desaturate and lighten the accent for dark, then re-check contrast for text, icons and borders.
- Images and illustrations may need a dark variant. Do not leave a white-background PNG on a dark card.
- Test both modes on a device before you call a screen done. Dark bugs hide in empty states, dividers and shadows.
- Follow the system setting by default. If you add an in-app switch, offer Light, Dark and System. See `mp-dark-mode`.

## Liquid Glass

Liquid Glass is for navigation and controls only: tab bars, toolbars, sheets' chrome, floating buttons. It is the layer that floats above content.

- Never put it on content: cards, list rows, product tiles and body text stay opaque.
- Never stack glass on glass. One glass layer per region.
- Check text over glass against the busiest content that can scroll behind it. If contrast fails, use a system material or a solid fill.
- Reduce Transparency and Increase Contrast must give a solid fallback.
- On Android there is no glass. Use M3 surface tones and elevation. Row `m-liquid-glass` in `mobile-styles.csv` lists the risks.

## Icons

- Use one icon set per app: SF Symbols on iOS, Material Symbols on Android, or one cross-platform set.
- One stroke weight and one fill style across all icons. Do not mix outlined and filled in the same bar except to show selected state.
- Icons that carry meaning get a text label or an accessibility label. A bare icon button still needs the full target size.
- Do not use emoji as icons.
- Size icons to their text: an icon beside body text matches its line height. Do not scale a glyph up to fill space.
- Tab bar icons are one metaphor each. If two tabs need the same icon, rename one tab.
