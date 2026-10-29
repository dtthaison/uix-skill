# App shells

For dashboards and product screens, where people work rather than read. Prefer these to a landing-page layout whenever the user signs in. Shared rules:

- One shell per product: the same nav, header and page padding on every screen.
- Group with spacing, dividers and surface steps. Do not put every region in a card, and never nest cards.
- Every screen defines loading, empty, error and populated states.
- Targets are at least 24x24px (WCAG 2.2 AA); aim for 44x44px on touch. Dense 32px rows are fine. Visible focus on everything interactive.
- Use tabular numerals for any column of numbers. Right-align them.

Wireframes are schematic; `[ ]` is a control or block, `~~~` is text.

## Dashboard
**Use when:** People check status and decide what to do next: metrics, trends, items needing attention.
```
+------+-------------------------------------------------+
| logo | Page title        range: 30d v      [ Export ]  |
| nav  +-------------------------------------------------+
| nav  | KPI   | KPI   | KPI   | KPI        (one strip)  |
| nav  +-------------------------------------------------+
| nav  | main chart (2/3)         | needs attention (1/3)|
|      +--------------------------+----------------------+
| user | recent activity table                           |
+------+-------------------------------------------------+
```
**Density:** Sidebar 240px (64px collapsed), 24px page padding, 16px gaps, KPI strip 96px tall, table rows 40px, 8px grid.
**Don't:** Open with a welcome banner, put one number per card with a decorative icon, or show six chart types on one screen. Lead with the question the user came to answer.

## List/detail
**Use when:** Browsing a collection and acting on one item at a time: inbox, tickets, customers, files.
```
+------+----------------------+--------------------------+
| nav  | search     [ + New ] | Title             [...]  |
|      | filter chips         | status - owner - date    |
|      |----------------------|--------------------------|
|      | > item (selected)    | ~~~~~~~~~~~~~~~~~~~~~~~~ |
|      |   item               | tabs: Activity | Files   |
|      |   item               | ~~~~~~~~~~~~~~~~~~~~~~~~ |
+------+----------------------+--------------------------+
```
**Density:** List pane 360px with 56px two-line rows; detail pane fluid with a 720px reading max; 16px padding.
**Don't:** Navigate away on every click (keep the list and scroll position), or hide the selected state. On narrow screens, stack list then detail with a back button.

## Table + filters
**Use when:** Many records, comparison across columns, bulk actions: orders, users, transactions.
```
+------+-------------------------------------------------+
| nav  | Orders (1,204)    [ search ]       [ Export ]    |
|      | [Status v] [Date v] [Owner v]   clear filters    |
|      |-------------------------------------------------|
|      | [ ] ID     Customer     Status    Amount   ...   |
|      | [ ] 1042   Ana Ruiz     Paid      $120.00        |
|      | [ ] 1041   Kofi Mensah  Pending   $48.00         |
|      |        < 1 2 3 >      rows per page: 25 v        |
+------+-------------------------------------------------+
```
**Density:** Rows 40px (32px compact toggle), cell padding 12px horizontal, header 36px and sticky, 8px grid; amounts right-aligned in tabular numerals.
**Don't:** Truncate the identifying column, hide filters in a modal, or reset filters on page change. A bulk-action bar replaces the toolbar when rows are selected.

## Settings
**Use when:** Configuring an account, workspace or integration; many unrelated options, rarely visited.
```
+------+------------+------------------------------------+
| nav  | Profile    | Profile                            |
|      | Security   | Name        [ Ana Ruiz          ]  |
|      | Billing    | Email       [ ana@example.com   ]  |
|      | Team       | ---------------------------------- |
|      | API keys   | Notifications                      |
|      | Danger     | Email me about  [x] mentions       |
|      |            |                  [ ] weekly digest |
|      |            |              [ Save changes ]      |
+------+------------+------------------------------------+
```
**Density:** Settings nav 200px, form column max 640px, rows 56px (label above or left 160px), sections separated by 32px and a divider, 8px grid.
**Don't:** Put each section in its own card, scatter save buttons, or bury destructive actions among normal ones. Group them last, with a confirmation that names the thing.

## Form/wizard
**Use when:** A task with several inputs that must be completed once: create a project, checkout, apply, set up a payment.
```
+--------------------------------------------------------+
| Back          Step 2 of 4: Details       Save & exit   |
| [====----------]                                       |
+--------------------------------------------------------+
|            Question as a heading                       |
|            Label                                       |
|            [ input                              ]      |
|            helper text or inline error                 |
|                                                        |
|            [ Back ]                    [ Continue ]    |
+--------------------------------------------------------+
```
**Density:** Single column 480px, inputs 44px tall, 24px between fields, 40px between groups, buttons 44px; labels always visible.
**Don't:** Use placeholders as labels, clear the form on error, or ask for what you can infer. Validate on blur and write errors as "what to do". Show a summary before the final submit.

## Empty state
**Use when:** A screen has no data yet, a search has no results, or access is missing.
```
+--------------------------------------------------------+
| Projects                              [ + New project ]|
+--------------------------------------------------------+
|                                                        |
|     [ small illustration or icon, optional ]           |
|     No projects yet                                    |
|     One sentence on what a project is for.             |
|     [ Create project ]   or  Import from CSV           |
|                                                        |
+--------------------------------------------------------+
```
**Density:** Content block max 360px, 16px between lines, 24px above the action; keep the page header, filters and navigation visible so the frame does not jump.
**Don't:** Use a bare "No data", a giant graphic, or a button that does something else. For no-results, name the query and offer to clear filters.

## Auth
**Use when:** Sign in, sign up, reset password, verify.
```
+------------------------------+-------------------------+
|                              | logo                    |
|  brand panel (optional)      |                         |
|  one real sentence           | Sign in                 |
|                              | Email    [           ]  |
|                              | Password [           ]  |
|                              | [ Sign in ]             |
|                              | Forgot?  Create account |
+------------------------------+-------------------------+
```
**Density:** Form column 360px, fields 44px, 16px between fields, 24px above the primary button; the brand panel hides under 900px.
**Don't:** Add a carousel of testimonials, disable paste in the password field, or give an error that reveals whether an account exists. Offer SSO buttons only if they work.

## Onboarding
**Use when:** First run: collect the minimum, then land the user in a useful, partly filled product.
```
+--------------------------------------------------------+
| logo                                  Skip for now     |
+--------------------------------------------------------+
|  Welcome, Ana. Let's set up your workspace.            |
|  [x] 1 Name your workspace                             |
|  [ ] 2 Invite two people                               |
|  [ ] 3 Connect a data source                           |
|                          +------------------------+    |
|  [ Continue ]            | live preview of result |    |
|                          +------------------------+    |
+--------------------------------------------------------+
```
**Density:** Checklist rows 48px, content column 520px, preview 360px, 24px gaps; each step finishes in under a minute.
**Don't:** Force a product tour with overlays on every element, ask for more than 3 things before value, or lock Skip. Every skipped step stays reachable from the checklist.

## Kanban board
**Use when:** Work moves through stages and people move it by hand: tasks, deals, hiring.
```
+------+-------------------------------------------------+
| nav  | Board    filter  group   [ + Add ]              |
|      | To do (4)  | Doing (2)  | Review (1) | Done (9)  |
|      | [card]     | [card]     | [card]     | [card]    |
|      | [card]     | [card]     |            | [card]    |
|      | [card]     |            |            | ...       |
+------+-------------------------------------------------+
```
**Density:** Columns 300px, cards 72px minimum with 8px gaps, 12px card padding, column header 40px; show 4 fields at most per card.
**Don't:** Put cards inside a card-like column box (use a tinted column, no border), or rely on drag only. Provide a menu and keyboard move.

## Record detail
**Use when:** One entity with many facets: a customer, an order, a device, a patient.
```
+------+-------------------------------------------------+
| nav  | < Customers     Ana Ruiz   [Active]  [ Edit ]    |
|      | tabs: Overview | Orders | Notes | Activity       |
|      |-------------------------------+-----------------|
|      | summary fields (2 columns)    | side facts      |
|      | related table                 | owner, tags     |
|      |                               | timeline        |
+------+-------------------------------------------------+
```
**Density:** Label/value rows 32px, main column fluid, side rail 320px, tabs 44px tall, 24px between groups.
**Don't:** Show every field at once, hide the primary identifier on scroll, or split one entity over several pages with no breadcrumb.

## Inbox / thread
**Use when:** Conversation-based work: support, chat, comments, approvals.
```
+------+------------------+-------------------------------+
| nav  | Open (12)  Mine  | Subject - requester           |
|      | * thread  2m     | message                       |
|      |   thread  1h     | message (you)                 |
|      |   thread  3h     |-------------------------------|
|      |                  | [ reply box        ] [ Send ] |
+------+------------------+-------------------------------+
```
**Density:** Thread rows 64px, message gap 12px within a sender and 24px between senders, composer min-height 96px, pane widths 320px and fluid.
**Don't:** Auto-mark as read on load without a hint, hide timestamps, or animate every new message. Unread is bold plus a dot, never color alone.

## Mobile tab app
**Use when:** Phone-first products with 3-5 top-level destinations.
```
+-------------------------+
| Title              [+]  |
|-------------------------|
| list or content         |
| row                     |
| row                     |
| row                     |
|                         |
|-------------------------|
| Home  Search  Inbox  Me |
+-------------------------+
```
**Density:** Rows 56px, 16px side padding, tab bar 56px plus safe area, targets 44px, body 16px.
**Don't:** Use more than 5 tabs, put the primary action in the top corner out of thumb reach, or hide text labels on tabs.

## Command center
**Use when:** Live operations where time matters: monitoring, dispatch, trading, security.
```
+------+-------------------------------------------------+
| top: status - time - search/Cmd+K     [ Alerts 3 ]       |
+------+------------------+------------------------------+
| rail | live queue       | map / chart / timeline       |
|      | row (critical)   |                              |
|      | row              |------------------------------|
|      | row              | selected item detail         |
+------+------------------+------------------------------+
```
**Density:** Rows 32px, panels separated by 1px borders, 8px grid, gaps 8px, text 13-14px with a 4.5:1 floor; status uses color plus icon plus label.
**Don't:** Animate rows constantly, hide old alerts without a history, or add shadows and glows; mark the selected item with a surface step and a 1px border, and status with a solid color plus icon.
