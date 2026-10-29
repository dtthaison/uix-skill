import fs from 'node:fs/promises';
import path from 'node:path';

export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '.svelte-kit', '.output', 'coverage', '.uix',
  'out', '.turbo', '.vercel', 'storybook-static', 'vendor', 'Pods',
  'bin', 'obj', 'DerivedData', '.gradle', '.dart_tool',
]);

async function* walkDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walkDir(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

export async function* walkFiles(paths) {
  for (const p of paths) {
    const st = await fs.stat(p);
    if (st.isDirectory()) yield* walkDir(p);
    else yield p;
  }
}
