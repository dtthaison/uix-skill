---
version: alpha
name: Ledger
description: A bookkeeping workspace for small finance teams.
colors:
  primary: "#0B6B4F"
  on-primary: "#FFFFFF"
  neutral: "#F3F6F3"
  surface: "#FFFFFF"
  on-surface: "#13201B"
  muted: "#4A5A53"
  border: "#D3DBD6"
typography:
  headline-lg:
    fontFamily: IBM Plex Serif
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  headline-md:
    fontFamily: IBM Plex Serif
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.3
  figure:
    fontFamily: IBM Plex Mono
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: "tnum"
rounded:
  sm: 4px
  md: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 44px
  button-primary-hover:
    backgroundColor: "#095A42"
    textColor: "{colors.on-primary}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 44px
  page:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
  column-head:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.label-md}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  ledger-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.figure}"
    padding: 12px
---

## Overview

Ledger is a calm, exact workspace for people who reconcile accounts all day. It should feel like a well-kept paper ledger: dense where the data is, quiet everywhere else. Colors come from the `fintech-ledger-green` row in `data/palettes.csv`. Fonts come from the `plex-family` row in `data/fonts.csv`.

## Colors

- **Primary (#0B6B4F):** deep ledger green. Used only for the main action on a screen and for positive deltas.
- **Neutral (#F3F6F3):** cool paper behind everything.
- **Surface (#FFFFFF):** tables, forms and panels.
- **On-surface (#13201B):** a green-tinted near-black for text.
- **Muted (#4A5A53):** secondary text and column heads. It clears 4.5:1 on both neutral and surface.
- **Border (#D3DBD6):** hairlines between rows.

Negative amounts use the text color with a minus sign and the word "debit" in the column. Color never carries the meaning alone.

## Typography

IBM Plex Serif sets page titles. IBM Plex Sans sets everything else. IBM Plex Mono with tabular figures sets every amount so columns line up. Use at most three weights per screen.

## Layout

A 4px base unit. Content sits in a 1120px max-width column with 24px gutters. Tables run the full column width. Forms stay under 560px wide.

## Elevation & Depth

Depth is flat. Panels are separated by a 1px border in the border color and by the paper background. Only menus and dialogs get a soft shadow.

## Shapes

Inputs use a 4px radius. Buttons and panels use 8px. Nothing is a pill except status chips.

## Components

Buttons are 44px tall with a label in `label-md`. The hover state darkens the primary. Ledger rows use the mono figure style and a hairline divider. Inputs show a 2px primary focus ring and a text error under the field.

## Do's and Don'ts

- Do right-align amounts and use tabular figures.
- Do pair every colored status with a word.
- Don't put cards inside cards. Use dividers.
- Don't use a second accent color.
