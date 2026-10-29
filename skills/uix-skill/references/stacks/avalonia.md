---
stack: avalonia
kind: native
check: code
---

# Avalonia

## Setup tokens from DESIGN.md

| DESIGN.md | Avalonia |
| --- | --- |
| `colors.*` | `Color`/`SolidColorBrush` in `ResourceDictionary.ThemeDictionaries` keys `Light` and `Dark` |
| `typography.*` | `FontFamily` and `x:Double` resources, plus `<Style Selector="TextBlock.display">` |
| `rounded.*` | `CornerRadius` resources |
| `spacing.*` | `Thickness` and `x:Double` resources |

```xml
<!-- App.axaml -->
<Application xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
             RequestedThemeVariant="Default">
  <Application.Styles><FluentTheme/><StyleInclude Source="/Styles/App.axaml"/></Application.Styles>
  <Application.Resources>
    <ResourceDictionary>
      <ResourceDictionary.ThemeDictionaries>
        <ResourceDictionary x:Key="Light"><SolidColorBrush x:Key="BrandBrush" Color="#0E7C86"/></ResourceDictionary>
        <ResourceDictionary x:Key="Dark"><SolidColorBrush x:Key="BrandBrush" Color="#5CC3CC"/></ResourceDictionary>
      </ResourceDictionary.ThemeDictionaries>
    </ResourceDictionary>
  </Application.Resources>
</Application>
```

Use `{DynamicResource BrandBrush}`. `RequestedThemeVariant="Default"` follows the system; set `Light` or `Dark` to force it. Embed the DESIGN.md font as an asset and reference it with `avares://<App>/Assets/Fonts#<Family>`; do not call `.WithInterFont()` unless DESIGN.md declares Inter.

## Components

- Style with CSS-like selectors: `<Style Selector="Button.primary:pointerover">`; apply with `Classes="primary"`. Put shared styles in `Styles/*.axaml`.
- MVVM with compiled bindings (`x:DataType` and `x:CompileBindings="True"`); `ItemsControl`/`ListBox` with `DataTemplate`.
- States come from pseudo-classes (`:pointerover`, `:pressed`, `:disabled`, `:focus`); add loading, empty and error views.
- Icons: an SVG icon set (for example `Projektanker.Icons.Avalonia`); never emoji.

## Motion

Use `<Transitions>`: `<DoubleTransition Property="Opacity" Duration="0:0:0.2" Easing="CubicEaseOut"/>`, or `Animation` keyframes, on opacity and render transforms. Avalonia has no built-in reduced-motion flag, so add an app setting (and default it from the OS where your platform layer exposes one), and set transition durations to `0` when it is on.

## Accessibility

- `AutomationProperties.Name` on icon-only controls; `AutomationProperties.LabeledBy` on inputs.
- Make custom controls focusable (`Focusable="True"`) and give `:focus` a visible outline.
- Targets at least 44 by 44 for touch (mobile and tablet targets); 24 minimum on desktop.
- No built-in system text-size setting; provide an app text-scale option and test with it at 200%.

## Gotchas

- `StaticResource` fixes the value once; use `DynamicResource` for themed values.
- Selectors are specific; a more specific control style can silently beat yours.
- UI changes must happen on the UI thread (`Dispatcher.UIThread.Post`).
- Platform fonts differ; bundle the font instead of relying on a system font.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md <project dir>
```

`rules.mjs` checks `.axaml` and `.cs` files. `Colors.Black`, `"#000000"`/`"#FF000000"`, `FontFamily="Arial"`-style attributes, emoji inside quoted strings and `FontSize="n"` below 12 are caught; a bare `Foreground="Black"` is not. Those rules are `pure-black`, `banned-font`, `emoji-icon` and `tiny-text` (size below 12), all warnings. Read the output and fix each finding; stop after at most 2 repair rounds. There is no browser check for native UI, so verify by hand:

1. Screenshot a small and a large window or device size. Resize the window narrow and wide, and capture with the OS screenshot tool.
2. Screenshot once in dark mode.
3. Screenshot once at the largest text size (use your app's text-scale option, and 200% display scaling).

Look for: clipped or truncated text, overlapping controls, targets under the platform minimum, low-contrast text in either theme, missing focus or pressed states, and any layout that only works at one size.
