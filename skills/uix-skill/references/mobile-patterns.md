# Mobile patterns

Recipes for how a phone app is put together. The catalogue is `data/mobile-patterns.csv`: 46 rows `mp-*` with `when`, `rules`, `avoid` and `motion_ids` (rows in `data/mobile-motion.csv`). Look the pattern up there and follow its rules. This guide says which pattern to reach for and how they fit together.

## Navigation model

Choose by the shape of the app, not by habit.

- **Tab bar** (`mp-bottom-tabs`): a handful of peer destinations people jump between. Each tab keeps its own stack and scroll position. Do not hide a tab bar to save space; if the bar gets crowded, move the rare destinations into a "More" screen.
- **Stack**: a drill-down from a list to a detail, with back. Large title on the root, inline title below (`mp-large-title`). Keep edge-swipe back working (`mp-edge-back`).
- **Drawer**: only on Android, and only when there are many destinations or the app is a workspace. Avoid it for shops; the tab bar is easier to reach.
- **Full-screen modal** (`mp-fullscreen-modal`): a task with its own start and end, such as compose or checkout. It has a close or cancel, never a tab bar.
- Tab labels are short nouns. Do not mix icon-only and labelled tabs in one bar.
- Deep links and share links open the right screen with the stack built behind it (`mp-share-deeplink`).

## Sheets

- Sheets are for a task that returns to where it started. If the user must go forward and back through steps, use a stack.
- A bottom sheet suits a short, related task that leaves the parent in view: filters, a cart, a variant picker, share (`mp-bottom-sheet`, `mp-filters-sheet`, `mp-cart-sheet`).
- Offer detents (medium and large on iOS; partial and expanded on Android). Show a drag handle. On Android it is 48dp tall and wide (mt-android-drag-handle-target).
- A sheet that holds a long form or a multi-step flow should be a full-screen modal.
- Dismiss by drag, scrim tap and a visible close. Warn only if there is unsaved input.
- Action menus and confirmations use the native action sheet, context menu or alert (`mp-action-menu`, `mp-alert-dialog`). Do not build a custom dialog for a yes-or-no.
- Motion: `mo-sheet`, `mo-sheet-detent`, `mo-sheet-dismiss`.

## Lists

- A list shows what is most useful first. Sort by what the user needs now (recent orders, nearest store), not by id.
- Rows are at least a full touch target tall (see `mobile-foundations.md`). The whole row is tappable, not only the title.
- Swipe actions (`mp-swipe-rows`) are shortcuts. The same action must also exist inside the row's detail, since swipes are not discoverable. Destructive actions need an undo (`mp-toast-undo`).
- Pull to refresh (`mp-pull-refresh`) for feeds and orders. Do not use it as the only way to reload; show the last updated time.
- Reorder with a drag handle (`mp-drag-reorder`), and announce moves to screen readers.
- Virtualise anything longer than a screen or two. Stable keys, fixed or measured row heights.
- Product lists: two columns on a phone (`mp-product-grid`, `mp-product-card`). Show price with tabular figures and the sale price next to the original (`mp-promo-price`).

## Loading, empty, error

- **Loading**: skeletons that match the final layout (`mp-skeleton-loading`, `mo-skeleton-content`). Reserve image space so nothing jumps when it loads (`mo-image-load`). A spinner is for a short action inside a button.
- **Empty**: say what belongs here, why it is empty and the one next step (`mp-empty-state`). First-use, no-results and cleared-by-user are three different messages.
- **Error and offline** (`mp-error-offline`): say what failed in plain words, keep what is already on screen, and give a retry. Never show a raw error code or a blank screen.
- **Status**: toasts and snackbars for non-blocking confirmation (`mo-toast`). A blocking error that needs a decision gets an alert.
- Every state is designed, not just the happy one: loading, empty, error, offline and partial.
- Permissions are requested at the moment of use, with a line of context first (`mp-permissions`).

## Forms and keyboard

Pattern: `mp-forms`, `mp-otp`.

- A visible label above each field. Placeholder text is an example, not a label.
- Match the keyboard to the field: email, phone, number, URL. Set the return key and move to the next field on return.
- Autofill and autocomplete hints for name, address, phone and one-time code.
- Scroll the focused field above the keyboard, with its error text visible (`mo-keyboard-avoid`).
- Validate when a field loses focus, not only on submit. Explain the fix next to the field (`mo-error-shake` plus text).
- One primary button per screen, reachable above the keyboard or pinned to the bottom edge (`mp-sticky-cta`).
- Do not ask for what you can infer. Drop fields before you add helpers.
- Show or hide a password with a toggle, and let the keyboard's own suggestions fill codes and addresses.

## Commerce flow

End to end, with the pattern for each step:

1. Search and browse: `mp-search`, `mp-filters-sheet`, `mp-product-grid`.
2. Product: `mp-product-gallery`, `mp-variant-picker`, `mp-reviews`, `mp-wishlist`, with `mp-sticky-add-to-cart` pinned at the bottom.
   The product screen sits above the tabs, so confirm the add with `mp-add-to-cart-confirm` (a "View bag" action).
   Check the smallest device: the main option control (colour, size) shows without scrolling, and the sticky bar does not cover the last swatch or field.
   The sticky buy bar sits in the safe-area inset (React Native: a bottom inset view; SwiftUI: `.safeAreaInset(edge: .bottom)`). Pushed detail screens hide the tab bar. The last row of a list gets padding equal to the floating tab bar, so nothing hides under it.
3. Cart: `mp-cart-sheet`, `mp-free-shipping-progress`. The free-shipping bar uses the same number as the website; the copy says which (before or after discount). Quantity changes update totals in place (`mo-quantity-stepper`, `mo-price-change`).
4. Checkout: `mp-checkout`. One page, address and delivery, payment, then the order summary. Show the total at every step.
5. Payment: choose the method (below), then confirm with a clear success state (`mo-success-check`).
6. After: `mp-order-tracking`, with a status the user can read without opening chat.

Keep the selected variant, quantity and coupon if the user leaves and comes back.
Pick the promo, shipping and payment rows that fit the shop; not every app needs all 46 patterns.

## Vietnam notes

- **Money**: format VND with `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`. There are no decimals, and the symbol follows the number (`250.000 ₫`). Never hand-concatenate separators. Android: `NumberFormat.getCurrencyInstance(Locale("vi", "VN"))`. iOS: `.currency(code: "VND")` with a `vi_VN` locale.
- **Long strings**: Vietnamese runs longer than English and has no short forms for many buttons. Let labels wrap or grow. Do not fix a button width. Test with the longest string, not with Lorem Ipsum.
- **Diacritics**: stacked marks need room. Set line height to at least 1.4 for body text and give headings extra top space so tone marks are not clipped. Choose a font with `vietnamese` in the `scripts` column of `data/fonts.csv`.
- **Cash on delivery** (`mp-pay-cod`): offer it as a first-class method, with the amount due shown clearly before confirming.
- **E-wallets** (`mp-pay-momo`, `mp-pay-zalopay`): open the wallet app by deep link and return to a pending order that updates on payment. Handle a missing app.
- **Bank transfer** (`mp-pay-vietqr`): QR with exact amount and a short transfer reference, the same details as copyable text, a saveable image and a waiting state with an expiry.
- **Chat to order** (`mp-chat-order`): many shops close the sale in Zalo or Messenger. Pre-fill the chat with product, variant, price and link, and keep an in-app order status after the hand-off.
