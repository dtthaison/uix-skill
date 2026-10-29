---
stack: threejs
kind: web
check: browser
---

# Three.js

## Setup tokens from DESIGN.md

The scene is lit and colored in JS, the surrounding UI is HTML/CSS. Share one token source.

```
npx --yes @google/design.md@0.4.0 export --format css-vars DESIGN.md > src/theme.css
```

```js
import * as THREE from 'three';
const css = getComputedStyle(document.documentElement);
const token = (name) => new THREE.Color(css.getPropertyValue(name).trim());

const primary = token('--color-primary');
const material = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.6, metalness: 0.1 });
scene.background = token('--color-surface');
```

Color space: hex and CSS color strings are sRGB. `THREE.Color` converts them to the linear working space (color management is on by default since r152), and the renderer outputs sRGB (`renderer.outputColorSpace = THREE.SRGBColorSpace`, the default). Set `texture.colorSpace = THREE.SRGBColorSpace` on color textures, and leave data textures (normal, roughness) linear. Do not pass pre-linearised numbers to `setHex`. Re-read tokens when the theme switches.

## Components

- Keep one `renderer`, one `scene`, one `camera`; organise by object (a function returning a `Group`).
- Drive rendering with `renderer.setAnimationLoop`. Render on demand (only when something changed) for mostly static scenes.
- Cap pixel ratio: `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`. Resize through `ResizeObserver` on the container.
- Use flat, matte lighting (one key light, one hemisphere light). Bloom and neon material tricks are decoration; skip them.
- Dispose of geometries, materials and textures you remove (`.dispose()`).

## Motion

Scene motion is a loop, so gate it. Read `matchMedia('(prefers-reduced-motion: reduce)')`; when it matches, drop auto-rotation, camera drift and parallax and render a still frame or on user input only. Ease user-triggered camera moves with an ease-out curve over 300 to 500 ms. Pause the loop when the tab is hidden or the canvas is offscreen (`IntersectionObserver`).

## Accessibility

- A canvas is invisible to assistive tech. Give it `role="img"` with `aria-label`, plus a text description or data table nearby.
- Never make the canvas the only way to do something. Provide real buttons and keyboard controls for every interaction; do not rely on hover or drag.
- Overlay text and controls are HTML, with 4.5:1 contrast against the 3D background behind them.

## Gotchas

- Colors that look washed out or too dark usually mean a color-space mismatch (see Setup).
- Load heavy models with lazy loading and show a progress state; on failure show text, not a blank canvas.
- Leaks: every `new` geometry or material inside the loop adds up.
- Mobile GPUs: limit lights, shadows and post-processing.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md src
node <skill>/scripts/check.mjs http://localhost:5173
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.

The checker reads the DOM and a screenshot; scene pixels are not rule-checked, so look at the 375 px screenshot for a readable, non-empty canvas.
