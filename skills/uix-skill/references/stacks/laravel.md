---
stack: laravel
kind: web
check: browser
---

# Laravel (Blade + Vite)

## Setup tokens from DESIGN.md

```
npx --yes @google/design.md@0.4.0 export --format css-tailwind DESIGN.md > resources/css/theme.css
```

```css
/* resources/css/app.css */
@import "tailwindcss";
@import "./theme.css";
@source "../views/**/*.blade.php";
@source "../js/**/*.js";
```

```blade
{{-- resources/views/layouts/app.blade.php, inside <head> --}}
@vite(['resources/css/app.css', 'resources/js/app.js'])
```

`@source` tells Tailwind v4 to scan Blade files. Load the fonts with `@font-face` or a `<link>` and add fallbacks to the exported `--font-*` values.

## Components

- Blade components (`<x-button>`) in `resources/views/components`. Use `@props([...])` and `$attributes->merge(['class' => '...'])` so callers can extend classes.
- Use slots (`{{ $slot }}`) and named slots for structure; use `@forelse` so every list has an empty state.
- Forms: `@csrf`, `old('field')`, and `@error('field')` messages as text under the input with `aria-describedby`.
- Interactivity: Livewire or Alpine; keep it small.
- Cover hover, `focus-visible`, disabled, loading (`wire:loading`) and error states.

## Motion

CSS transitions with token utilities. Alpine's `x-transition` accepts duration/scale modifiers (`x-transition.duration.200ms`); start from `scale-95`, never zero. Add the `prefers-reduced-motion` block from motion.md to `app.css`.

## Accessibility

- Layout has `<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">`, one `h1`, a `main` landmark and a skip link.
- Flash messages and validation summaries get `role="alert"` or `aria-live`.
- Icon-only buttons need `aria-label`; never emoji icons.

## Gotchas

- Without `@source`, utilities used only in Blade files may be missing.
- Class names assembled in PHP (`"bg-{$color}"`) are not detected. Map to whole class strings.
- Escape with `{{ }}`; use `{!! !!}` only on trusted HTML.
- Changes to CSS need `npm run dev` (or `npm run build`) running.

## How to check

```
node <skill>/scripts/rules.mjs --design DESIGN.md resources
node <skill>/scripts/check.mjs http://localhost:8000
```

`rules.mjs` is the static check; `check.mjs` renders the page at 375, 768 and 1280 px and prints JSON. Read the JSON, fix errors before warnings, and stop after at most 2 repair rounds.

Run `npm run dev` and `php artisan serve` (port 8000) first. `rules.mjs` also scans `.blade.php`.
