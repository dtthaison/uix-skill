# Anti-slop rules

Load this before building and again before you hand work back. Two kinds of rule:
- `### <rule-id>`: the engine checks it. `node <skill>/scripts/rules.mjs` (source) and `node <skill>/scripts/check.mjs` (rendered page) report it by this id. `error` blocks hand-off; `warn` needs a fix or a one-line reason.
- `### <slug> (judgment)`: no script catches it. You review your own output against these.

A DESIGN.md that declares a font allows it, so `banned-font` stays quiet for that name.

## Type
### banned-font
Warn. `font-family`, `font-[..]` or `next/font/google` (and SwiftUI `.custom`, Flutter `fontFamily`) names Inter, Arial, Roboto or Space Grotesk without DESIGN.md declaring it.
**Why:** these are the fonts every generated page ships, so the page looks like all the others.
**Fix:** pick a pair from `data/fonts.csv`, or declare the font in DESIGN.md `typography` when the brand really uses it.

### tiny-text
Warn. Native source sets a text size below 12 (`.system(size:)`, `fontSize`).
**Why:** under 12 pt people squint, and dynamic type cannot rescue a hard-coded size.
**Fix:** use 12 as the floor, 16 for body, and the platform's scalable text styles.

### eyebrow-every-heading
Warn, rendered. Three or more `h2` exist and at least 75% have an uppercase, letter-spaced label right above them.
**Why:** a label over every heading is a template tell, and it doubles the lines a reader must skip.
**Fix:** drop the labels. Keep one only where it carries real information such as a date or category.

### text-clipped
Warn, rendered. An element with `overflow: hidden` or `clip` is wider inside than outside and has no `text-overflow: ellipsis`.
**Why:** cut-off words look broken and hide content on narrow screens.
**Fix:** let the text wrap (`overflow-wrap: break-word; min-width: 0` in grids), or truncate on purpose with an ellipsis.

### flat-type-hierarchy (judgment)
**Why:** when the h1, h2 and body sizes sit close together nothing leads the eye.
**Fix:** use a scale with a clear ratio (about 1.25 to 1.5 per step), one display size, and at most 3 weights.

### one-accent-word-headline (judgment)
A headline where a single word is colored, italicized or underlined in the accent.
**Why:** it is the most copied hero trick on the web.
**Fix:** set the headline in one style. Put emphasis in the words themselves.

### gradient-text (judgment)
Text filled with `background-clip: text` over a gradient.
**Why:** it lowers contrast, breaks in forced-colors mode and reads as decoration.
**Fix:** use a solid token color.

## Color
### pure-black
Warn. `#000`, `black` or `rgb(0,0,0)` as a background, text, or fill color (also `bg-black`, `text-black`, `Color.black`, `Colors.black`; in Swift also `UIColor.black` and `.black` passed to `foregroundColor`, `foregroundStyle`, `background`, `fill`, `stroke` or `tint`, but not font weights).
**Why:** pure black next to tinted surfaces looks harsh and unconnected to the palette.
**Fix:** use a near-black taken from the palette `text` token, tinted toward the brand hue.

### ai-gradient
Error. A `gradient()` whose color stops are all blue-violet to purple (hue 220 to 320, saturation 40% or more), or a Tailwind `from-purple/violet/indigo/fuchsia` plus `to-blue/purple/pink/...` pair.
**Why:** purple-to-blue is the default look of generated landing pages.
**Fix:** use a flat surface or a tonal step between two palette colors. Use a gradient only when it carries meaning, for example a data scale.

### low-contrast
Error, rendered. Text contrast is under 4.5:1, or under 3:1 for large text (24px or more, or 18.66px bold). Text on a background image is skipped, so check it by eye. Findings are grouped per color pair and width, with a `count`, a `sample` text and up to 5 `selectors`; fix the token, not each element.
**Why:** low contrast makes text unreadable in daylight and fails accessibility law in many markets.
**Fix:** darken the text or lighten the surface until it passes. Take pairs from a `data/palettes.csv` row, which already clear 4.5:1.

### gray-on-color (judgment)
Gray body text or captions on a tinted, colored or photo background.
**Why:** gray reads as washed out on color and usually fails contrast.
**Fix:** use a darker shade of the background's own hue, or white or near-black picked by contrast.

### dark-glow (judgment)
Neon box-shadow glows, blurred color blobs and glass cards on a dark page to fake depth.
**Why:** it is a stock "AI product" look and costs paint time.
**Fix:** separate layers with a slightly lighter surface and a 1px border.

## Motion
### bounce-easing
Error. `animate-bounce`, `bounce.out`, `elastic.out`, `easeOutBounce`, or `--ease-bounce` style values.
**Why:** bounce makes serious interfaces feel like toys and draws attention to the motion, not the content.
**Fix:** use an exponential ease-out such as `cubic-bezier(0.22, 1, 0.36, 1)`.

### overshoot-easing
Warn. A `cubic-bezier()` whose y1 or y2 is below 0 or above 1.
**Why:** the element passes its target and springs back, which reads as jitter.
**Fix:** keep both y values between 0 and 1.

### scale-zero
Error. `scale(0)`, `scale: 0`, `scale-0` or `scale={0}`.
**Why:** nothing in the real world grows out of a point; it looks like a glitch.
**Fix:** start at `scale(0.95)` with `opacity: 0` and ease out.

### transition-all
Warn. `transition: all` or `transition-all`.
**Why:** it animates layout properties by accident and wastes frames.
**Fix:** list the properties, for example `transition: transform 200ms, opacity 200ms`.

### no-reduced-motion
Warn. A web file uses animation, transitions, GSAP or Framer Motion and no scanned file mentions `prefers-reduced-motion`, `useReducedMotion` or `motion-reduce`.
**Why:** motion can make people with vestibular disorders ill.
**Fix:** add a `@media (prefers-reduced-motion: reduce)` block that removes movement and keeps fades. See `references/motion.md`.

## Layout
### h-overflow
Error, rendered. At any checked width (375, 768, 1280) the page is wider than the viewport.
**Why:** sideways scrolling on a phone is a broken layout.
**Fix:** find the widest element with devtools, then fix it with `min-width: 0`, `max-width: 100%`, wrapping, or `overflow-x: clip` on the container. Never hide the symptom with `100vw`.

### small-target
Warn, rendered at 375 only. A link, button or form control is under 24 by 24 px. WCAG 2.5.8 spacing exception: it passes when a 24px circle centred on it touches no other target and no other undersized target's circle. Inline links in running text are skipped.
**Why:** thumbs miss small targets.
On mobile, `check-mobile` also emits this from the hierarchy pass; it skips nodes with a side under 8 pt or a long/short ratio over 20:1, and reports each (rule, bounds) once per route.
**Fix:** give controls at least 24px, and aim for 44px on touch (padding, not just a larger icon). Or space undersized targets at least 24px apart, centre to centre.

### heavy-image
Warn, rendered. A loaded `img` has a natural width of 1000px or more that is over 2x its rendered width times the device pixel ratio. Grouped per width with a `count`.
**Why:** a 2400px original shown at 300px costs ten times the bytes it needs, slows the page and makes lazy images look empty.
**Fix:** serve a version resized to about 2x the display width (`srcset`, `next/image`, or a resized file in the project), and do not hotlink originals.

### nested-cards (judgment)
A bordered, shadowed card inside another card.
**Why:** boxes inside boxes add noise and eat width.
**Fix:** flatten the inner one into spacing, a divider or a background tint.

### every-section-a-card (judgment)
Every block on the page is a rounded, bordered box on a gray field.
**Why:** if everything is a card, nothing is grouped or ranked.
**Fix:** let most sections sit directly on the page. Use cards only for items that are separate things users pick, open or compare.

### everything-centered (judgment)
Every heading, paragraph and button is center-aligned.
**Why:** centered text has a ragged left edge that is slow to read, and it makes pages look generic.
**Fix:** left-align body copy and headings. Center only a short hero line or a single action.

### rounded-lg-everywhere (judgment)
The same `rounded-lg` or `rounded-xl` on buttons, inputs, cards, images and avatars.
**Why:** one radius for everything says no one decided.
**Fix:** use the `rounded` scale in DESIGN.md. Give inputs and buttons one radius, containers another, and pills only for chips.

### side-stripe-card (judgment)
A card with a thick colored border on one side only.
**Why:** it is a trope borrowed from alert boxes and used as decoration.
**Fix:** use a full hairline border or a tinted background plus an icon and a label.

### icon-tile-grid (judgment)
A row of three or four boxes, each with a tinted icon square, a bold title and one gray line.
**Why:** it is the standard filler section and says nothing specific.
**Fix:** show the real thing, such as a screenshot, a number, a sample or a short story, with no icon tile.

## Components
### outline-none
Error. `outline: none` or `outline: 0` outside a `:focus-visible` rule, or Tailwind `outline-none` without a `focus-visible:` class. In CSS files it drops to warn when some scanned CSS has a global `:focus-visible` rule that sets an outline; inline `outline: 'none'` and Tailwind hits stay errors.
**Why:** keyboard users lose track of where they are.
**Fix:** style `:focus-visible` with a 2px outline and offset in the accent, and never remove it.

### emoji-icon
Warn. An emoji character in markup or a native string literal (not in CSS or comments; (c), (r), TM, arrows such as ↗ → and typographic symbols such as ⌘ ✓ ★ • are ignored).
**Why:** emoji render differently per platform and look amateur as UI icons.
**Fix:** use Lucide, Phosphor or Heroicons (SF Symbols or Material icons on native). Native `.ts`/`.js` files with no JSX (copy and data) are skipped.

### img-no-alt
Error, rendered. An `img` has no `alt` attribute.
**Why:** screen readers announce the file name instead.
**Fix:** describe the content in `alt`, or use `alt=""` when the image is decorative.

### console-error
Warn, rendered. The page logged a console error or threw an uncaught exception while loading.
**Why:** a broken script usually means a missing feature or a blank region.
**Fix:** read the message in the finding, fix the cause (missing file, bad import, null access), then check again.

### empty-image-frame (judgment)
A gray box, a `placeholder.com` URL or an empty `div` standing where a photo goes.
**Why:** it tells the visitor the page is unfinished.
**Fix:** follow `references/images.md`: project asset, then a credited Openverse image, then CSS or SVG art.

### fake-form-success (judgment)
A form that shows "Thanks, you're subscribed!" without sending anything, or a submit that does nothing.
**Why:** it lies to the user and hides a missing backend.
**Fix:** wire a real handler, or show a clear "not connected yet" state in development. Validate fields and show errors.

## Content
### purposeless-newsletter (judgment)
A "Subscribe to our newsletter" band that says nothing about what arrives, how often or why.
**Why:** it is filler that adds a form nobody asked for.
**Fix:** remove it. Keep one only when you can name what the reader gets and how often.

### invented-proof (judgment)
Made-up testimonials, user counts, logo walls, star ratings or "trusted by 10,000 teams".
**Why:** invented claims are deception and readers spot them.
**Fix:** use real material from the user, or leave the section out.

### generic-copy (judgment)
"Unlock the power of...", "Seamless", "Revolutionize your workflow", three vague benefit titles.
**Why:** copy that could fit any product persuades no one.
**Fix:** name the specific thing, the person and the outcome in plain words.

## Mobile
### rn-scrollview-map
Error. A React Native `ScrollView` renders rows with `.map(`.
**Why:** every row mounts at once, so long lists use more memory and open slowly.
**Fix:** use `FlatList` or FlashList with a stable `keyExtractor`. A literal array, a same-file `const` array or `.slice(0, n)` with n up to 12 is allowed.

### rn-js-driver
Error. A legacy `Animated.timing`, `spring` or `decay` call without `useNativeDriver: true`.
**Why:** each frame crosses the JS bridge, so the animation stutters when JS is busy.
**Fix:** set `useNativeDriver: true` (transform and opacity only), or move to Reanimated.

### rn-linear-motion
Warn. `Easing.linear` on a one-shot move (rotation and loops are skipped).
**Why:** constant speed looks mechanical because nothing real starts or stops instantly.
**Fix:** use a spring, or `Easing.out(Easing.cubic)` for entrances.

### rn-no-press-feedback
Warn. `TouchableWithoutFeedback`, or a `Pressable` with no `pressed` style, `android_ripple` or `onPressIn`.
**Why:** a tap that changes nothing feels broken and invites double taps.
**Fix:** dim or scale on `pressed`, and add `android_ripple` on Android. Full-screen scrims (`StyleSheet.absoluteFill`, or a label or testID with scrim, backdrop or overlay) are skipped.

### rn-small-target
Warn. A Pressable or Touchable with an inline width or height under 44 and no `hitSlop`.
**Why:** thumbs miss small targets; Apple asks for 44pt and Material for 48dp.
**Fix:** grow the box to 44 or add `hitSlop` that reaches 44 on every side.

### rn-icon-no-label
Error. A pressable whose only child is an icon or image and that has no `accessibilityLabel`.
**Why:** a screen reader announces "button" with no purpose.
**Fix:** add `accessibilityLabel` (and `accessibilityRole="button"`) that names the action.

### rn-font-scaling-off
Warn. `allowFontScaling={false}`, or `maxFontSizeMultiplier` below 1.3.
**Why:** people who enlarge system text cannot read the screen.
**Fix:** keep scaling on and design the layout to wrap. Cap at 1.3 or more only for tight chrome such as tab labels.

### rn-hardcoded-inset
Warn. `paddingTop` or `marginTop` of 44, 47, 59 or 62, or `Platform.OS === 'ios' ? 20`, in a file that never reads safe-area insets (a plain 20 is fine).
**Why:** notch, island and status bar heights differ per device, so fixed values clip or waste space.
**Fix:** read `useSafeAreaInsets()` from `react-native-safe-area-context` and pad with `insets.top`.

### rn-no-reduced-motion
Warn, per file. A file uses `withSpring`, `withTiming`, `withRepeat`, `entering=`, `exiting=` or `layout=` and never mentions `useReducedMotion`, `ReduceMotion` or `reduceMotion`.
**Why:** parallax and large moves can make people with vestibular disorders ill.
**Fix:** read `useReducedMotion()` and swap slides and zooms for a short fade, or set `ReduceMotion.System` on animations. The finding sits on the first animation line.

### missing-label
An unlabelled switch (error), or an unlabelled icon-sized control of 64x64 pt or less (warn, lower confidence, may be decorative); found by `check-mobile` on a running simulator. The hierarchy pass skips nodes with a side under 8 pt or a long/short ratio over 20:1, and reports each (rule, bounds) once per route.
**Why:** screen readers announce nothing useful, so the control cannot be found or understood by voice.
**Fix:** set `accessibilityLabel` (and `accessibilityRole`) on every icon button and switch; hide purely decorative views from the accessibility tree. Related rule: `rn-icon-no-label`.

### app-error
The simulator shows the React Native red box or LogBox inspector (`Log 1 of 1`, Dismiss, Minimize) instead of the screen.
**Why:** every other check on that route is meaningless, and users would see a crash.
**Fix:** read the title and message in the finding, fix the render or import error, reload, and re-run the check.

### flow-failed
A Maestro flow passed with `--flow` stopped at a step, such as a tap on a label that never appeared.
**Why:** the interaction the flow covers is broken or renamed, so the screens after it were never checked.
**Fix:** read the failing step in the finding, fix the screen or the flow, and re-run.

### route-not-navigated
Two routes of one device and mode produced the same screenshot.
**Why:** the deep link did not reach the router (it stayed on `/`), or the app was still on the splash.
**Fix:** make the link reach the router (react-native.md "Deep links in Expo Go"), or re-run once the app has loaded. If the screens are meant to look the same, mark it with `sameAs` in the routes file.

### swiftui-linear
Warn. `.linear` or `Animation.linear` driving a one-shot SwiftUI animation; progress bars and `repeatForever` loops are skipped.
**Why:** constant-speed motion with hard start and stop looks mechanical, and nothing in the physical world moves like it.
**Fix:** use `.spring` or `.easeOut`; keep `.linear` for progress and endless spinners.

### swiftui-fixed-font
Warn. `.font(.system(size: N))` with no `relativeTo:` in the call.
**Why:** a fixed size ignores Dynamic Type, so people who raise their text size get no change.
**Fix:** use a text style such as `.system(.body)`, or `Font.custom(name, size: N, relativeTo: .body)`.

### swiftui-animation-no-value
Warn. A `.animation(...)` view modifier with no `value:` argument; `withAnimation`, `$x.animation(`, `binding.animation(`, the closure form and `.transition(...animation(...))` are skipped.
**Why:** the value-less form is deprecated and animates every change to the view, including ones you never meant to animate. **Fix:** pass the state that should drive it: `.animation(.spring, value: isOn)`.

### swiftui-fill-no-clip
Warn. `.scaledToFill()` or `.aspectRatio(..., contentMode: .fill)` with no `.clipped(` or `.clipShape(` in the next 300 characters.
**Why:** the image reports its full filled size to its parent, which can push the layout off screen. **Fix:** put the image in a fixed `.frame(...)` and add `.clipped()`.

### swiftui-no-reduce-motion
Warn, project level (one finding). `withAnimation` or `.animation(` is used and `accessibilityReduceMotion` appears nowhere.
**Why:** large movement can trigger nausea or dizziness for people who turned on Reduce Motion.
**Fix:** read `@Environment(\.accessibilityReduceMotion)` and swap travel and bounce for a fade.

### compose-linear
Warn. `LinearEasing` passed to `tween(` for UI motion; `infiniteRepeatable` spinners are skipped.
**Why:** a constant velocity with abrupt edges feels robotic against the rest of Material motion.
**Fix:** use `FastOutSlowInEasing` or a spring spec; keep `LinearEasing` for endless loops.

### flutter-linear
Warn. `Curves.linear` on UI motion; animations built around `repeat()` are skipped.
**Why:** the interface drifts at an even pace and stops dead, which reads as unfinished.
**Fix:** use `Curves.easeOutCubic`, `Curves.fastOutSlowIn` or a spring simulation.

### flutter-no-text-scale
Error. `TextScaler.noScaling`, or `textScaleFactor: 1` / `1.0`.
**Why:** it cancels the system font size, so text stays small for people who need it larger.
**Fix:** let the scaler through, or cap it with `TextScaler.clamp(maxScaleFactor: 1.4)`.

### web-layout-on-phone (judgment)
A hero, centered text, a three-card row and a footer, with hover states and a hamburger menu instead of a tab bar.
**Why:** it is a website squeezed into a phone, and nothing uses the thumb zone.
**Fix:** design the screen around one task, with bottom tabs for 3 to 5 sections and press states instead of hover.

### xxxl-hides-primary-control (judgment)
At the largest text size, a row's or card's main control (a quantity stepper, a remove button) is pushed off screen by a long title.
**Why:** the person cannot finish the task, and the control gives no sign that it is missing.
**Fix:** let the title wrap to more lines and move the control below it, or cap that one text with `maxFontSizeMultiplier` (React Native) / `.dynamicTypeSize(...DynamicTypeSize.accessibility2)` (SwiftUI); never cap body text app-wide.

### row-control-off-center (judgment)
A switch, stepper or chevron sits at the top of a taller row instead of centred on it.
**Why:** it looks misplaced and the eye cannot link the control to its label.
**Fix:** `alignItems: 'center'` on the row (React Native) / default `HStack` alignment (SwiftUI).

### centered-flat-hierarchy (judgment)
Everything centered, one size for every line, no left edge to read along.
**Why:** the eye gets no entry point and long text is tiring to scan.
**Fix:** left-align reading text, use a large title at the top, and step sizes by at least 1.25x.

### card-soup (judgment)
Each item is a bordered, shadowed rounded box, sometimes nested inside another.
**Why:** equal containers flatten importance and eat the narrow width.
**Fix:** use spacing and dividers for grouping, one card level at most, and full-bleed imagery where it helps.

### cramped-tap-targets (judgment)
Tight rows of small icons, and plain text links standing in for buttons.
**Why:** mistaps cause wrong actions, and text links show no hit area.
**Fix:** 44pt (iOS) or 48dp (Android) targets with spacing between them, and real buttons for actions. Related rule: `rn-small-target`.

### default-type-no-scale (judgment)
System font at 14 to 16 for every line, proportional digits in prices, no large title.
**Why:** the screen has no voice and numbers jitter as they change.
**Fix:** define a type scale with a distinct title size, and use tabular numerals for prices and counters. See `rn-font-scaling-off` for scaling.

### mobile-gradient-glass (judgment)
Purple-to-pink gradients, blur panels on every layer, emoji or mixed icon sets with different stroke weights.
**Why:** it is the stock generated look, and mixed icons read as unfinished.
**Fix:** one accent, one icon family and weight, and glass only for chrome that floats over content.

### no-safe-area-keyboard (judgment)
Content under the notch or home indicator, a bottom button hidden by the keyboard.
**Why:** the primary action becomes unreachable on some devices.
**Fix:** use insets on all edges and `KeyboardAvoidingView` (or the platform equivalent) for forms. Related rule: `rn-hardcoded-inset`.

### motionless-or-uniform-motion (judgment)
Screens swap abruptly, or every change uses the same 300ms ease with no spring, gesture follow or shared element.
**Why:** touch UI is expected to respond to the finger and show where things came from.
**Fix:** springs for gestures, shared-element or fade transitions between screens. Related rules: `rn-linear-motion`, `rn-js-driver`.

### no-feedback-no-states (judgment)
No haptic, no pressed state, no loading, empty or error view, a spinner where a skeleton would fit.
**Why:** the app feels dead and users cannot tell a slow load from a failure.
**Fix:** press feedback on every control, a skeleton shaped like the content, and a written empty and error state. Related rule: `rn-no-press-feedback`.

### placeholder-content (judgment)
Gray image boxes, lorem ipsum, "John Doe", every card the same height and aspect.
**Why:** it shows the screen was never tried with real content.
**Fix:** use realistic data with mixed lengths and image ratios, and design the empty and overflow cases.

### modal-for-everything (judgment)
Center alerts and dialogs for choices, forms and confirmations.
**Why:** they block the screen and sit far from the thumb.
**Fix:** use a bottom sheet for choices and short forms, and keep alerts for destructive confirmation.

### ignores-platform (judgment)
iOS swipe-back broken, Android back gesture ignored, tab bar on top, a floating action button on iOS.
**Why:** users bring habits from the OS, and breaking them costs trust.
**Fix:** use the native navigator, keep gestures working, and follow each platform's bar placement.

### inverted-dark-mode (judgment)
Dark mode made by flipping colors, with the same shadows and contrast logic.
**Why:** pure inversion gives glare, muddy surfaces and lost depth.
**Fix:** define a dark palette with lighter surfaces for higher elevation and softened accent colors. See `pure-black`.

### form-without-anchor (judgment)
Long forms and carts with the total and CTA at the end of the scroll; lists that lose position or cannot refresh.
**Why:** people scroll back to find the button and lose their place on return.
**Fix:** sticky summary and CTA, pull to refresh through `RefreshControl`, and restore scroll position on back.

### over-animation (judgment)
Everything bounces, parallax and confetti on every screen, Reduce Motion ignored.
**Why:** constant motion hides the one moment that matters and harms some users.
**Fix:** animate the key moment once, keep the rest calm, and honour Reduce Motion. Related rule: `rn-no-reduced-motion`.

### primary-choice-below-fold (judgment)
The colour, size or plan picker sits under the hero and the description, so the smallest device (iPhone SE, 320 dp Android) shows a photo and no way to choose.
**Why:** a choice people cannot see is a choice they miss; the dogfood product screen hid its swatches below the fold on SE.
**Fix:** open every shot on the smallest device and ask where the main option control is. Shrink the hero or move the control up until it shows without scrolling.

### sticky-bar-covers-content (judgment)
The bottom buy or checkout bar sits on top of the last swatch, field or list row, and a tap there lands on the bar.
**Why:** the content looks present but cannot be reached, and a flow that taps its centre fails with a misleading error.
**Fix:** pad the scroll content by the bar height plus the bottom inset, and scroll the target clear of the bar before you shoot or tap it.

### xxxl-overflow (judgment)
Text in empty states, sheets and bars has no cap, so at the largest Dynamic Type size (xxxl, or 200% font scale) it pushes the button off the screen or clips.
**Why:** large-type users hit these screens most, and a clipped action is a dead end.
**Fix:** let body text grow inside a scroll view, cap display and headline text (`maxFontSizeMultiplier` 1.3 to 1.5), and shoot the screen at xxxl.

### truncated-meaningful-label (judgment)
A price, variant name, order status or button label ends in an ellipsis with no way to read the rest.
**Why:** the cut-off part is often the part that matters, and Vietnamese labels run longer than English.
**Fix:** let the label wrap or move to a second line; truncate only decorative or repeated text, and keep the full text in the accessibility label.
