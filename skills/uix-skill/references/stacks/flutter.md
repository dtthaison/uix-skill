---
stack: flutter
kind: native
check: code
---

# Flutter (Material 3)

## Setup tokens from DESIGN.md

| DESIGN.md | Flutter |
| --- | --- |
| `colors.*` | `ColorScheme.light(...)` / `ColorScheme.dark(...)` (`primary`, `onPrimary`, `surface`, `onSurface`) |
| `typography.*` | `TextTheme(displayLarge: TextStyle(...), bodyLarge: ...)` |
| `rounded.*` | component themes (`CardThemeData(shape: ...)`) or `const` radius values |
| `spacing.*` | `abstract final class Space { static const md = 16.0; }` |

```dart
final lightScheme = ColorScheme.light(primary: const Color(0xFF0E7C86), onPrimary: Colors.white,
    surface: const Color(0xFFEFF8F7), onSurface: const Color(0xFF0B3434));
final darkScheme = ColorScheme.dark(primary: const Color(0xFF5CC3CC), onPrimary: const Color(0xFF00363A),
    surface: const Color(0xFF0E1F1F), onSurface: const Color(0xFFD7EAEA));
const textTheme = TextTheme(
  displayLarge: TextStyle(fontFamily: 'DMSerifDisplay', fontSize: 57, height: 1.1),
  bodyLarge: TextStyle(fontFamily: 'DMSans', fontSize: 17, height: 1.6),
);

MaterialApp(
  theme: ThemeData(useMaterial3: true, colorScheme: lightScheme, textTheme: textTheme),
  darkTheme: ThemeData(useMaterial3: true, colorScheme: darkScheme, textTheme: textTheme),
  themeMode: ThemeMode.system,
);
```

Declare fonts in `pubspec.yaml` under `flutter: fonts:`. Read colors with `Theme.of(context).colorScheme`, never literals in widgets.

## Components

- Small `const` widgets; compose rather than deep-nest `build`. Use `StatelessWidget` unless there is local state; use one state approach (Riverpod, Bloc or `ValueNotifier`) project-wide.
- Material buttons (`FilledButton`, `OutlinedButton`, `TextButton`) with theme-level `ButtonStyle`; `ListView.builder` with keys for long lists.
- Icons: `Icons.*` (Material) or one icon package; never emoji.
- Provide pressed (ink), disabled, loading, empty and error states.

## Motion

Rows of `data/mobile-motion.csv` are interactions; read the `flutter` column for the widget and curve, `motion` for the spring or timing numbers, `haptic` for `HapticFeedback` calls and `reduced_motion` for the fallback. Pick the tier (calm or lively) from DESIGN.md first. Never start scale at 0.

```dart
final reduce = MediaQuery.disableAnimationsOf(context);
AnimatedScale(scale: pressed ? 0.96 : 1,
    duration: reduce ? Duration.zero : const Duration(milliseconds: 100), child: child);
```


## Accessibility

- Targets at least 48 by 48 logical px (`kMinInteractiveDimension`). `IconButton` needs `tooltip` (it doubles as the label).
- Wrap custom gestures in `Semantics(button: true, label: '...')`; hide decoration with `ExcludeSemantics`.
- Respect text scaling: no fixed heights on text, use `Flexible`/`Expanded`, test with `MediaQuery.textScalerOf(context)`.
- Check contrast in both schemes.

## Gotchas

- `Colors.black` is flagged; use a tinted near-black. `ColorScheme.background` is deprecated; use `surface`.
- `const` constructors prevent needless rebuilds; missing `const` is a performance warning.
- `setState` after `dispose` throws; check `mounted`.
- Overflow stripes mean a fixed width or height; use constraints.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md lib
```

`rules.mjs` checks `.dart` files and has `flutter-*` rules beside `pure-black`, `banned-font`, `emoji-icon` and `tiny-text`. Read the output and fix each finding; at most 2 repair rounds. There is no automated simulator check for Flutter this round. Verify on an iOS simulator you created (`xcrun simctl list devices` for its `<udid>`; never shoot a device you do not own):

```
xcrun simctl boot <udid>
flutter run -d <udid>        # in a second terminal or the background; keep it running
xcrun simctl ui <udid> appearance light;  xcrun simctl io <udid> screenshot light.png
xcrun simctl ui <udid> appearance dark;   xcrun simctl io <udid> screenshot dark.png
xcrun simctl ui <udid> content_size accessibility-extra-extra-extra-large
xcrun simctl io <udid> screenshot xxxl.png
```

Shoot every changed screen in the three modes: light, dark and `xxxl` (largest text). Without a simulator, report `unverified: <reason>`.

Look for: clipped or truncated text, overlapping controls, targets under the platform minimum, low-contrast text in either theme, missing pressed states, and any layout that only works at one size.
