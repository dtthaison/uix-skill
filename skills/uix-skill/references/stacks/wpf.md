---
stack: wpf
kind: native
check: code
---

# WPF

## Setup tokens from DESIGN.md

| DESIGN.md | WPF |
| --- | --- |
| `colors.*` | `Color` and `SolidColorBrush` resources in `Themes/Light.xaml` and `Themes/Dark.xaml` |
| `typography.*` | `FontFamily`, `sys:Double` size resources and implicit `TextBlock` styles |
| `rounded.*` | `CornerRadius` resources |
| `spacing.*` | `Thickness` and `sys:Double` resources |

```xml
<!-- Themes/Light.xaml (Dark.xaml has the same keys, other values) -->
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <SolidColorBrush x:Key="BrandBrush" Color="#0E7C86"/>
  <SolidColorBrush x:Key="SurfaceBrush" Color="#EFF8F7"/>
  <SolidColorBrush x:Key="InkBrush" Color="#0B3434"/>
  <FontFamily x:Key="DisplayFont">pack://application:,,,/Fonts/#DM Serif Display</FontFamily>
</ResourceDictionary>
```

Merge `Themes/Light.xaml` in `App.xaml` and use `{DynamicResource BrandBrush}` everywhere (never `StaticResource` for themed values). To switch theme, replace the merged dictionary at runtime. Read the Windows theme from the registry key `AppsUseLightTheme` if you follow the system.

## Components

- Define implicit and keyed `Style`s with `ControlTemplate`s in resource dictionaries; reuse them, do not restyle each control inline.
- MVVM: bind to a view model (`INotifyPropertyChanged`, `ICommand`). Use `ItemsControl`/`ListView` with `DataTemplate`; virtualize long lists.
- Triggers (`IsMouseOver`, `IsPressed`, `IsEnabled`, `IsKeyboardFocused`) provide the states; add loading, empty and error views too.
- Icons: Segoe Fluent Icons font or an SVG set; never emoji.

## Motion

Use a `Storyboard` with `DoubleAnimation Duration="0:0:0.2"` and `EasingFunction="{StaticResource EaseOut}"` (a `CubicEase EasingMode="EaseOut"` resource), animating `Opacity` and `RenderTransform` only. Check `SystemParameters.ClientAreaAnimation` (false when the user turned animations off) and skip or shorten animations when it is false.

## Accessibility

- `AutomationProperties.Name` on icon-only and custom controls; `AutomationProperties.LabeledBy` for inputs.
- Keep the keyboard focus visual (`FocusVisualStyle`); do not set it to `{x:Null}` without a replacement.
- Targets at least 44 by 44 DIP for touch; `TabIndex` follows reading order.
- WPF scales with display DPI but does not follow the Windows "Text size" setting; offer an app text-size option and avoid fixed heights.
- Support High Contrast with `SystemColors` brushes where it matters.

## Gotchas

- `StaticResource` captures the value once and ignores theme swaps.
- Heavy work on the UI thread freezes the window; use `async`/`await` and `Dispatcher`.
- Binding errors only show in the Output window; watch it.
- Fonts are referenced with `pack://application:,,,/Fonts/#Family Name`.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md <project dir>
```

`rules.mjs` checks `.xaml` and `.cs` files. `Colors.Black`, `"#000000"`/`"#FF000000"`, `FontFamily="Arial"`-style attributes, emoji inside quoted strings and `FontSize="n"` below 12 are caught; a bare `Foreground="Black"` is not. Those rules are `pure-black`, `banned-font`, `emoji-icon` and `tiny-text` (size below 12), all warnings. Read the output and fix each finding; stop after at most 2 repair rounds. There is no browser check for native UI, so verify by hand:

1. Screenshot a small and a large window or device size. Resize the window narrow and wide, and capture with Win+Shift+S.
2. Screenshot once in dark mode.
3. Screenshot once at the largest text size (WPF ignores the Windows text-size setting, so test 200% display scale and your own text-size option).

Look for: clipped or truncated text, overlapping controls, targets under the platform minimum, low-contrast text in either theme, missing focus or pressed states, and any layout that only works at one size.
