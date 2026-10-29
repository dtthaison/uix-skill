# Images

Every image slot gets a real image or real art. Never a gray box.

## The order

1. **Project assets.** Look in the repo first (`public/`, `assets/`, the user's own files). Use them when they fit.
2. **Openverse or Wikimedia with credit.** Search with the script below. Free, no key.
3. **CSS or SVG art.** When nothing fits, draw it (recipes below). Do not leave an empty frame, and do not use a `placeholder.com` URL.

Never invent a photo of a real person, product or place you cannot show.

## Finding images

From the skill folder:

```bash
node <skill>/scripts/images.mjs "harbor fishing boats at dawn" --count 6
```

It prints JSON: `{"images":[{url, thumbnail, title, creator, license, licenseUrl, source, landingUrl, credit}]}`. Pick the one that fits the subject and the crop. Prefer landscape for heroes. Use `url` in the page. Download it into the project's assets folder rather than hotlinking, when you can. Always set meaningful `alt` text yourself. Resize images to about 2x their display width and do not hotlink originals (`check.mjs` warns with `heavy-image`).

Search in plain nouns and a mood ("empty desk, morning light"), not brand names. If you get no results, try broader words once, then go to tier 3.

## Native apps

- Bundle images in the asset catalog (iOS) or the platform's resource folder.
- Convert WebP to PNG or JPEG before bundling. On a Mac, `sips -s format png in.webp --out out.png` works, and so does `dwebp in.webp -o out.png` if `dwebp` is installed.
- Product photos from a remote store are downloaded once at build time and bundled. Never hotlink them at run time, unless the app has a backend that serves them.

## Credit

Put each credit where a visitor can see it:

- A `<figcaption>` under the image, or a small caption on it.
- Or a "Credits" section in the footer listing every image.
- Use the script's `credit` string, and link `landingUrl` or `licenseUrl` when it fits.
- Never only an HTML comment. A comment is not credit.

```html
<figure>
  <img src="/img/coast.jpg" alt="Small boats moored in a calm harbor at dawn" width="1200" height="800">
  <figcaption>Photo: Jane Doe, CC BY 4.0, via Openverse</figcaption>
</figure>
```

Set `width` and `height` (or `aspect-ratio`) so layout does not jump, and `loading="lazy"` below the fold.

## CSS and SVG art recipes

Use palette tokens. Keep them quiet so text stays readable.

**Tonal field with grain.** A solid surface plus a faint noise or dot pattern.
```css
.art-dots { background: var(--surface); background-image: radial-gradient(var(--border) 1px, transparent 1.5px); background-size: 16px 16px; }
```

**Horizon stripes** (two tonal bands, no purple gradients).
```css
.art-horizon { background: linear-gradient(var(--bg) 0 55%, var(--border) 55% 70%, var(--accent) 70%); }
```

**Concentric circles** (SVG).
```html
<svg viewBox="0 0 200 200" role="img" aria-label="Concentric rings"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="100" cy="100" r="30"/><circle cx="100" cy="100" r="60"/><circle cx="100" cy="100" r="90"/></g></svg>
```

**Blueprint grid.** Thin lines on a tint, for technical products.
```css
.art-grid { background-color: var(--surface); background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px); background-size: 24px 24px; }
```

**Waves** (SVG path as a footer divider).
```html
<svg viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40 Q150 0 300 40 T600 40 T900 40 T1200 40 V80 H0Z" fill="currentColor"/></svg>
```

Mark art as decorative (`aria-hidden="true"` or `role="img"` with a label) and test contrast of any text placed over it.
