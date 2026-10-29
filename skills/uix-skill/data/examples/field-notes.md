---
version: alpha
name: Field Notes
description: An independent magazine about tools and the people who make them.
colors:
  primary: "#BE185D"
  on-primary: "#FFFFFF"
  paper: "#FAF9F9"
  surface: "#FFFFFF"
  ink: "#1D1A1C"
  muted: "#5E5659"
  rule: "#E3DDDF"
typography:
  display:
    fontFamily: Literata
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: -0.02em
  headline:
    fontFamily: Literata
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.2
  body-lg:
    fontFamily: Literata
    fontSize: 19px
    fontWeight: 400
    lineHeight: 1.65
  ui-sm:
    fontFamily: Onest
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  none: 0px
  sm: 2px
spacing:
  sm: 8px
  md: 16px
  lg: 32px
  xl: 72px
  measure: 66ch
components:
  page:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
  article-title:
    textColor: "{colors.ink}"
    typography: "{typography.display}"
  byline:
    textColor: "{colors.muted}"
    typography: "{typography.ui-sm}"
  pull-link:
    textColor: "{colors.primary}"
    typography: "{typography.ui-sm}"
  subscribe-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.ui-sm}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 44px
  note-box:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: 24px
  hairline:
    backgroundColor: "{colors.rule}"
    height: 1px
---

## Overview

Field Notes is a reading-first magazine site. The page should feel like a well-set printed essay: one column, generous margins, nothing that competes with the text. Colors come from the `cli-ink-rose` row in `data/palettes.csv`. Fonts come from the `literata-onest` row in `data/fonts.csv`.

## Colors

- **Primary (#BE185D):** rose. Links, the subscribe button and nothing else.
- **Paper (#FAF9F9):** the page.
- **Ink (#1D1A1C):** body text, tinted toward the rose.
- **Muted (#5E5659):** bylines and dates. It passes 4.5:1 on paper.
- **Rule (#E3DDDF):** hairlines between stories.

## Typography

Literata carries the reading experience: display titles, headlines and body at 19px. Onest handles small interface text such as bylines, nav and buttons. Titles are sentence case. No uppercase labels and no eyebrows above headings.

## Layout

One text column, 66 characters wide, centered on the page. Story lists use a two-column grid on desktop and one column on phones. Space between stories is 72px. Left-align everything except the masthead.

## Elevation & Depth

None. Hairlines and white space do the work. No shadows anywhere.

## Shapes

Corners are square or 2px. A note box has no radius and sits on a white surface with a hairline border.

## Components

The subscribe button appears once, at the end of an article, next to a sentence that says what the reader receives. Bylines sit under titles in muted Onest. Links are rose and underlined. Images carry a visible caption with the credit.

## Do's and Don'ts

- Do keep lines near 66 characters.
- Do give every image a caption and alt text.
- Don't center body text.
- Don't put a newsletter box on every page.
