#!/usr/bin/env node
// Modèle de traduction : `npm run i18n:template <code>` crée ou complète
// locales/<code>.json (voir TRANSLATING.md). Toutes les clés utilisées par le
// code, triées, avec une valeur vide pour celles qui manquent ; les
// traductions existantes sont gardées ; les clés que le code n'utilise plus
// passent dans « obsolete » (rien n'est perdu). Messages en anglais : ce
// script s'adresse aux traducteurs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectAllKeys, placeholders, SECTIONS } from './i18n-keys.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

const sortKeys = object => Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]));

/** Nom de la langue dans cette langue (« Deutsch ») et locale avec région (de → de-DE). */
export function defaultLanguage(code) {
  let name = code;
  let locale = code;
  try {
    const native = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (native && native !== code) name = native.charAt(0).toLocaleUpperCase(code) + native.slice(1);
  } catch {
    // code inconnu d'ICU : le traducteur remplira le nom.
  }
  if (!code.includes('-')) {
    try {
      const maximized = new Intl.Locale(code).maximize();
      if (maximized.region) locale = `${maximized.language}-${maximized.region}`;
    } catch {
      // idem
    }
  }
  return { name, locale };
}

/**
 * Fichier de langue complété : `existing` est le contenu actuel (ou null),
 * `used` les clés utilisées par section. Renvoie le nouveau contenu et un bilan.
 */
export function updateLocale(existing, code, used) {
  const previous = existing && typeof existing === 'object' ? existing : {};
  const meta = previous.language && typeof previous.language === 'object' ? previous.language : {};
  const defaults = defaultLanguage(code);
  const data = {
    language: {
      name: typeof meta.name === 'string' && meta.name.trim() ? meta.name : defaults.name,
      locale: typeof meta.locale === 'string' && meta.locale.trim() ? meta.locale : defaults.locale,
    },
  };
  const obsolete = {};
  const report = { sections: {}, obsolete: [], restored: [], badParams: [] };
  for (const section of Object.keys(SECTIONS)) {
    const current = previous[section] && typeof previous[section] === 'object' ? previous[section] : {};
    const parked = previous.obsolete?.[section] && typeof previous.obsolete[section] === 'object' ? previous.obsolete[section] : {};
    const keys = new Set(used[section]);
    const out = {};
    let added = 0;
    for (const key of keys) {
      let text = typeof current[key] === 'string' ? current[key] : '';
      if (!text && typeof parked[key] === 'string' && parked[key]) {
        // Clé de nouveau utilisée : sa traduction mise de côté revient.
        text = parked[key];
        report.restored.push({ section, key });
      }
      if (!(key in current)) added++;
      out[key] = text;
      if (text && placeholders(key).join() !== placeholders(text).join()) report.badParams.push({ section, key });
    }
    const unused = {};
    for (const [key, text] of [...Object.entries(parked), ...Object.entries(current)]) {
      if (keys.has(key) || typeof text !== 'string' || !text) continue;
      unused[key] = text;
      if (key in current) report.obsolete.push({ section, key });
    }
    data[section] = sortKeys(out);
    if (Object.keys(unused).length > 0) obsolete[section] = sortKeys(unused);
    const translated = Object.values(out).filter(Boolean).length;
    report.sections[section] = { total: keys.size, translated, added };
  }
  if (Object.keys(obsolete).length > 0) data.obsolete = obsolete;
  return { data, report };
}

function run(args) {
  const localesIndex = args.indexOf('--locales');
  const localesDir = localesIndex >= 0 ? path.resolve(args[localesIndex + 1] ?? '') : path.join(ROOT, 'locales');
  const code = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--locales')[0];
  if (!code || !LANGUAGE_CODE.test(code)) {
    console.error('Usage: npm run i18n:template <language code>   (e.g. de, es, pt-BR)');
    return 1;
  }
  if (code === 'fr') {
    console.error('French is the source language: its texts are the keys, it has no file.');
    return 1;
  }
  const file = path.join(localesDir, `${code}.json`);
  let existing = null;
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      console.error(`${path.relative(process.cwd(), file)} is not valid JSON, nothing was changed:\n  ${error.message}`);
      return 1;
    }
  }
  const all = collectAllKeys(ROOT);
  const used = Object.fromEntries(Object.entries(all).map(([section, found]) => [section, [...found.keys.keys()]]));
  const { data, report } = updateLocale(existing, code, used);
  fs.mkdirSync(localesDir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

  console.log(`${existing ? 'Updated' : 'Created'} ${path.relative(process.cwd(), file)} — ${data.language.name} (${data.language.locale})`);
  for (const [section, { total, translated, added }] of Object.entries(report.sections)) {
    const percent = total ? Math.floor((translated / total) * 100) : 100;
    console.log(`  ${section.padEnd(4)} ${translated}/${total} translated (${percent} %)${added ? `, ${added} new empty entries` : ''}`);
  }
  for (const { section, key } of report.restored) console.log(`  restored from "obsolete": [${section}] ${key}`);
  if (report.obsolete.length > 0) {
    console.log(`  ${report.obsolete.length} entries are no longer used by the app and were moved to "obsolete" (ignored by the app):`);
    for (const { section, key } of report.obsolete) console.log(`    [${section}] ${key}`);
  }
  if (report.badParams.length > 0) {
    console.log('  These translations must keep exactly the same {placeholders} as the French text:');
    for (const { section, key } of report.badParams) console.log(`    [${section}] ${key}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = run(process.argv.slice(2));
}
