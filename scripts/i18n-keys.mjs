// Clés de traduction utilisées par le code : premier argument (chaîne
// littérale) des appels t(…) / msg(…) dans le renderer, tm(…) / msg(…) dans
// le processus principal. Partagé par tests/renderer/i18n.test.ts et
// scripts/i18n-template.mjs, pour qu'ils aient la même idée d'une clé « utilisée ».
import fs from 'node:fs';
import path from 'node:path';

/** Dossiers scannés et fonctions de traduction, par section des fichiers de langue. */
export const SECTIONS = {
  ui: { dir: 'src/renderer/src', fns: ['t', 'msg'] },
  main: { dir: 'src/main', fns: ['tm', 'msg'] },
};

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'dist' || entry.name === 'node_modules' ? [] : sourceFiles(full);
    // i18n.ts définit t / tm : ce n'est pas un appel.
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') && entry.name !== 'i18n.ts' ? [full] : [];
  });
}

/**
 * Clés des appels `fn('…')` / `fn("…")` d'un dossier, avec leur emplacement.
 * Un appel dont le premier argument n'est pas une chaîne littérale est listé
 * dans `nonLiteral` : sa clé serait introuvable.
 */
export function collectKeys(root, dir, fns) {
  const keys = new Map();
  const nonLiteral = [];
  for (const fn of fns) {
    const call = new RegExp(`(?<![\\w.$])${fn}\\(\\s*`, 'g');
    for (const file of sourceFiles(path.join(root, dir))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(call)) {
        const start = match.index + match[0].length;
        const where = `${path.relative(root, file).replace(/\\/g, '/')}:${text.slice(0, start).split('\n').length}`;
        const quote = text[start];
        if (quote !== "'" && quote !== '"') {
          nonLiteral.push(where);
          continue;
        }
        let key = '';
        for (let i = start + 1; i < text.length && text[i] !== quote; i++) {
          if (text[i] === '\\') {
            const next = text[++i];
            key += next === 'n' ? '\n' : next;
          } else key += text[i];
        }
        keys.set(key, where);
      }
    }
  }
  return { keys, nonLiteral };
}

/** Clés utilisées par section (`ui`, `main`). */
export function collectAllKeys(root) {
  return Object.fromEntries(Object.entries(SECTIONS).map(([section, { dir, fns }]) => [section, collectKeys(root, dir, fns)]));
}

/** Noms des `{paramètres}` d'un texte, triés. */
export const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
