---
stack: react-native
kind: native
check: code
---

# React Native

## Setup tokens from DESIGN.md

| DESIGN.md | React Native |
| --- | --- |
| `colors.*` | `light` and `dark` objects in a typed `Theme` |
| `typography.*` | text style objects (`fontFamily`, `fontSize`, `lineHeight`) |
| `rounded.*`, `spacing.*` | numeric constants |

```ts
// theme.ts
import { useColorScheme } from 'react-native';
export type Theme = { bg: string; text: string; primary: string; onPrimary: string };
const light: Theme = { bg: '#EFF8F7', text: '#0B3434', primary: '#0E7C86', onPrimary: '#FFFFFF' };
const dark: Theme = { bg: '#0E1F1F', text: '#D7EAEA', primary: '#5CC3CC', onPrimary: '#00363A' };
export const space = { sm: 8, md: 16, lg: 32 } as const;
export const type = { display: { fontFamily: 'DMSerifDisplay-Regular', fontSize: 34, lineHeight: 38 } } as const;
export function useTheme(): Theme { return useColorScheme() === 'dark' ? dark : light; }
```

Load fonts with `expo-font` or by linking the files; the `fontFamily` string is the font's PostScript name. Set `"userInterfaceStyle": "automatic"` in `app.json` (Expo) or `useColorScheme` returns light only.

### Install and project layout

- Check where routes live, `app/` or `src/app/`, before writing files. A template's AGENTS.md may say the other one; the folder that exists wins.
- Reanimated 4 needs `react-native-worklets` as a direct dependency: `npx expo install react-native-worklets`. A later install can prune it, and Metro then fails on `react-native-worklets/src/index.ts`.
- After installing icon or font packages, run `npx expo install --check` and restart Metro.
- On ERESOLVE (for example `lucide-react-native` pulling a `react-dom` peer), fall back to `npm install --legacy-peer-deps <pkg>@<version from node_modules/expo/bundledNativeModules.json>`, then run the check above.

## Components

- Function components; `StyleSheet.create` for static styles, theme values applied inline or via a `makeStyles(theme)` hook.
- Use `Pressable` (with pressed style) not `TouchableOpacity`; `FlatList` with `keyExtractor` for long lists.
- Icons from one library (`lucide-react-native`, vector icons); never emoji.
- Handle safe areas with `react-native-safe-area-context` and the keyboard with `KeyboardAvoidingView`.
- Provide pressed, disabled, loading, empty and error states.

## Motion

Rows of `data/mobile-motion.csv` are interactions; read the `rn` column for the Reanimated or `Animated` code, `motion` for the spring or timing numbers, `haptic` for the feedback and `reduced_motion` for the fallback. Pick the tier (calm or lively) from DESIGN.md first. Animate only `opacity` and `transform`; with core `Animated`, set `useNativeDriver: true`.

Reanimated `withSpring` damping at mass 1 (damping = ratio x 2 x sqrt(stiffness)):

| stiffness | ratio 0.9 | ratio 1.0 |
| --- | --- | --- |
| 1400 | 67.3 | 74.8 |
| 700 | 47.6 | 52.9 |
| 300 | 31.2 | 34.6 |

```ts
import { useReducedMotion } from 'react-native-reanimated';
// or: AccessibilityInfo.isReduceMotionEnabled() plus the 'reduceMotionChanged' event
const reduce = useReducedMotion();
const spring = reduce ? withTiming(1, { duration: 0 }) : withSpring(1, { mass: 1, stiffness: 1400, damping: 67.3 });
```

Reduce Motion is code review only: check-mobile cannot toggle it, so read the code for `useReducedMotion` or `AccessibilityInfo`.

### Gestures (RNGH 3.3)

Checked against `react-native-gesture-handler` 3.3.0 typings (`lib/typescript/v3`). There is no chained `Gesture` builder: use hooks and `GestureDetector`. Wrap the app in `GestureHandlerRootView`.

- `usePanGesture`, `usePinchGesture`, `useTapGesture` (`numberOfTaps: 2` for a double tap), `useSimultaneousGestures(a, b)` to run two at once (pinch and pan on an image).
- Config callbacks: `onBegin`, `onActivate`, `onUpdate`, `onDeactivate`, `onFinalize`. The event is flat: pan has `translationX`, `translationY`, `velocityX`, `velocityY`; pinch has `scale`, `focalX`, `focalY`. `onDeactivate` and `onFinalize` get `e.canceled` (there is no success flag).
- Callbacks run on the UI thread with Reanimated. Set `runOnJS: true` in the config, or call `runOnJS(fn)(...)` from `react-native-reanimated`, to touch React state.
- Swipe rows: `import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable'`. The root index does not export `Swipeable`. Props: `renderRightActions(progress, translation, methods)`, `onSwipeableOpen`; the ref has `close()`.

```tsx
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const y = useSharedValue(0);
  const pan = usePanGesture({
    onUpdate: (e) => { y.value = Math.max(0, e.translationY); },
    onDeactivate: (e) => {
      if (!e.canceled && (y.value > 120 || e.velocityY > 800)) runOnJS(onClose)();
      else y.value = withSpring(0, { mass: 1, stiffness: 700, damping: 47.6 });
    },
  });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <GestureDetector gesture={pan}><Animated.View style={style}>{children}</Animated.View></GestureDetector>;
}
```

## Accessibility

- Targets at least 44 pt; extend small ones with `hitSlop`.
- `accessibilityRole` (or `role`), `accessibilityLabel` and `accessibilityState` on every interactive element; `accessible={false}`/`importantForAccessibility` for decoration.
- Keep `allowFontScaling` on (default); cap with `maxFontSizeMultiplier` only on tight UI, and design for 200%. Display and headline text gets `maxFontSizeMultiplier` 1.3 to 1.5; body text stays uncapped.
- Check contrast in both schemes.

## Gotchas

- Android needs `elevation` where iOS uses `shadow*`; use `Platform.select`.
- Do not use `Dimensions.get` once at module load; use `useWindowDimensions`.
- Inline arrow functions in `FlatList` `renderItem` re-render rows; memoize.
- Text must be inside `<Text>`; strings in `<View>` crash.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md src      # pass the source dirs that exist: app, src or both
npx expo start --port <free port>      # keep running, in the background
node <skill>/scripts/check-mobile.mjs --app exp://127.0.0.1:<free port> [--routes .uix/mobile-routes.json] [--devices "A,B"] [--modes light,dark,xxxl] [--only <route,route>] [--out .uix/mobile-shots] [--flow <maestro.yaml>] [--video] [--keep]
```

Start Metro without `CI=1`: `CI=1` disables watching, so edits never reach the simulator. Use it only for a one-off check run, and restart Metro after edits if it was used.

Run `rules.mjs` first (it routes files importing `react-native` or `expo` to the native and `rn-*` rules, not the web rules), then `check-mobile.mjs`. Never start Metro with `expo start --ios` while other simulators are booted. The script creates and deletes its own simulators, shoots every route in each device and mode (default light, dark and `xxxl` text), and prints `{shots, findings, notes}`. Exit 0 is clean, 1 means error findings, 2 means the environment failed (never a clean result). A note starting `maestro missing:` means the run did not complete.

Time: roughly 50 to 60 s per shot under load, about 10 s idle, plus at least 8 s per non-root shot waiting for the root. The two devices run in parallel. Routes x devices x modes adds up (66 shots can take 25 minutes). Narrow the run: `--only home,bag` keeps those routes (an unknown name exits 2), `--devices "<one name>"` keeps one device, and `--routes <subset.json>` reads another routes file. In an audit pass `--out "$(mktemp -d)"` so the committed shots stay untouched. Progress prints to stderr.

`.uix/mobile-routes.json` lists the screens; paths may carry development-only query params that open a UI state:

```json
[{"name":"home","path":"/"},{"name":"bag","path":"/bag?sheet=open"}]
```

Expo Go's floating tools button appears in every shot; findings exclude it. Its gear covers the top-right corner, so keep key info (a count, a price) out of that corner or account for it when you read dev shots. To shoot a UI state, read `useLocalSearchParams()` behind `__DEV__` and act in an effect that depends on the param, because a link to a screen already on screen changes the param without remounting it: `const { sheet } = useLocalSearchParams(); useEffect(() => { if (__DEV__ && sheet === 'open') setOpen(true); }, [sheet]);`. Optional `"sameAs": "<route name>"` on a route marks a deliberate look-alike (two empty states); every other member names the first route; the first has no `sameAs`. Open the shots and look. If the simulator cannot run, report `unverified: <reason>`. Fix errors, then warnings; at most 2 repair rounds.

Hierarchy gap: a short one-line text link (a labelled leaf under 24 pt tall and at least 4 times wider than tall, no id) counts as text, so the script never flags it as a small target. Review those targets yourself. The hierarchy pass also skips nodes with a side under 8 pt or a long/short ratio over 20:1, and reports each (rule, bounds) once per route.

On Android, add `--platform android` (same flags; setup and limits are in `references/mobile-testing.md`). At font scale 2.0 look for tab labels truncating and buttons growing past the screen.

Reduce Motion is not checked here (see Motion).

If the project aliases `react-native` to `react-native-web` for a web build, files importing `react-native` get the native rules only; run `rules.mjs` on the web entry or directory separately, and `check.mjs` on the web URL.

Look for: clipped or truncated text, overlapping controls, targets under the platform minimum, low-contrast text in either theme, missing pressed states, and any layout that only works at one size.

### Deep links in Expo Go

When Expo Go is not already running, expo-router starts on Home (`/`) before the link arrives (`getLinkingURL()` is `null` then). A link sent to the running app navigates. check-mobile handles this: it opens the app root, waits, then sends the route link, so the app needs no code. Without it, every shot shows Home and check-mobile reports `route-not-navigated` (error, never a clean result).

`+native-intent.tsx` does not help here: on this cold start `redirectSystemPath` is not called. Expo Go does not own the app's own scheme (`<scheme>://` fails), so links use `exp://host:port/--/<path>`. To open links by hand (`xcrun simctl openurl` or the phone), use this dev-only fallback in the root layout, after fonts load:

```tsx
useEffect(() => {
  if (!__DEV__ || !fontsLoaded) return;
  Linking.getInitialURL().then((url) => {
    const path = url && /--\/(.+)$/.exec(url)?.[1];
    if (path) router.replace(('/' + path) as never);
  });
}, [fontsLoaded]);
```

(`Linking` is `expo-linking`, `router` is from `expo-router`.) Do not ship it: it is gated by `__DEV__`.

### Maestro

`--flow <file>` runs a Maestro flow on the hierarchy device after the app is reopened at its root. On failure the message names the failing step, and `<out>/flow-failed.png` is attached when Maestro's output names a debug folder. A runnable example is `data/examples/buy-flow.yaml`.

- `appId: host.exp.Exponent` (Expo Go).
- The first step is `openLink: exp://127.0.0.1:<port>/--/<path>`.
- A flow must not depend on leftover state: check-mobile shoots seeded routes before the flow runs. Reset first: make the first `openLink` a dev-only reset link (for example `/--/?reset=1`; the app reads `reset` behind `__DEV__` and empties the bag; the param arrives only when the app is already running, which check-mobile ensures by opening the root first, so a flow started by hand on a cold Expo Go loses it). Or match counts with a regex (`text: "Giỏ hàng.*"`).
- A `testID` prop is `id:` in Maestro.
- After a selection tap, assert `selected: true` on that id.
- `tapOn` hits the element centre. Scroll the target clear of sticky bars first (`scrollUntilVisible` with `centerElement: true`), or the bar takes the tap and the flow fails two steps later.
