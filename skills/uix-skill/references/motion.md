# Motion

Motion explains change. It is never decoration. Run every animation through the four questions before you write it.

## The four questions

1. **Is it needed?** If users see it dozens of times a day (menus, tabs, keyboard actions), skip it or keep it near-instant. Never animate actions triggered by the keyboard.
2. **What does it communicate?** Name one thing: where something came from, that a click registered, that state changed, how a feature works. If you cannot name it, delete it.
3. **Which easing?** Elements entering or responding: ease-out, for example `cubic-bezier(0.22, 1, 0.36, 1)`. Elements moving on screen: ease-in-out. Never bounce, elastic or overshoot (y values outside 0 to 1). Avoid `ease-in` for UI; it feels slow to start.
4. **How long?** 150 to 300 ms for UI (hover 150, menu 200, dialog 250). 500 ms at most for page and route transitions. Exits are faster than entrances. Big movement may use more time, never more than 500 ms.

## Rules

- Animate `transform` and `opacity` only. Never `width`, `height`, `top`, `left` or margins.
- Never start from `scale(0)`. Start at `scale(0.9)` to `0.95` with `opacity: 0`.
- Never `transition: all`. List the properties.
- Pressed buttons get `transform: scale(0.97)` on `:active`.
- Popovers scale from their trigger (`transform-origin` at the trigger). Modals stay centered.
- Stagger lists by 30 to 60 ms per item, and cap the total at about 400 ms.
- Do not loop anything that is not a loading indicator.
- Always honor reduced motion.

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Keep opacity fades, drop movement, parallax and autoplay. In JS use `window.matchMedia('(prefers-reduced-motion: reduce)')`, GSAP's `gsap.matchMedia()`, or Framer's `useReducedMotion()`. `scripts/rules.mjs` warns (`no-reduced-motion`) when motion exists and none of these appear.

## CSS pattern

```css
.panel { opacity: 0; transform: translateY(8px) scale(0.95); }
.panel.is-open {
  opacity: 1; transform: none;
  transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
              transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
```

## GSAP patterns

- Scope every tween in a context, so cleanup is one call. In React use `useGSAP` from `@gsap/react` with a `scope` ref. Otherwise use `gsap.context(() => {...}, rootEl)` and call `ctx.revert()` on unmount.
- Register plugins once, at module level: `gsap.registerPlugin(ScrollTrigger, useGSAP)`. Never inside a component body or an effect.
- Use `autoAlpha` instead of `opacity` to fade; it also toggles `visibility` so hidden items leave the tab order.
- Set hidden start states in CSS and tween to the visible state. A `from` tween whose script loads late flashes the final state first.
- Wrap movement in `gsap.matchMedia()`: do the movement inside `(prefers-reduced-motion: no-preference)` and nothing inside `reduce`.
- ScrollTrigger: give each trigger an explicit `trigger`, `start` and `toggleActions`; kill or revert on unmount; call `ScrollTrigger.refresh()` after images or fonts change layout; avoid `scrub` for text people need to read.
- Defaults: `gsap.defaults({ ease: 'power3.out', duration: 0.25 })`.

## Reviewing motion (`/uix motion`)

Output one markdown table. One row per issue, nothing else in the format. Show the actual code in both columns.

| Before | After | Why |
| --- | --- | --- |
| `transition: all 300ms` | `transition: transform 200ms, opacity 200ms` | Lists the properties; no layout animation |
| `transform: scale(0)` on open | `scale(0.95)` plus `opacity: 0` | Nothing grows from a point |
| `ease-in` on a dropdown | `cubic-bezier(0.22, 1, 0.36, 1)` | Ease-out responds immediately |
| No `:active` style on the button | `:active { transform: scale(0.97) }` | The press must feel acknowledged |
| 600 ms route fade | 300 ms | Page transitions stay at or below 500 ms |

After the table, list which of the four questions each removed animation failed.
