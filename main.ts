// Solara Bay — gta6-01 entry program (Node 22, standard library only).
//
// The game lives in game/ beside this file as plain static files a desktop
// browser loads offline (game/index.html, its ES modules and the vendored
// three.js build, no network request). This program hands it in: it copies
// game/ and screenshots/ into /output and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun dossier library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json): the dossier must be byte for
// byte what buildDossier writes with these, so they are fixed here.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Revision pass (2026-11-18, recorded session): the entrypoint now checks its
// inputs before handing the game in, so a broken tree fails loudly here
// instead of shipping an empty /output to the judge.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('Solara Bay: game/index.html is missing — refusing an empty entry.');
}
if (!existsSync(join(here, 'game', 'src', 'main.js'))) {
  throw new Error('Solara Bay: game/src/main.js is missing — refusing an empty entry.');
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_LIMITS));
