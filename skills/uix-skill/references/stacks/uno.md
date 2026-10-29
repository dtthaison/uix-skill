---
stack: uno
kind: native
check: code
---

# Uno Platform

## Setup tokens from DESIGN.md

| DESIGN.md | Uno Platform |
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

Reference values with `{ThemeResource BrandBrush}` so they follow light and dark. To retint built-in controls, override the control's own keys (for example `ButtonBackground`, `ButtonForeground`) or `SystemAccentColor` in the same dictionaries. Uno runs on Windows, iOS, Android, WebAssembly and desktop from one XAML project, so define the dictionaries once in the shared project.

## Components

- Write WinUI-style XAML (`Microsoft.UI.Xaml`) in the shared project; use `x:Bind`, `ICommand` and the Uno.Extensions or MVUX patterns the project already uses.
- Use platform-neutral controls and test each target; use `#if __IOS__` / `#if __ANDROID__` only for real platform differences.
- Handle safe areas with Uno Toolkit's `SafeArea`, and navigation with the project's existing navigation approach.
- Icons: `FontIcon`/`SymbolIcon` or an SVG set; never emoji.
- Material or Cupertino styles from Uno Themes are optional; if used, override their palette with DESIGN.md colors rather than leaving the stock palette.

## Motion

Use `Storyboard`/`DoubleAnimation Duration="0:0:0.2"` with `CubicEase EasingMode="EaseOut"` on opacity and transform. For reduced motion, `new Windows.UI.ViewManagement.UISettings().AnimationsEnabled` returns real values on Windows and Android (Android reads the animator scale). On iOS it is not implemented, so read `UIAccessibility.IsReduceMotionEnabled` inside `#if __IOS__`. On Skia targets it is always `true` and gives no signal, so offer an in-app "Reduce motion" setting. Skip or shorten animations when reduced motion is on.

## Accessibility

- `AutomationProperties.Name` on icon-only controls and `AutomationProperties.LabeledBy` on inputs.
- Targets at least 44 by 44 (epx/pt) and 48 dp on Android; use the larger.
- Text should follow the OS text size on every target; avoid fixed heights and test the largest setting.
- Check contrast in both theme dictionaries.

## Gotchas

- `StaticResource` ignores theme switches; use `ThemeResource`.
- Fonts need per-platform packaging; verify the custom font actually renders on each target, not only on Windows.
- XAML that works on Windows may render differently on Skia/WASM; check each target you ship.
- Do not touch UI from a background thread; use the dispatcher.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md <project dir>
```

`rules.mjs` checks `.xaml` and `.cs` files. `Colors.Black`, `"#000000"`/`"#FF000000"`, `FontFamily="Arial"`-style attributes, emoji inside quoted strings and `FontSize="n"` below 12 are caught; a bare `Foreground="Black"` is not. Those rules are `pure-black`, `banned-font`, `emoji-icon` and `tiny-text` (size below 12), all warnings. Read the output and fix each finding; stop after at most 2 repair rounds. There is no browser check for native UI, so verify by hand:

1. Screenshot a small and a large window or device size. Run on at least two targets (for example Windows and an Android emulator) and capture each.
2. Screenshot once in dark mode.
3. Screenshot once at the largest text size (set the OS text size to its maximum on each target you test).

Look for: clipped or truncated text, overlapping controls, targets under the platform minimum, low-contrast text in either theme, missing focus or pressed states, and any layout that only works at one size.
