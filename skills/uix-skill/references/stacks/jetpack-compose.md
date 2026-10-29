---
stack: jetpack-compose
kind: native
check: code
---

# Jetpack Compose (Material 3)

## Setup tokens from DESIGN.md

| DESIGN.md | Compose |
| --- | --- |
| `colors.*` | `lightColorScheme(...)` and `darkColorScheme(...)` (`primary`, `onPrimary`, `surface`, `onSurface`, ...) |
| `typography.*` | `Typography(displayLarge = TextStyle(...), bodyLarge = ...)` |
| `rounded.*` | `Shapes(small = RoundedCornerShape(...), ...)` |
| `spacing.*` | `object Space { val md = 16.dp }` |

```kotlin
private val Light = lightColorScheme(primary = Color(0xFF0E7C86), onPrimary = Color(0xFFFFFFFF),
    surface = Color(0xFFEFF8F7), onSurface = Color(0xFF0B3434))
private val Dark = darkColorScheme(primary = Color(0xFF5CC3CC), onPrimary = Color(0xFF00363A),
    surface = Color(0xFF0E1F1F), onSurface = Color(0xFFD7EAEA))
private val Display = FontFamily(Font(R.font.dm_serif_display))
private val AppType = Typography(displayLarge = TextStyle(fontFamily = Display, fontSize = 57.sp, lineHeight = 64.sp))

@Composable fun AppTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = AppType, content = content)
```

Do not call `dynamicLightColorScheme` (Material You wallpaper colors); the brand comes from DESIGN.md. Put fonts in `res/font` in lowercase snake_case.

## Components

- Use Material 3 components (`Button`, `Card`, `NavigationBar`, `TextField`) and read colors from `MaterialTheme.colorScheme`, type from `MaterialTheme.typography`, never literal colors in screens.
- Hoist state: stateless composables take `value` and `onChange`. Use `remember`/`rememberSaveable` and `collectAsStateWithLifecycle()`.
- Lists use `LazyColumn` with `key = { it.id }`.
- Icons: Material Symbols/`Icons.Outlined`; never emoji.
- Provide pressed, disabled, loading, empty and error states.

## Motion

Rows of `data/mobile-motion.csv` are interactions; read the `compose` column for the API and spring, `motion` for the numbers, `haptic` for `HapticFeedbackType` and `reduced_motion` for the fallback. Pick the tier (calm or lively) from DESIGN.md first. Start from alpha 0 and scale 0.95 or more, never 0.

```kotlin
// Compose has no reduced-motion flag; 0f means animations are off ("Remove animations")
val scale = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
val spec = if (scale == 0f) snap<Float>() else spring(dampingRatio = 0.9f, stiffness = 1400f)
```


## Accessibility

- Targets at least 48 dp. `Modifier.minimumInteractiveComponentSize()` enforces it on custom clickables.
- `contentDescription` on every informative `Icon`/`Image`; `null` on decorative ones. Merge rows with `Modifier.semantics(mergeDescendants = true) {}`.
- Use `sp` for text so it follows the font scale; avoid fixed heights on text containers.
- Use `Modifier.clickable(role = Role.Button)` for custom clickable elements.

## Gotchas

- `Color.Black` and `Color(0xFF000000)` are flagged; use a tinted near-black.
- Unstable lambdas or lists passed down cause extra recomposition; keep state in a ViewModel.
- Do not read `isSystemInDarkTheme()` in deep leaves; pass through the theme.
- Edge-to-edge: apply `WindowInsets` padding (`Scaffold` content padding).

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md app/src
```

`rules.mjs` checks `.kt` files (`compose-linear` beside `pure-black`, `emoji-icon` and `tiny-text`). `banned-font` only fires on a `fontFamily = "Name"` string, so confirm a `FontFamily(Font(R.font...))` family by reading the theme. Read the output and fix each finding; at most 2 repair rounds. There is no automated Android check this round. Verify on an emulator you created (`adb devices` for its `<serial>`):

```
adb -s <serial> shell cmd uimode night no;  adb -s <serial> exec-out screencap -p > light.png
adb -s <serial> shell cmd uimode night yes; adb -s <serial> exec-out screencap -p > dark.png
adb -s <serial> shell settings put system font_scale 2.0
adb -s <serial> exec-out screencap -p > xxxl.png
```

Shoot every changed screen in the three modes: light, dark and `xxxl` (font scale 2.0). Without an emulator, report `unverified: <reason>`.

Look for: clipped or truncated text, overlapping controls, targets under the platform minimum, low-contrast text in either theme, missing pressed states, and any layout that only works at one size.
