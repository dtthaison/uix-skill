# Art directions

Offer the user three at `/uix init`. Pick them to differ in tone, density and color temperature, never three variations of one idea. Fit the audience and the screen's job first. Each direction names ids from `data/fonts.csv`, `data/palettes.csv` and `data/styles.csv`; read the rows for exact values. Where a direction adjusts a palette or style, the adjustment is stated. Every direction still obeys `anti-slop.md`. Motion in every direction animates `transform` and `opacity` only, and every direction honors `prefers-reduced-motion` (drop movement, keep fades). Depth comes from surface steps and 1px borders; status uses a solid color plus icon and label.

## Ledger Calm
**Feel:** Exact, quiet and trustworthy. Numbers are the hero; chrome stays out of the way.
**Type:** plex-family
**Palette:** fintech-ledger-green
**Style:** fintech-trust
**Layout:** Left rail plus a KPI strip, then one primary chart and a ledger table. Hairline dividers instead of cards. Tabular numerals, right-aligned amounts.
**Motion:** Number count-ups under 300ms, ease-out. Row hover 150ms. Nothing else moves.
**Best for:** Banking, accounting and billing dashboards; payment apps.
**Avoid when:** The brand must feel playful or youthful.

## Night Desk
**Feel:** A dense dark cockpit for people who stare at data all day.
**Type:** geist-geist
**Palette:** saas-dash-night
**Style:** data-dense-dashboard
**Layout:** Top bar with a command search, thin icon rail, 8px grid, 32px rows. Panels separated by 1px borders and surface steps, no shadows.
**Motion:** Panel and menu entrances 200ms ease-out from scale 0.96. Chart series fade in 250ms.
**Best for:** Analytics and operations dashboards, admin consoles, observability tools.
**Avoid when:** Casual or first-time users need hand-holding, or the audience is non-technical.

## Quiet Workspace
**Feel:** Calm paper-like productivity. Low noise, generous reading comfort, one blue for action.
**Type:** rethink-sans-duo
**Palette:** productivity-paper-blue
**Style:** calm-dashboard
**Layout:** Collapsible sidebar, single content column up to 720px for documents, side panel for detail. Spacing does the grouping.
**Motion:** Sidebar collapse 200ms ease-in-out. Menus fade in 150ms. No decorative loops.
**Best for:** Notes, task and project apps; team workspace dashboards.
**Avoid when:** The product needs to feel loud, rare or luxurious.

## Terminal Craft
**Feel:** Honest tooling. Monospace carries the voice, green on near-black signals "built by engineers".
**Type:** space-mono-ibm-plex
**Palette:** devtool-moss-terminal
**Style:** terminal-cli
**Layout:** Left-aligned, one 80ch column for prose, code blocks as the main visual. Command-line patterns for navigation. Sparse, no hero image.
**Motion:** Caret blink only on the focused input. Panels fade 150ms ease-out. Typing effects only for real output.
**Best for:** CLI, API and developer-tool landing pages; build and deploy dashboards.
**Avoid when:** Buyers are non-technical, or the page must feel friendly.

## Vault Brass
**Feel:** Private-banking restraint. Dark, warm, a little heavy, with brass used like jewelry.
**Type:** dmserif-text-instrument
**Palette:** fintech-vault-brass
**Style:** quiet-luxury
**Layout:** Wide margins, fewer items per row, one statement per viewport. Brass only on the primary action and hairline rules.
**Motion:** Slow fades 300ms ease-out, no sliding. Hover underlines grow 200ms.
**Best for:** Wealth management, premium cards and membership sites; portfolio app overviews.
**Avoid when:** Speed and density matter more than atmosphere.

## Broadsheet
**Feel:** Serious newsprint. Strong columns, rules, tight headlines and a clear order of importance.
**Type:** oswald-source-serif
**Palette:** editorial-broadsheet
**Style:** newspaper-broadsheet
**Layout:** Multi-column grid with column rules, one lead story at 2x size, sections labeled by running heads. Text first, images support.
**Motion:** Almost none. Link underline shift 150ms. Lazy image fade 200ms ease-out.
**Best for:** News sites, journals, long-form publishers.
**Avoid when:** Content is thin; this style punishes empty columns.

## Citrus Magazine
**Feel:** Confident cover-story energy. Big editorial serif, one sharp citrus accent, photography that bleeds.
**Type:** spectral-hanken
**Palette:** magazine-citrus-ink
**Style:** editorial-magazine
**Layout:** Asymmetric spreads: full-bleed photo, offset pull quote, narrow text column. Alternate left and right weights down the page.
**Motion:** Images reveal 300ms ease-out with a 4% translate. Pull quotes fade in as they enter.
**Best for:** Culture magazines, lifestyle brands, annual reports with a voice.
**Avoid when:** The screen is a tool; this is for reading, not operating.

## Civic Plain
**Feel:** Clear, neutral and fair. Anyone can use it on the first try, on any device.
**Type:** source-family
**Palette:** government-civic-navy
**Style:** government-plain
**Layout:** One column, big question per page for forms, visible step count, plain-language labels. Links underlined, focus rings thick.
**Motion:** None required. Disclosure panels open 150ms ease-out and respect reduced motion.
**Best for:** Public-service portals, benefit and permit apps, form-heavy flows.
**Avoid when:** The goal is to impress or to sell a lifestyle.

## Clinic Clear
**Feel:** Reassuring and readable. Soft mint, large text, no clutter, no clinical coldness.
**Type:** lexend-atkinson
**Palette:** health-clinic-mint
**Style:** healthcare-reassure
**Layout:** Large tap targets (48px), appointment and results as plain lists, one clear next step per screen. Body text 18px.
**Motion:** Gentle fades 200ms ease-out. No parallax, no autoplay.
**Best for:** Patient portals, booking apps, clinic and telehealth sites.
**Avoid when:** Users are clinicians who need maximum density (use Night Desk or Sand Analytics).

## Playground
**Feel:** Chunky, round and cheerful, built for small hands and short attention.
**Type:** fredoka-nunito
**Palette:** kids-gumdrop
**Style:** kid-friendly-chunky
**Layout:** Big rounded buttons, large illustrations, short copy, a visible progress path. Parent-facing controls are plain and separate.
**Motion:** Tap feedback scale to 0.97 in 150ms. Reward moments 300ms ease-out. No looping.
**Best for:** Children's learning apps, toy brands, family activity sites.
**Avoid when:** The buyer is an enterprise or the topic is serious.

## Neo Riso
**Feel:** Loud, flat and printed. Hard shadows, thick borders and one-off colors, with a human sense of humor.
**Type:** bricolage-instrument
**Palette:** agency-risograph
**Style:** neo-brutalism
**Layout:** Tilted sticker labels, 3px borders, offset 4px hard shadows, a broken grid with obvious gaps. Only the key panels get borders.
**Motion:** Buttons shift 2px with the shadow on press, 150ms ease-out. Stickers settle in 250ms.
**Best for:** Studios, indie products, campaigns, creator portfolios.
**Avoid when:** Trust and calm matter more than personality: finance, health, government.

## Noir Champagne
**Feel:** After-hours glamour. Warm near-black surfaces, pale gold, long-limbed serif caps.
**Type:** cormorant-jost
**Palette:** luxury-noir-champagne
**Style:** art-deco
**Layout:** Symmetric deco framing: thin double rules, stepped corners, centered title only on the opening block. Body stays left-aligned.
**Motion:** Slow 300ms fades with ease-out. Gold rules fade in 250ms.
**Best for:** Fine dining, hotels, jewelry, private-event invitations.
**Avoid when:** Information density is high or accessibility needs a bright theme.

## Cinema Wine
**Feel:** Dark theatre. Posters are the color; chrome is deep wine and nearly invisible.
**Type:** gloock-albert
**Palette:** streaming-cinema-wine
**Style:** cinematic-dark
**Layout:** Full-bleed key art, horizontal poster rails, overlay text on a scrim with measured contrast. Detail pages split art and metadata.
**Motion:** Rail items scale to 1.03 on focus in 200ms ease-out. Hero art crossfades 300ms.
**Best for:** Streaming apps, film and festival sites, trailers.
**Avoid when:** There is no strong imagery to carry the dark canvas.

## Arcade Teal
**Feel:** Pixel-edged and playful, bright teal accent on deep navy, with solid colors and no glow.
**Type:** bungee-barlow
**Palette:** games-arcade-teal
**Style:** pixel-art-8bit
**Layout:** Tile-based grid, stepped pixel borders, HUD-like stat bars, big title logos. Keep body copy in the plain sans.
**Motion:** Stepped sprite animations at 200ms. Score changes ease-out 250ms. No flashing above 3 Hz.
**Best for:** Game landing pages, esports and leaderboard dashboards, retro-themed apps.
**Avoid when:** The audience is conservative or the content is dense text.

## Studio Red
**Feel:** Late-night radio. Warm dark, one red record light, big type with waveform texture.
**Type:** syne-manrope
**Palette:** podcast-studio-red
**Style:** podcast-waveform
**Layout:** Episode list as the spine: large title, waveform strip, duration. Sticky mini-player. Host and guest photos in duotone.
**Motion:** Waveform progress is real playback. Player slides up 250ms ease-out. Cover art fades 200ms.
**Best for:** Podcasts, audio shows, a listening app.
**Avoid when:** There is no audio or voice at the center.

## Garage Night
**Feel:** Torque and tarmac. Condensed caps, hard angles, orange warning accents on graphite.
**Type:** barlow-condensed-barlow
**Palette:** automotive-garage-night
**Style:** automotive-performance
**Layout:** Wide spec tables, big numbers (0-100, torque), angled section edges, full-width hero photograph with the spec rail beneath.
**Motion:** Spec numbers count up in 300ms ease-out. Image pans slowly 8% on scroll, off for reduced motion.
**Best for:** Performance cars, parts retailers, workshop booking apps.
**Avoid when:** The brand is gentle, family-first or eco-minded.

## Storm Glance
**Feel:** Glanceable at arm's length. Big temperature, quiet storm-blue night, color only where the weather changes.
**Type:** sora-nunito-sans
**Palette:** weather-storm-night
**Style:** weather-glance
**Layout:** One hero reading, an hourly strip, a 7-day list. Cards are not nested. Radar is a full-bleed layer with a floating legend.
**Motion:** Hourly strip scrolls with snap. Radar frames step every 250ms. Values cross-fade 200ms ease-out.
**Best for:** Weather, tide and flight-status apps; ambient dashboards.
**Avoid when:** Users need precise data tables over a quick answer.

## Watchtower
**Feel:** Security operations. Deep teal-black surfaces, solid status colors reserved for real alerts, monospace for IDs.
**Type:** chivo-mono-chivo
**Palette:** cybersecurity-watch
**Style:** dark-mode-first
**Layout:** Alert queue left, event timeline center, entity detail right. Severity uses color plus icon plus label. The active critical alert gets a surface step and a 1px status-color border.
**Motion:** New alerts slide in 200ms ease-out, highlight fades over 300ms. No continuous pulsing.
**Best for:** SOC dashboards, threat-intel consoles, incident apps.
**Avoid when:** The audience is general consumers; the alarm-heavy status colors will read as noise.

## Focus Dark
**Feel:** Keyboard-first and fast. Everything is a command, panels are quiet, the cursor is the star.
**Type:** hanken-fira
**Palette:** productivity-focus-dark
**Style:** command-palette-first
**Layout:** Empty-feeling canvas with a command palette on Cmd+K, list-first views with 36px rows, details in a right drawer, shortcuts shown inline.
**Motion:** Palette opens 150ms ease-out from scale 0.96. List navigation has no animation.
**Best for:** Issue trackers, note apps, developer workspaces and admin tools.
**Avoid when:** Users are mouse-only or new to the domain.

## Chambers
**Feel:** Formal and unhurried. Serif authority, pale warm stone, dark ink and a leather-brown accent, no decoration that cannot be explained.
**Type:** libre-baskerville-lato
**Palette:** legal-chambers
**Style:** legal-formal
**Layout:** Left-aligned, justified-feeling text at 65ch, numbered sections, a practice-area index, named people with credentials.
**Motion:** None beyond 150ms link and focus states.
**Best for:** Law firms, notaries, compliance and policy pages.
**Avoid when:** The audience expects warmth or fast self-serve flows.

## Sand Analytics
**Feel:** Warm, light analytics. Sand paper, ink text, charts that read like a printed report.
**Type:** plus-jakarta-pair
**Palette:** analytics-sand-ink
**Style:** saas-product-led
**Layout:** Report layout: title, 3 headline numbers, charts at two widths, annotated insights beneath each chart. Filters in a single bar.
**Motion:** Chart marks fade up 250ms ease-out, staggered so the whole set finishes within 400ms.
**Best for:** BI dashboards, marketing reports, SaaS analytics product pages.
**Avoid when:** The data is real-time and dense; use Night Desk.

## Dispatch
**Feel:** Industrial and legible. Condensed type, hazard-amber states, built for gloves and sunlight.
**Type:** archivo-narrow-archivo
**Palette:** logistics-dispatch
**Style:** industrial-utility
**Layout:** Map plus queue split, status chips with icons, 44px+ rows, big primary buttons at thumb reach. Tables with sticky first column.
**Motion:** Status changes flash a 200ms ease-out highlight. Map pins fade in, no bouncing.
**Best for:** Logistics and fleet dashboards, warehouse apps, field-service tools.
**Avoid when:** Brand-led storytelling is the goal.

## Docs Chalk
**Feel:** Teal on chalk. A reference that respects the reader's time and eyes.
**Type:** red-hat-pair
**Palette:** devtool-chalk-teal
**Style:** documentation-clean
**Layout:** Three columns: nav tree, content at 72ch, on-this-page rail. Code blocks with copy, callouts only for warnings. Search first.
**Motion:** Anchor scroll smooth 200ms ease-out, off for reduced motion. Copy confirmation 150ms.
**Best for:** Docs sites, API references, knowledge bases, a help-center app.
**Avoid when:** Marketing needs a dramatic first screen.

## Swiss Steel
**Feel:** Neutral grid, steel blue, no ornament. Corporate in the best sense: orderly, auditable.
**Type:** helvetica-neue-sys
**Palette:** enterprise-b2b-steel
**Style:** swiss-international
**Layout:** Strict 12-column grid, flush-left ragged-right text, one accent for actions, sectioned tables for admin screens. Large numerals as hierarchy.
**Motion:** Only state changes: 150ms ease-out. Dropdowns fade 150ms.
**Best for:** Enterprise admin dashboards, B2B product pages, procurement apps.
**Avoid when:** The audience expects personality or the product is consumer-facing.

## Hearth
**Feel:** Warm and human. Real faces, earth tones, a call to give that does not guilt.
**Type:** atkinson-literata
**Palette:** nonprofit-hearth
**Style:** nonprofit-story
**Layout:** Story-first: a named person, a number with its source, then the ask. Donation form is one column with preset amounts. Photography is real.
**Motion:** Fade-ins 250ms ease-out as sections enter. Progress bar fills once.
**Best for:** Nonprofits, campaigns, community projects.
**Avoid when:** There are no real stories or numbers to show; invented proof is banned.

## Gallery Wall
**Feel:** The work is the exhibit. Off-white walls, thin captions, nothing competes with the art.
**Type:** newsreader-work-sans
**Palette:** museum-gallery-wall
**Style:** museum-collection
**Layout:** Masonry-free uniform rows, object pages with image left and caption plate right, filters by period and medium. Captions at 14px.
**Motion:** Image zoom 300ms ease-out on open. Hover reveals the caption with a 150ms fade.
**Best for:** Museums, archives, photographers, collection catalogs.
**Avoid when:** There are few objects or no good photography.
