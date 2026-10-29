---
version: alpha
name: Harbor
description: A booking site for small-boat coastal trips.
colors:
  primary: "#0E7C86"
  on-primary: "#FFFFFF"
  sky: "#EFF8F7"
  surface: "#FFFFFF"
  deep: "#0B3434"
  muted: "#3F6A6A"
  tide: "#C4E2E1"
typography:
  display:
    fontFamily: DM Serif Display
    fontSize: 64px
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: -0.01em
  headline:
    fontFamily: DM Serif Display
    fontSize: 36px
    fontWeight: 400
    lineHeight: 1.15
  body-md:
    fontFamily: DM Sans
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: DM Sans
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.2
  price:
    fontFamily: DM Mono
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: 6px
  md: 14px
  full: 9999px
spacing:
  sm: 8px
  md: 16px
  lg: 32px
  xl: 96px
components:
  page:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.deep}"
    typography: "{typography.body-md}"
  hero-title:
    textColor: "{colors.deep}"
    typography: "{typography.display}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 14px
    height: 48px
  button-primary-hover:
    backgroundColor: "#0A6870"
    textColor: "{colors.on-primary}"
  trip-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.deep}"
    rounded: "{rounded.md}"
    padding: 24px
  trip-note:
    textColor: "{colors.muted}"
    typography: "{typography.body-md}"
  trip-price:
    textColor: "{colors.deep}"
    typography: "{typography.price}"
  step-rule:
    backgroundColor: "{colors.tide}"
    height: 2px
---

## Overview

Harbor sells small-boat day trips along one stretch of coast. The page is open and sunlit, with one big photograph and one clear action: pick a date. Colors come from the `travel-lagoon` row in `data/palettes.csv`. Fonts come from the `dmserif-dmsans` row in `data/fonts.csv`.

## Colors

- **Primary (#0E7C86):** lagoon teal. The booking button and the current step.
- **Sky (#EFF8F7):** the page background.
- **Surface (#FFFFFF):** the trip panel.
- **Deep (#0B3434):** text and the dark footer.
- **Muted (#3F6A6A):** notes under prices and trip details. It passes 4.5:1 on sky.
- **Tide (#C4E2E1):** step dividers and hairlines.

## Typography

DM Serif Display sets the hero and section headlines in sentence case. DM Sans sets body copy at 17px and button labels. DM Mono sets prices so they line up in lists.

## Layout

A 1200px max-width container. The hero is a two-column split: headline, one sentence and the button on the left; a real photograph on the right. Sections are separated by 96px. On phones the photo moves below the button.

## Elevation & Depth

Mostly flat. The trip panel floats on the sky background with a soft, low shadow tinted toward deep teal. Nothing else casts a shadow.

## Shapes

Panels use a 14px radius, small controls 6px, and the primary button is a pill. Images use the panel radius.

## Components

The primary button is 48px tall and appears in the hero and once at the end of the page. The trip panel holds a trip name, duration, price and a note. Steps in the booking flow are joined by tide-colored rules. Every photo has a caption with its credit.

## Do's and Don'ts

- Do show real photographs of the coast with credit.
- Do keep the hero to a headline, one sentence and one action.
- Don't invent testimonials or visitor counts.
- Don't use a gradient background.
