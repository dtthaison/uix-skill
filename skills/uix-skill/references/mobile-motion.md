# Mobile motion

Motion on a phone explains change and confirms touch. This guide stands on its own: it carries its own 4 questions below, plus springs, gestures and haptics, and `motion.md` is not needed. The interaction table is `data/mobile-motion.csv`: 43 rows `mo-*`, one per interaction, with a column per stack. Look the interaction up there; do not invent values.

## The 4 questions on mobile

1. **Is it needed?** Things people do dozens of times a day (tab switch, keyboard return, list scroll) get little or no motion. Never animate scrolling itself.
2. **What does it communicate?** Name one thing: the tap landed, where this came from, the state changed, the task finished. A named reason is the test.
3. **Which easing?** Anything the finger touches uses a spring so it can be caught mid-flight. Fades and color changes use timing with an ease-out curve.
4. **How long?** Timing tokens for non-spring motion: 100ms for small feedback (mt-android-duration-short2), 200ms for UI (mt-android-duration-short4), 300ms for sheets and screens (mt-android-duration-medium2), 400ms for large moves (mt-android-duration-medium4). Exits are faster than entrances. Our guidance: treat 500ms (mt-android-duration-long2) as the ceiling for UI, and keep 1000ms (mt-android-duration-extra-long4) for loops and onboarding.

Worked example, a product screen on the lively tier. Every row below can be defended; only some pass the questions.

| Animation | What it communicates | Verdict |
| --- | --- | --- |
| Photo flies to the bag tab (`mo-cart-fly`) | The item went into the bag, and where the bag is | Keep: the signature moment, once per add |
| Bag icon bounces on landing (`mo-badge-bump`) | The count changed | Keep, peak scale 1.2 at most |
| Rows rise in on first load (`mo-list-stagger`) | Content has arrived | Keep, first screenful only |
| Price tag wobbles when the screen opens | Nothing | Drop |
| Swatches bounce on every tap | The tap landed, which the selected ring already says | Drop; keep the ring and a selection haptic |
| Hero image parallax while scrolling | Nothing; it fights the scroll | Drop |

A confirm bump (badge, tab icon, heart) is small: scale 1.15 to 1.2 at most, then settle. Past 1.2 it reads as a glitch and covers its neighbours.

## Two tiers

`DESIGN.md` carries `Motion tier: calm` or `Motion tier: lively`. The `init` step sets it from the tone answer. Every motion choice reads the tier.

| | calm | lively |
| --- | --- | --- |
| Spatial springs | Damping ratio 1.0, same stiffness steps (1400, 700, 300): no overshoot | Damping ratio 0.9: slight overshoot |
| Effects and fades | Effects springs and short timing | Same |
| Gestures | Native behaviour only | Drag, fling and shared elements follow the finger |
| Haptics | Success and error only | Selection, success and error, plus the row's own haptic |
| Shared elements | Cross-fade | Zoom or morph (`mo-shared-zoom`) |

How `motion_feel` in `data/mobile-styles.csv` maps: `calm` and `snappy` are calm; `lively` and `playful` are lively. Snappy uses the fast stiffness (1400) with fewer, shorter moves and no overshoot. Playful adds more bounce and mascots.

CSV rows are written at the lively values. For calm, change the spring's `dampingRatio` from 0.9 to 1.0, keep the stiffness, and replace a shared-element zoom with a cross-fade.

## Springs

- Springs are the default. Use timing only for fades and color, and use the platform's native transition where one exists (push and pop, sheet present, system alert).
- Spatial springs move things in space. Lively uses damping ratio 0.9 (mt-android-spring-spatial-damping); calm uses 1.0 so nothing overshoots. Stiffness picks the size in both tiers:
  - 1400 for small parts: switches, buttons, chips (mt-android-spring-fast-stiffness)
  - 700 for things that cover part of the screen: sheets (mt-android-spring-default-stiffness)
  - 300 for full-screen moves (mt-android-spring-slow-stiffness)
- Effects springs change color and opacity. Damping ratio is 1 (mt-android-spring-effects-damping): they settle with no overshoot.
- The `motion` column in the CSV spells each spring as `spring:dampingRatio=...,stiffness=...`. Each stack column translates it: Reanimated `mass`/`damping`/`stiffness`, SwiftUI `response`/`dampingFraction`, Compose `dampingRatio`/`stiffness`.
- Some stack cells use a short timed animation instead of a spring (Flutter implicit widgets, for one). Use the cell as written.

## Interruptibility and velocity

- Every transition can be interrupted. A second tap, a drag or a back swipe takes over from the current position, not from the start.
- Drive position from one value (a shared value, an animation controller, a state). Never run two animations on the same property.
- When a drag ends, hand the finger's release velocity to the spring so the motion carries on. A fling that restarts at zero speed feels broken. See `mo-sheet-detent`, `mo-swipe-action` and `mo-carousel-snap`.
- Interactive back (`mo-swipe-back`) follows the finger one to one, then completes or cancels from the release velocity.
- Disable taps on a screen only while it is truly unusable. Do not lock the UI for the length of an animation.

## Shared element by hand

Reanimated's shared transitions are experimental. Prefer the native zoom where it exists (`mo-shared-zoom`). Build it by hand when the transition must work in Expo Go, on Android, or with a non-trivial source such as a card inside a list.

1. On tap, measure the source image in window coordinates (`measureInWindow` on the view, or `measure` in a worklet) and store the rect in a module variable or context.
2. Navigate. The target screen reads the rect and starts its hero at the source's position and size.
3. Animate translate and one uniform scale back to rest with a single spring. Keep the same aspect ratio on both ends; scaling x and y apart squashes the photo.
4. Fade the rest of the screen in after about 120ms, so the image leads.
5. Without a stored rect (deep link, cold start), skip the zoom and fade the screen in. Expo Go deep links always take this path.

## Haptics

Three kinds: selection, impact, notification. The `haptic` column in `mobile-motion.csv` gives one of `none`, `light`, `medium`, `selection`, `success`, `error` for each row. Pattern `mp-haptics` in `data/mobile-patterns.csv` describes the wrapper.

| Event | Haptic |
| --- | --- |
| Toggle, segment or tab change (`mo-toggle`, `mo-segmented-control`, `mo-tab-switch`) | selection |
| Primary action pressed, once per screen (`mo-cta-press`) | light |
| Sheet detent snap, pull-to-refresh trigger (`mo-sheet-detent`, `mo-pull-refresh`) | light |
| Drag reorder, swipe action, context menu (`mo-drag-reorder`, `mo-swipe-action`, `mo-context-menu`) | medium |
| Payment or order done (`mo-success-check`) | success |
| Failed action, invalid field (`mo-error-shake`) | error |
| Plain press, carousel snap, list reflow, scroll | none |

- Never fire a haptic on scroll, and not on every tap.
- Wrap haptics in one helper. Throttle it, and skip it when the system turns haptics off.
- Haptics are not motion: keep them under Reduce Motion.

## Reduced motion

Read the system setting once at the root and pass it down. Replace movement with a short fade (`mo-reduced-fade`); drop parallax, auto-play and looping. Each CSV row has a `reduced_motion` column, so follow it. Reduce Motion is code review only: `check-mobile` cannot toggle it.

| Stack | Read the setting |
| --- | --- |
| React Native | `useReducedMotion()` and `ReducedMotionConfig` in Reanimated |
| Flutter | `MediaQuery.disableAnimationsOf(context)` |
| SwiftUI | `@Environment(\.accessibilityReduceMotion)` |
| Compose | `ANIMATOR_DURATION_SCALE` equal to 0 |

Keep state changes visible with color, shape or text, not only with movement.

## Performance

- Animate `transform` and `opacity` only. Width, height and layout properties cost a layout pass every frame.
- Run animation on the UI thread: Reanimated worklets in React Native, not `Animated` with the JS driver or `setState` per frame. In Flutter, Compose and SwiftUI, animate graphics-layer properties (scale, offset, alpha) rather than re-laying out the tree.
- Virtualise long lists (`FlatList`/`FlashList`, `ListView.builder`, `LazyColumn`, `List`). Do not animate every row; stagger only the first screenful.
- Keep gesture handlers free of network and parse work.
- Test on a low-end Android device and a release build. Debug builds hide jank.
- The mobile check script, `check-mobile.mjs`, flags the common slips; it does not replace a device run.
