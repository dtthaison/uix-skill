---
stack: winui
kind: native
check: code
---

# WinUI 3 (Windows App SDK)

## Setup tokens from DESIGN.md

| DESIGN.md | WinUI 3 (Windows App SDK) |
| --- | --- |
| `colors.*` | `Color`/`SolidColorBrush` entries in `ResourceDictionary.ThemeDictionaries` keys `Light` and `Dark` |
| `typography.*` | `FontFamily` and `x:Double` resources, plus implicit `TextBlock` styles |
| `rounded.*` | `CornerRadius` resources (override `ControlCornerRadius`) |
| `spacing.*` | `Thickness` and `x:Double` resources |

```xml
<!-- Styles/Theme.xaml, merged in App.xaml after the Fluent/Controls resources -->
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <ResourceDictionary.ThemeDictionaries>
    <ResourceDictionary x:Key="Light">
      <SolidColorBrush x:Key="BrandBrush" Color="#0E7C86"/>
      <SolidColorBrush x:Key="SurfaceBrush" Color="#EFF8F7"/>
    </ResourceDictionary>
    <ResourceDictionary x:Key="Dark">
      <SolidColorBrush x:Key="BrandBrush" Color="#5CC3CC"/>
      <SolidColorBrush x:Key="SurfaceBrush" Color="#0E1F1F"/>
    </ResourceDictionary>
  </ResourceDictionary.ThemeDictionaries>
</ResourceDictionary>
```

Reference values with `{ThemeResource BrandBrush}` so they follow light and dark. To retint built-in controls, override the control's own keys (for example `ButtonBackground`, `ButtonForeground`) or `SystemAccentColor` in the same dictionaries. Merge `<XamlControlsResources/>` first in `App.xaml` so your dictionary overrides the defaults.

## Components

- Use WinUI controls (`Button`, `NavigationView`, `TabView`, `InfoBar`, `NumberBox`) and restyle through resource keys (`ButtonBackground`, ...) or lightweight styling.
- `x:Bind` with `Mode=OneWay` for view-model state; `ICommand` or `RelayCommand` for actions.
- `VisualStateManager` covers pointer-over, pressed, disabled and focus; add loading (`ProgressRing`), empty and error views.
- Icons: `FontIcon`/`SymbolIcon` (Segoe Fluent Icons); never emoji.
- Mica (`<Window.SystemBackdrop><MicaBackdrop/></Window.SystemBackdrop>`) and Acrylic are platform defaults for window and flyout backdrops; do not add translucent layers as decoration.

## Motion

Use a `Storyboard` with `DoubleAnimation Duration="0:0:0.2"` and `CubicEase EasingMode="EaseOut"`, or implicit `Transitions` and Composition animations, on opacity and transform only. Read `new Windows.UI.ViewManagement.UISettings().AnimationsEnabled`; when false, skip or shorten animations.

## Accessibility

- `AutomationProperties.Name` on icon-only controls; `AutomationProperties.LabeledBy` on inputs; `UseSystemFocusVisuals="True"` on custom controls.
- Targets at least 44 by 44 epx; the default control heights already meet it, so do not shrink them.
- Text follows the system Text size setting; avoid fixed heights.
- Test High Contrast themes (add a `HighContrast` dictionary) and Narrator.

## Gotchas

- `Window` is not a `FrameworkElement`: it has no `RequestedTheme` or resources; set the theme on the root element.
- `StaticResource` ignores theme switches; use `ThemeResource`.
- Do not touch UI from a background thread; use `DispatcherQueue.TryEnqueue`.
- Unpackaged apps need the Windows App SDK bootstrapper.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md <project dir>
```

`rules.mjs` checks `.xaml` and `.cs` files. `Colors.Black`, `"#000000"`/`"#FF000000"`, `FontFamily="Arial"`-style attributes, emoji inside quoted strings and `FontSize="n"` below 12 are caught; a bare `Foreground="Black"` is not. Those rules are `pure-black`, `banned-font`, `emoji-icon` and `tiny-text` (size below 12), all warnings. Read the output and fix each finding; stop after at most 2 repair rounds. There is no browser check for native UI, so verify by hand:

1. Screenshot a small and a large window or device size. Resize the window narrow and wide, and capture with Win+Shift+S.
2. Screenshot once in dark mode.
3. Screenshot once at the largest text size (Settings > Accessibility > Text size, set to 225%).

Look for: clipped or truncated text, overlapping controls, targets under the platform minimum, low-contrast text in either theme, missing focus or pressed states, and any layout that only works at one size.
