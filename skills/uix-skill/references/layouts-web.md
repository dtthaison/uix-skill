# Web page structures

For marketing, content and catalog pages. Pick the structure from the job of the page, not from habit. Vary structures across a site. For app screens use `layouts-app.md`. Wireframes are schematic; `[ ]` is a block, `~~~` is text.

## Split hero
**Use when:** One product or offer, with a visual that explains it (screenshot, photo, device).
```
+--------------------------------------------------------+
| logo        nav  nav  nav                    [ CTA ]   |
+--------------------------------------------------------+
| Headline, two lines        | +----------------------+  |
| ~~~~~~~~~~~~~~~~~~~~~~~~   | |                      |  |
| [ Primary ]  link          | |   real product UI    |  |
|                            | +----------------------+  |
+--------------------------------------------------------+
| proof row: 3 real numbers or logos                     |
+--------------------------------------------------------+
```
**Hero:** Text left (5 cols), real visual right (7 cols), bottom-aligned to the same baseline. The visual bleeds off the right edge.
**Don't:** Center the text over the visual, use a stock illustration, or add a floating badge row.

## Editorial long-read
**Use when:** A story, essay, case study or announcement that is read top to bottom.
```
+--------------------------------------------------------+
|  Title, large serif                                    |
|  byline - date - reading time                          |
+--------------------------------------------------------+
|  [ full-width image + caption ]                        |
|        ~~~~~~~~~~~~~~~~~~~~~~~~ (65ch)                 |
|        ~~~~~~~~~~~~~~~~~~~~~~~~                        |
|   "pull quote" offset into the margin                  |
|        ~~~~~~~~~~~~~~~~~~~~~~~~                        |
+--------------------------------------------------------+
```
**Hero:** Title block plus one strong image. No CTA above the fold; the invitation comes after the reader has earned it.
**Don't:** Break the text into cards, interrupt every screen with a subscribe bar, or exceed 75ch.

## Product tour
**Use when:** The product has 3-5 distinct capabilities that each need to be seen working.
```
+--------------------------------------------------------+
| headline + one line          [ Start ]                 |
+--------------------------------------------------------+
| 01 Capture      ~~~~~~~~      +------------------+      |
|                               |   screen / loop  |      |
+--------------------------------------------------------+
|      +------------------+     02 Organize ~~~~~~~       |
|      |   screen / loop  |                              |
+--------------------------------------------------------+
| 03 Share ...  (alternate sides)       [ Start ]        |
+--------------------------------------------------------+
```
**Hero:** Short headline with one real screen. Each step then pairs one claim with one real screenshot, alternating sides.
**Don't:** Use identical icon-tile grids for the features, or show mockups with lorem ipsum.

## Pricing-led
**Use when:** Visitors arrive to compare plans; price is the main question.
```
+--------------------------------------------------------+
| Plain headline: what you pay for     [monthly|annual]  |
+--------------------------------------------------------+
| Free        | Team (highlighted) | Business | Custom     |
| $0          | $12 / seat         | $29      | Talk       |
| - feature   | - feature          | - ...    |            |
| [ Start ]   | [ Start trial ]    | [ Start ]| [ Sales ]  |
+--------------------------------------------------------+
| full comparison table, sticky header                   |
| FAQ in two columns                                     |
+--------------------------------------------------------+
```
**Hero:** Headline and the plan grid are the hero. Price, billing unit and the top three differences are visible without scrolling.
**Don't:** Hide the price, invent testimonials, or highlight every plan.

## Docs-style
**Use when:** The page is a reference people search: docs, help center, API, handbook.
```
+--------------------------------------------------------+
| logo      [ search  /  ]               version  theme  |
+----------+---------------------------+-----------------+
| nav tree | # Page title              | On this page    |
| > Start  | ~~~~~~~~~~~~~~~~~~~~~~~~~ | - Install       |
| > Guides | [ code block     copy ]   | - Config        |
| > API    | ~~~~~~~~~~~~~~~~~~~~~~~~~ | - Errors        |
|          | prev <-            -> next|                 |
+----------+---------------------------+-----------------+
```
**Hero:** No hero. Search is the first thing; below it, the 4-6 tasks readers do most.
**Don't:** Put marketing blocks in the nav, make the sidebar scroll with the page, or hide code behind tabs by default.

## Index / catalog
**Use when:** Many items (products, projects, articles, tools) and the user must scan and filter.
```
+--------------------------------------------------------+
| Catalog title   (240)   [ search ]  sort: newest v     |
+------------+-------------------------------------------+
| Filters    | [img] name   meta   | [img] name   meta   |
| [x] type   | [img] name   meta   | [img] name   meta   |
| [ ] year   | [img] name   meta   | [img] name   meta   |
| [ ] tag    |         pagination  1 2 3 ...             |
+------------+-------------------------------------------+
```
**Hero:** A title, a result count and the search field. Skip imagery; the items are the content.
**Don't:** Put promotional banners between rows, use infinite scroll with no footer, or hide the filters on desktop.

## Statement hero
**Use when:** A brand or campaign with one memorable sentence and little to explain.
```
+--------------------------------------------------------+
|  nav                                          [ CTA ]  |
|                                                        |
|         One bold sentence, set very large              |
|              [ Primary ]                               |
|                                                        |
+--------------------------------------------------------+
| three short paragraphs, left aligned, 2 columns        |
+--------------------------------------------------------+
```
**Hero:** Full-width centered statement in oversized type on a flat color. Only the hero is centered; everything below is left-aligned.
**Don't:** Add a gradient wash, a secondary CTA row and a badge. One sentence, one button.

## Full-bleed visual
**Use when:** Photography or film is the product: travel, hospitality, food, events.
```
+--------------------------------------------------------+
| [ full-bleed image / loop, 85vh ]                      |
|                                                        |
|          Name, centered over scrim                     |
|                         [ Book ]                       |
+--------------------------------------------------------+
| intro 2 cols | detail facts: when, where, how much     |
+--------------------------------------------------------+
```
**Hero:** Full-width centered title over real photography with a measured scrim (text 4.5:1). Facts follow immediately.
**Don't:** Use a stock image, autoplay audio, or hide the booking action below the fold.

## Case study
**Use when:** One project told as problem, work and result; agency and portfolio pages.
```
+--------------------------------------------------------+
| Client - Role - Year          [ next case -> ]         |
| Big title                                              |
+--------------------------------------------------------+
| [ cover image, full width ]                            |
+--------------------------------------------------------+
| Problem  | ~~~~~~~~~~~~~~~~~~                          |
| Process  | [img] [img]  ~~~~~~~~~                      |
| Result   | 3 numbers (real) + [ final image ]          |
+--------------------------------------------------------+
```
**Hero:** Metadata line, a short title and a cover image that shows the actual work.
**Don't:** Invent results, hide the author's role, or cut every image into the same rounded tile.

## Waitlist
**Use when:** Pre-launch: one action, a promise, and a reason to trust it.
```
+--------------------------------------------------------+
| logo                                                   |
|                                                        |
| What it is, in 8 words        | [ screenshot or sketch ]|
| One sentence of why           |                        |
| [ email        ] [ Join ]     |                        |
| quiet note on data use        |                        |
+--------------------------------------------------------+
```
**Hero:** Two-column: one promise and one field on the left, honest preview on the right. No nav.
**Don't:** Fake a count of people on the list, or show a success state the server did not confirm.

## Comparison
**Use when:** The visitor is choosing between you and an alternative, or between two approaches.
```
+--------------------------------------------------------+
| A vs B: the honest answer                              |
+--------------------------------------------------------+
|              |   Us        |   Them                    |
| Price        |   ...       |   ...                     |
| Setup time   |   ...       |   ...                     |
| Limits       |   ...       |   ...                     |
+--------------------------------------------------------+
| When to pick them | When to pick us    [ CTA ]         |
+--------------------------------------------------------+
```
**Hero:** A direct title and a one-sentence verdict, then the table. Name where the alternative is better.
**Don't:** Fill the table with check marks only, or claim a win on every row.

## Portfolio grid
**Use when:** Visual work (photo, design, illustration) is the argument.
```
+--------------------------------------------------------+
| Name           Work  About  Contact                    |
+--------------------------------------------------------+
| [   tall   ] [  wide        ] [ sq ]                   |
| [          ] [              ] [ sq ]                   |
| [ sq ] [ sq ] [  wide        ]                         |
|                    title - year on hover/focus         |
+--------------------------------------------------------+
```
**Hero:** No hero text beyond the name and one line. The first row of work is the hero.
**Don't:** Hide the project title until hover only, crop faces, or use autoplay on every tile.

## Storefront
**Use when:** Selling physical or digital goods with a browsable range.
```
+--------------------------------------------------------+
| logo   Shop  Journal  About      search   bag(2)       |
+--------------------------------------------------------+
| [ featured product, large ]  | New in                  |
|                              | [p] [p]  [p] [p]        |
+--------------------------------------------------------+
| category row: 4 labeled photos                         |
| delivery - returns - care (3 plain facts)              |
+--------------------------------------------------------+
```
**Hero:** A featured product at full resolution beside a short "new in" list. No carousel.
**Don't:** Show a countdown timer that resets, fake scarcity, or crowd the header with promotions.

## Event / schedule
**Use when:** A conference, launch or class series where time and place matter most.
```
+--------------------------------------------------------+
| Event name        12-14 Mar - City      [ Register ]   |
+--------------------------------------------------------+
| Day 1 | Day 2 | Day 3                                  |
| 09:00 | Opening talk        Hall A    speaker          |
| 10:30 | Workshop            Room 2    speaker          |
| 12:00 | Lunch                                          |
+--------------------------------------------------------+
| speakers (photo + role)   venue + map   sponsors       |
+--------------------------------------------------------+
```
**Hero:** Name, date, place and the register action in one strip. The schedule starts straight away.
**Don't:** Bury the date, list unnamed speakers, or use a countdown as decoration.

## Changelog feed
**Use when:** A product that ships often and wants to show momentum with substance.
```
+--------------------------------------------------------+
| Changelog                         [ subscribe via RSS ]|
+--------------------------------------------------------+
| 12 Mar |  v2.4  Faster imports                         |
|        |  ~~~~~~~~ [ screenshot ]                      |
| 02 Mar |  v2.3  Keyboard shortcuts                     |
|        |  ~~~~~~~~                                     |
| 14 Feb |  ...                                          |
+--------------------------------------------------------+
```
**Hero:** A title and a feed subscription. The newest entry starts immediately.
**Don't:** Write release notes as marketing copy, or leave out dates and versions.

## Directory with map
**Use when:** Places or people tied to location: stores, clinics, branches, listings.
```
+--------------------------------------------------------+
| [ search place / postcode ]    filters: open now, type |
+---------------------------+----------------------------+
| result card   0.4 km      |                            |
| result card   0.9 km      |      [   map   ]           |
| result card   1.2 km      |                            |
+---------------------------+----------------------------+
```
**Hero:** The search field and the map are the hero. No headline above them.
**Don't:** Put the list below the map on desktop, or require an account before searching.

## Manifesto scroll
**Use when:** A mission-led brand with a handful of principles and little product to show.
```
+--------------------------------------------------------+
| 01  Principle one, big                                 |
|     ~~~~~~~~~~~~~~~~~ (right column)                   |
+--------------------------------------------------------+
| 02  Principle two, big                                 |
|     ~~~~~~~~~~~~~~~~~                                  |
+--------------------------------------------------------+
| 03  ...                         [ Join us ]            |
+--------------------------------------------------------+
```
**Hero:** The first principle as a headline, no image. Number the principles; each one gets a full-height band.
**Don't:** Use abstract stock imagery, or make every band the same color.

## Left-rail landing
**Use when:** A reference-heavy brand or portfolio where persistent navigation helps and the page is dense.
```
+--------+-----------------------------------------------+
| logo   | Headline and one paragraph                    |
|        |-----------------------------------------------|
| About  | [ item ][ item ][ item ]                      |
| Work   | [ item ][ item ][ item ]                      |
| Notes  |-----------------------------------------------|
| Contact| contact line and links                        |
+--------+-----------------------------------------------+
```
**Hero:** A fixed 220px left rail carries identity and nav; the main column opens with a text headline, not an image.
**Don't:** Collapse the rail into a hamburger on desktop, or repeat the nav in the footer.

## Centered pitch
**Use when:** A simple tool with one clear benefit and one action; short pages for broad audiences.
```
+--------------------------------------------------------+
| logo                                       [ Sign in ] |
|                                                        |
|           Benefit headline, two lines                  |
|        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~              |
|                  [ Get started ]                       |
|        [ screenshot, full width, cropped ]             |
+--------------------------------------------------------+
| 3 steps, left aligned, numbered                        |
+--------------------------------------------------------+
```
**Hero:** Full-width centered headline, one sentence, one button, and a cropped real screenshot below. Sections below leave the center axis.
**Don't:** Add logos you do not have, a gradient blob, or more than one primary button.
