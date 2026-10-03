import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MESSAGES } from '../../src/renderer/src/lib/i18n/messages';
import { MAIN_MESSAGES } from '../../src/main/messages';
import { interpolate, resolveUiLanguage, setUiLanguage, t } from '../../src/renderer/src/lib/i18n';

const ROOT = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'dist' || entry.name === 'node_modules' ? [] : sourceFiles(full);
    // i18n.ts définit t / tm : ce n'est pas un appel.
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') && entry.name !== 'i18n.ts' ? [full] : [];
  });
}

/**
 * Clés des appels `fn('…')` / `fn("…")`. Un appel dont le premier argument
 * n'est pas une chaîne littérale est une erreur : sa clé serait introuvable.
 */
function collectKeys(dir: string, fn: string): { keys: Map<string, string>; nonLiteral: string[] } {
  const keys = new Map<string, string>();
  const nonLiteral: string[] = [];
  const call = new RegExp(`(?<![\\w.$])${fn}\\(\\s*`, 'g');
  for (const file of sourceFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(call)) {
      const start = match.index! + match[0].length;
      const where = `${path.relative(ROOT, file)}:${text.slice(0, start).split('\n').length}`;
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
  return { keys, nonLiteral };
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

function checkCatalog(dir: string, fns: string[], catalog: Record<string, { en: string; ja: string }>) {
  const keys = new Map<string, string>();
  const nonLiteral: string[] = [];
  for (const fn of fns) {
    const found = collectKeys(dir, fn);
    found.keys.forEach((where, key) => keys.set(key, where));
    nonLiteral.push(...found.nonLiteral);
  }
  const fn = fns.join('/');
  expect(nonLiteral, `${fn}() doit recevoir une chaîne littérale`).toEqual([]);
  const missing = [...keys].filter(([key]) => !catalog[key]?.en || !catalog[key]?.ja).map(([key, where]) => `${where} ${key}`);
  expect(missing, 'clés sans traduction anglaise ou japonaise').toEqual([]);
  const unused = Object.keys(catalog).filter(key => !keys.has(key));
  expect(unused, 'traductions jamais utilisées').toEqual([]);
  const badParams = Object.entries(catalog)
    .filter(([key, value]) => JSON.stringify(placeholders(key)) !== JSON.stringify(placeholders(value.en)) || JSON.stringify(placeholders(key)) !== JSON.stringify(placeholders(value.ja)))
    .map(([key]) => key);
  expect(badParams, 'paramètres {…} différents entre le français et une traduction').toEqual([]);
}

describe('resolveUiLanguage', () => {
  it('suit le choix des Paramètres', () => {
    expect(resolveUiLanguage('ja', ['fr-FR'])).toBe('ja');
    expect(resolveUiLanguage('fr', ['en-US'])).toBe('fr');
  });

  it('prend la langue du système si fr, en ou ja, sinon l\'anglais', () => {
    expect(resolveUiLanguage('system', ['fr-CA', 'en-US'])).toBe('fr');
    expect(resolveUiLanguage('system', ['ja'])).toBe('ja');
    expect(resolveUiLanguage(undefined, ['en-GB'])).toBe('en');
    expect(resolveUiLanguage('system', ['de-DE', 'fr-FR'])).toBe('en');
    expect(resolveUiLanguage('system', [])).toBe('en');
  });
});

describe('t', () => {
  it('rend le français tel quel et interpole les paramètres', () => {
    setUiLanguage('fr');
    expect(t('{n} œuvres', { n: 3 })).toBe('3 œuvres');
    expect(interpolate('{a} et {b}', { a: 1 })).toBe('1 et {b}');
  });
});

describe('catalogues de traduction', () => {
  it('interface : chaque t(…) a sa traduction anglaise et japonaise', () => {
    // msg(…) déclare une clé traduite plus tard par tr(variable).
    checkCatalog(path.join(ROOT, 'src/renderer/src'), ['t', 'msg'], MESSAGES);
  });

  it('processus principal : chaque tm(…) a sa traduction anglaise et japonaise', () => {
    checkCatalog(path.join(ROOT, 'src/main'), ['tm', 'msg'], MAIN_MESSAGES);
  });
});
