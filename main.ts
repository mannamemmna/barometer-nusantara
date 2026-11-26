// Barometer Nusantara — national statistics portal entry for make.fun.
// Indonesia's official indicators across three decades (1996–2025), frozen from the World Bank Open Data API
// on 2026-11-26. Pure static frontend: hash-routed SPA in vanilla ES modules (app/), hand-rolled accessible SVG charts,
// 28-indicator matrix table with year-range sliders, multi-column sort, row search, and offline CSV download via Blob.
// Zero network requests at runtime; responsive from desktop (1280x800) down to phone (390x844).
//
// This build program packages app/ and screenshots/ to MAKEFUN_OUTPUT_DIR (defaults to /output) and writes dossier.json
// via the byte-identical vendor/makefun-frontend.ts helper. Run locally:
//   node serve.ts --port 8080
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Pre-flight: the app must ship the seven site files and no stray data drop (_data_raw.json lives outside app/
// on purpose — only data.js ships). Fail loudly here rather than handing the judge a half-site.
const EXPECTED_APP = new Set(['index.html', 'style.css', 'main.js', 'views.js', 'charts.js', 'table.js', 'data.js']);
const appFiles = readdirSync(join(here, 'app'));
const missing = [...EXPECTED_APP].filter((f) => !appFiles.includes(f));
if (missing.length) throw new Error(`app/ is missing ${missing.join(', ')}`);
const extras = appFiles.filter((f) => !EXPECTED_APP.has(f));
if (extras.length) throw new Error(`app/ holds unexpected files: ${extras.join(', ')}`);

// Pre-flight 2: check screenshot counts and ensure no individual file exceeds the 256 KiB gate limit.
const shotFiles = existsSync(join(here, 'screenshots')) ? readdirSync(join(here, 'screenshots')) : [];
if (shotFiles.length === 0) throw new Error('screenshots/ is empty: at least 1 screenshot is required');
if (shotFiles.length > 4) throw new Error(`screenshots/ has ${shotFiles.length} files, exceeding the 4-shot cap`);
for (const sf of shotFiles) {
  const sz = statSync(join(here, 'screenshots', sf)).size;
  if (sz > 262144) throw new Error(`screenshot ${sf} is ${sz} bytes, over the 256 KiB cap`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry
// the scorer would refuse anyway (more than 4 screenshots or one over 256 KiB; more than 993 files and
// directories in app/ or 16 MiB of app files). app/ here is 7 files, so the counts are far inside every limit.
const appCount = (() => {
  const walk = (dir: string): number =>
    readdirSync(dir).reduce((n, f) => n + 1 + (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : 0), 0);
  return walk(join(out, 'app'));
})();
if (appCount > 993) throw new Error(`app/ has ${appCount} entries, over the scorer's 993 cap`);

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 16777216 }),
);
const cover = [...shotFiles].sort()[0];
console.log(`dossier written to ${join(out, 'dossier.json')} — ${appCount} app entries, ${shotFiles.length} screenshots (cover: ${cover})`);
