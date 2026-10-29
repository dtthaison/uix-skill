---
stack: uwp
kind: native
check: code
---

# UWP

## Setup tokens from DESIGN.md

| DESIGN.md | UWP |
| --- | --- |
| `colors.*` | `Color`/`SolidColorBrush` entries in `ResourceDictionary.ThemeDictionaries` keys `Light` and `Dark` |
| `typography.*` | `FontFamily` and `x:Double` resources, plus implicit `TextBlock` styles |
| `rounded.*` | `CornerRadius` resources (override `ControlCornerRadius`, WinUI 2.6+) |
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

Reference values with `{ThemeResource BrandBrush}` so they follow light and dark. To retint built-in controls, override the control's own keys (for example `ButtonBackground`, `ButtonForeground`) or `SystemAccentColor` in the same dictionaries. Provide a `HighContrast` dictionary too, mapping brushes to `SystemColor*` resources.

## Components

- Use the built-in controls (`Button`, `NavigationView`, `ListView`, `TextBox`) and restyle with resource keys or `Style`s, not new templates unless required.
- MVVM with `x:Bind` (compiled, typed; set `Mode=OneWay` where it must update) and `ICommand`.
- Visual states (`VisualStateManager`) cover pointer-over, pressed, disabled and focus; add loading, empty and error views.
- Icons: `SymbolIcon`/`FontIcon` (Segoe Fluent Icons); never emoji.
- App-chrome backdrops such as Acrylic (`AcrylicBrush`) are platform defaults for navigation panes and flyouts; do not use them as decoration.

## Motion

Use a `Storyboard` with `DoubleAnimation Duration="0:0:0.2"` and `CubicEase EasingMode="EaseOut"` on `Opacity` or `CompositeTransform`, or the built-in `Transitions` (`EntranceThemeTransition`). Read `new Windows.UI.ViewManagement.UISettings().AnimationsEnabled`; when false, skip or shorten animations (it follows the system "Show animations" switch).

## Accessibility

- `AutomationProperties.Name` on icon-only controls; `AutomationProperties.LabeledBy` for inputs; `UseSystemFocusVisuals="True"` on custom controls.
- Targets at least 44 by 44 epx for touch.
- Text follows the system Text size setting; keep `IsTextScaleFactorEnabled` true and avoid fixed heights.
- Test High Contrast themes and Narrator.

## Gotchas

- `StaticResource` does not follow theme changes; use `ThemeResource` for themed values.
- `x:Bind` defaults to `OneTime`.
- Work off the UI thread, and update UI through `Dispatcher`/`DispatcherQueue`.
- UWP is in maintenance; prefer WinUI 3 for new apps.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md <project dir>
```

`rules.mjs` checks `.xaml` and `.cs` files. `Colors.Black`, `"#000000"`/`"#FF000000"`, `FontFamily="Arial"`-style attributes, emoji inside quoted strings and `FontSize="n"` below 12 are caught; a bare `Foreground="Black"` is not. Those rules are `pure-black`, `banned-font`, `emoji-icon` and `tiny-text` (size below 12), all warnings. Read the output and fix each finding; stop after at most 2 repair rounds. There is no browser check for native UI, so verify by hand:

1. Screenshot a small and a large window or device size. Resize the window narrow and wide, and capture with Win+Shift+S.
2. Screenshot once in dark mode.
3. Screenshot once at the largest text size (Settings > Accessibility > Text size, set to 225%).

Look for: clipped or truncated text, overlapping controls, targets under the platform minimum, low-contrast text in either theme, missing focus or pressed states, and any layout that only works at one size.
