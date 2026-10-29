# Components and accessibility

Build every component with all its states. A component with only a default state is unfinished.

## States

| State | Rule |
| --- | --- |
| Hover | Change color or surface slightly. Never rely on hover alone: touch has none. |
| Focus-visible | A 2px outline in the accent, 2px offset, appears instantly. Never remove it (`outline-none` is an error). Style `:focus-visible`, not `:focus`. |
| Active | A press response: `scale(0.97)` or a darker fill. |
| Disabled | Use the `disabled` attribute or `aria-disabled`. Lower contrast is allowed, but say why it is off near the control. |
| Loading | Show a spinner or skeleton in the same footprint, disable repeat submits, keep the label (`aria-busy`). |
| Empty | Say what is missing, why, and offer the one next action. No blank box. |
| Error | Say what went wrong and how to fix it, in text next to the field. Never a color change alone. |

Also design a success state that reflects something real (data saved, request sent).

## Icons

- Use one set per project: Lucide, Phosphor or Heroicons (SF Symbols or Material Symbols on native).
- Never use emoji as icons (`emoji-icon`). Never mix sets or stroke widths.
- Icon-only buttons need `aria-label`. Decorative icons get `aria-hidden="true"`.
- Size icons to the text: 16 to 20 px next to body copy.

## Forms

- Every input has a visible `<label>` tied with `for`/`id`. A placeholder is not a label.
- Use the right `type`, `autocomplete` and `inputmode`.
- Validate on blur and on submit, with real rules (required, format, range) and plain error text under the field, linked with `aria-describedby`. Set `aria-invalid="true"`.
- On a failed submit, move focus to the first invalid field or an error summary.
- Never fake success. Show success only after the request succeeds.
- Keep inputs at least 44px tall and 16px type so mobile browsers do not zoom.

## Targets

- Interactive targets are at least 24 by 24 px (the engine warns below that at 375 px). Aim for 44 by 44 on touch.
- Leave at least 8px between adjacent targets.

## Color and meaning

- Never use color alone to carry meaning. Pair it with text, an icon or a pattern: "Overdue" beside the red dot, "+3.2%" beside the green.
- Text contrast is at least 4.5:1, or 3:1 for large text (24px, or 18.66px at weight 700). UI borders and icons that identify a control need 3:1.
- Check both light and dark themes.

## Structure

- Use real elements: `button` for actions, `a` for navigation, `nav`, `main`, `h1` to `h3` in order. One `h1`.
- Every image has `alt`. Decorative images use `alt=""`.
- Everything works with the keyboard alone: logical tab order, Escape closes layers, focus returns to the trigger.
- Dialogs trap focus and label themselves with `aria-labelledby`.
- Do not put information only in a tooltip.
- Text can grow to 200% without clipping or sideways scroll.
