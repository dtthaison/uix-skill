---
stack: javafx
kind: native
check: code
---

# JavaFX

## Setup tokens from DESIGN.md

JavaFX themes through CSS. Define the tokens as looked-up colors on `.root` and reference them everywhere.

| DESIGN.md | JavaFX CSS |
| --- | --- |
| `colors.*` | looked-up colors on `.root` (`-brand`, `-surface`, `-ink`); a `.dark` set overrides them |
| `typography.*` | `-fx-font-family`, `-fx-font-size` on `.root` and style classes (`.display`) |
| `rounded.*` | `-fx-background-radius`, `-fx-border-radius` |
| `spacing.*` | `-fx-padding`, `-fx-spacing` |

```css
/* theme.css */
.root { -brand: #0e7c86; -surface: #eff8f7; -ink: #0b3434;
        -fx-base: -surface; -fx-accent: -brand; -fx-font-family: "DM Sans"; -fx-font-size: 15px; }
.root.dark { -brand: #5cc3cc; -surface: #0e1f1f; -ink: #d7eaea; }
.button.primary { -fx-background-color: -brand; -fx-text-fill: white; -fx-background-radius: 8; }
.label.display { -fx-font-family: "DM Serif Display"; -fx-font-size: 34px; -fx-text-fill: -ink; }
```

```java
Font.loadFont(getClass().getResourceAsStream("/fonts/DMSans.ttf"), 15);
scene.getStylesheets().add(getClass().getResource("/theme.css").toExternalForm());
if (dark) scene.getRoot().getStyleClass().add("dark");
```

Fonts must be loaded (`Font.loadFont`) before the CSS names them.

## Components

- Prefer FXML plus a controller, or plain builders in code, but keep style in CSS classes (`getStyleClass().add("primary")`), not inline `setStyle`.
- Use built-in controls (`Button`, `TableView`, `ListView` with cell factories) and bind with properties (`textProperty().bind(...)`).
- States are CSS pseudo-classes: `:hover`, `:pressed`, `:disabled`, `:focused`; add loading (`ProgressIndicator`), empty (`setPlaceholder`) and error views.
- Icons: an icon font or SVG paths; never emoji.

## Motion

Use `FadeTransition`, `TranslateTransition` or a `Timeline` with `Duration.millis(200)` and `Interpolator.EASE_OUT`, on opacity and translate only. JavaFX has no built-in reduced-motion setting; add a user preference and, when it is on, use `Duration.ZERO` or skip the animation.

## Accessibility

- Set `setAccessibleText` and `setAccessibleRoleDescription` on icon-only and custom nodes; keep nodes `focusTraversable` in reading order.
- Never remove the focus ring (`-fx-focus-color`, `-fx-faint-focus-color`) without a visible replacement.
- Targets at least 24 by 24 px; 44 on touch devices.
- Sizes in `px` ignore OS text scaling; offer an app text-scale (change root `-fx-font-size`) and use `em` for sizes that should scale.

## Gotchas

- Do not update nodes off the FX Application Thread; use `Platform.runLater`.
- A `-fx-` property typo is silently ignored; check the CSS reference.
- `setStyle` overrides stylesheet rules and blocks theming.
- Large `ListView`/`TableView` need virtualization (they have it; do not wrap them in `ScrollPane`).

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md src
```

`rules.mjs` checks `.java` and `.fxml` with the native rules, and `.css` with the **web** rules. The web rules do not understand `-fx-` properties, so they only catch generic things such as a literal `#000000` or a banned font name where the pattern matches; they do not check JavaFX colors or sizes. A Java `Color.BLACK` constant is not matched (only `Color.black`/`Black` spellings and quoted `"#000000"`). The native rules are `pure-black`, `banned-font`, `emoji-icon` and `tiny-text` (below 12), all warnings. Read the output and fix each finding; stop after at most 2 repair rounds. There is no browser check for native UI, so verify by hand:

1. Screenshot a small and a large window or device size. Run the app and capture a small and a large window with the OS screenshot tool.
2. Screenshot once in dark mode.
3. Screenshot once at the largest text size (raise the root `-fx-font-size` via your text-scale option, and the OS text scaling on Windows).

Look for: clipped or truncated text, overlapping controls, targets under the platform minimum, low-contrast text in either theme, missing focus or pressed states, and any layout that only works at one size.
