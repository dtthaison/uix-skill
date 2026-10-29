---
stack: swiftui
kind: native
check: code
---

# SwiftUI

## Setup tokens from DESIGN.md

| DESIGN.md | SwiftUI |
| --- | --- |
| `colors.*` | Asset Catalog color sets, with Any and Dark appearances |
| `typography.*` | `Font` extension using `Font.custom(_:size:relativeTo:)` |
| `rounded.*` | `static let` CGFloat constants used in `RoundedRectangle(cornerRadius:)` |
| `spacing.*` | `enum Space` constants |

Create `Assets.xcassets/Brand.colorset` (name it `Brand`, not `Primary`, which clashes with `Color.primary`) and set the light and dark values.

```swift
extension Color {
    static let brand = Color("Brand")
    static let surface = Color("Surface")
    static let ink = Color("Ink")
}
extension Font {
    static let display = Font.custom("DM Serif Display", size: 34, relativeTo: .largeTitle)
    static let body = Font.custom("DM Sans", size: 17, relativeTo: .body)
}
enum Space { static let sm: CGFloat = 8, md: CGFloat = 16, lg: CGFloat = 32 }
```

Never use `Color.black`; add a tinted near-black color set.

If DESIGN.md came from another stack: px = pt, the icon set becomes SF Symbols, and springs come from the `swiftui` column of `data/mobile-motion.csv`.

Colors: tokens `foo` and `foo-dark` become one color set `Foo`, with the dark value under a `luminosity` appearance. Copy `data/examples/colorset-Contents.json` into `Foo.colorset/Contents.json` and change the components.

Fonts:
- Download the TTF from `https://github.com/google/fonts/raw/main/ofl/<family>/<file>`. `<family>` is the lowercase name with no spaces (`ofl/dmserifdisplay/`); some families live under `apache/` or `ufl/` instead of `ofl/`. Percent-encode `[`, `]` and `,` in variable-font file names (`%5B`, `%5D`, `%2C`).
- Put the file in the target and list it under `UIAppFonts` (iOS) or `ATSApplicationFontsPath` (macOS).
- Use the font's family name in `Font.custom` and set weight with `.weight(.medium)`. A variable font (Fraunces ships only as one) works with `.weight`.
- A wrong name falls back to the system font with no error. Check a shot, or print `UIFont.familyNames` once.

### New project from the command line

No Xcode GUI is needed.
1. `brew install xcodegen`.
2. Copy `data/examples/swiftui-project.yml` to `project.yml` and replace the `<placeholders>`. With no custom font, drop `fonts` from `sources` and the `info:` block (`UIAppFonts`).
3. Create the folders the spec lists: `mkdir -p Sources Resources/Assets.xcassets/AppIcon.appiconset fonts`. Copy `data/examples/AppIcon-Contents.json` to `Resources/Assets.xcassets/AppIcon.appiconset/Contents.json`, and make the 1024 px icon with `sips -z 1024 1024 <any.png> --out Resources/Assets.xcassets/AppIcon.appiconset/icon.png`. Without an icon the build fails with "app icon set named AppIcon".
4. Run `xcodegen generate`.
5. Build, with `<udid>` from `xcrun simctl list devices` (a simulator you created):

```
xcodebuild -project <Name>.xcodeproj -scheme <Name> -destination 'id=<udid>' -derivedDataPath build build
```

The app is `build/Build/Products/Debug-iphonesimulator/<Name>.app`. Add `build/` to `.gitignore`.

## Components

- Compose small `View` structs; pass data in, call closures out. Use `@State` for local state, `@Binding` for child edits, `@Observable` models for shared state.
- Use system controls (`Button`, `Toggle`, `NavigationStack`, `List`) and style them with `ButtonStyle`/`LabelStyle`; avoid rebuilding them with gestures.
- Use SF Symbols (`Image(systemName:)`) for icons, never emoji.
- System materials (`.regularMaterial`) are fine for bars and sheets as platform defaults; do not add blur or glow as decoration.
- Provide pressed, disabled, loading (`ProgressView`), empty (`ContentUnavailableView`) and error states.
- A sticky buy bar goes in `.safeAreaInset(edge: .bottom) { ... }`.
- Hide the tab bar on a pushed detail screen with `.toolbarVisibility(.hidden, for: .tabBar)`.
- On iOS 26 the tab bar floats over content. Give the last row bottom padding so it is not covered.
- `.navigationTitle` always uses the system font. For a brand title use `ToolbarItem(placement: .principal)` with your `Font`.
- Use `Tab("Title", systemImage: "house", value: x) { ... }` (iOS 18+) in a `TabView(selection:)`, not `.tabItem`. System bars get Liquid Glass by building with the iOS 26 SDK; the deployment target matters only if you call `.glassEffect` (iOS 26.0) without `#available`. Do not name your own enum `Tab`.
- A system `TabView` `.badge` cannot be animated. For `mo-badge-bump` draw your own badge.
- `Image(...).resizable().scaledToFill()` reports the image size to its parent and makes the card wider than the screen. Give it a fixed `.frame` and `.clipped()` (rule `swiftui-fill-no-clip`).


## Motion

Rows of `data/mobile-motion.csv` are interactions; read the `swiftui` column for the modifier and spring, `motion` for the numbers, `haptic` for `.sensoryFeedback` and `reduced_motion` for the fallback. Pick the tier (calm or lively) from DESIGN.md first. Prefer value-scoped `.animation(_, value:)`; the valueless form is deprecated.

```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion
.animation(reduceMotion ? nil : .spring(response: 0.17, dampingFraction: 0.9), value: isPressed)
```

One reusable press style, used as `.buttonStyle(PressStyle())`:

```swift
struct PressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .opacity(configuration.isPressed && reduceMotion ? 0.85 : 1)
            .animation(.spring(response: 0.17, dampingFraction: 0.9), value: configuration.isPressed)
    }
}
```

- Haptics: `.sensoryFeedback(.selection, trigger: count)` fires when `trigger` changes, so bump a counter on the event. The simulator has no haptics (see `mobile-testing.md`); report them `unverified`.
- Zoom transition (`mo-shared-zoom`): `@Namespace var ns`, then `.matchedTransitionSource(id: item.id, in: ns)` on the source and `.navigationTransition(.zoom(sourceID: item.id, in: ns))` on the pushed view.

## Accessibility

- Dynamic Type: use semantic text styles or `relativeTo:`; scale spacing with `@ScaledMetric`. Never fix a text container's height.
- Cap display text and primary controls only, with `.dynamicTypeSize(...DynamicTypeSize.accessibility2)`.
- Targets at least 44 by 44 pt (`.frame(minWidth: 44, minHeight: 44)` and `.contentShape(Rectangle())`).
- Icon-only controls need `.accessibilityLabel("...")`. Hide decoration with `.accessibilityHidden(true)`.
- Do not carry meaning by color alone; check contrast in both appearances (4.5:1 text).

## Gotchas

- Colors typed as literals (`Color(red:...)`) skip dark mode; use asset colors.
- `.animation` without `value:` is deprecated and animates unintended changes (rule `swiftui-animation-no-value`).
- Heavy work in `body` re-runs on every update; move it to the model.
- `List` and `ScrollView` rows need stable `id`s.

## How to check

1. Static: `node <skill>/scripts/rules.mjs --design DESIGN.md Sources`. It checks `.swift` files with `swiftui-*` rules beside `pure-black`, `banned-font`, `emoji-icon` and `tiny-text`. It also lints the DESIGN.md token pairs, which covers contrast. Rules are few, so a clean run proves little.
2. Launch hook: copy `data/examples/LaunchScreens.swift`. It reads `-screen <name>` and `-seed` from `ProcessInfo.processInfo.arguments` in `.onAppear` and sets the tab and path.
3. Routes file `.uix/mobile-routes.json`, one entry per screen. `sameAs` names a route that looks the same on purpose.

```json
[{"name":"home","args":["-screen","home"]},{"name":"bag","args":["-screen","bag","-seed"]}]
```

4. Build (see "New project from the command line"), then:

```
node <skill>/scripts/check-mobile.mjs --native <bundle id> --app-path build/Build/Products/Debug-iphonesimulator/<Name>.app [--only home,bag] [--devices "iPhone 17"] [--flow flow.yaml]
```

It creates its own simulators, shoots every route in light, dark and `xxxl`, and prints JSON `{shots, findings, notes}`. Exit 0 is clean, 1 has error findings, 2 is an environment problem. In an audit add `--out "$(mktemp -d)"` so the project stays unchanged. A "same screen as" finding means the app ignored the launch arguments; fix the hook. Maestro flows use `appId: <bundle id>`.

Without maestro or check-mobile, shoot by hand on a simulator you created. Terminate before each launch, wait 4 s for lists to settle, and reset afterwards:

```
xcrun simctl boot <udid>
xcrun simctl install <udid> <path to the built .app>
xcrun simctl terminate <udid> <bundle id>; xcrun simctl launch <udid> <bundle id> -screen bag -seed
xcrun simctl ui <udid> appearance light;  xcrun simctl io <udid> screenshot light.png
xcrun simctl ui <udid> appearance dark;   xcrun simctl io <udid> screenshot dark.png
xcrun simctl ui <udid> content_size accessibility-extra-extra-extra-large
xcrun simctl io <udid> screenshot xxxl.png
xcrun simctl ui <udid> content_size large;  xcrun simctl ui <udid> appearance light
```

Use `xcrun simctl io <udid> recordVideo out.mov` to see motion. Without a simulator, report `unverified: <reason>`.

Repair rounds (at most 2) are driven by reading the shots against the lists below, because the rules rarely fire. Shoot every changed screen in light, dark and `xxxl`.

Look for: clipped or truncated text, overlapping controls, targets under 44 pt, low-contrast text in either theme, missing pressed states, and any layout that only works at one size.

SwiftUI judgment list:
- a card wider than the screen;
- content under the floating tab bar;
- a swipe-only action with no button or menu;
- a nav title in the system font;
- a primary control or price pushed off screen at `xxxl`.
