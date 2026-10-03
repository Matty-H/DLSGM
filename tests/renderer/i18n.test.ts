import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectAllKeys, placeholders } from '../../scripts/i18n-keys.mjs';
import { updateLocale } from '../../scripts/i18n-template.mjs';
import { buildCatalog, lookup, matchLanguage, parseLocaleFile, resolveLanguage, type LocaleFile } from '../../src/shared/locales';
import { interpolate, resolveUiLanguage, setUiLanguage, t, uiLanguages, uiLocale } from '../../src/renderer/src/lib/i18n';
import { makeTempDir } from '../helpers';

vi.mock('electron', () => ({ app: { getAppPath: () => ROOT, getPreferredSystemLanguages: () => ['de-DE'], getLocale: () => 'de' } }));

const ROOT = path.resolve(__dirname, '../..');
const LOCALES = path.join(ROOT, 'locales');
/** Langues qui doivent rester traduites à 100 %. */
const COMPLETE = ['en', 'ja'];
const SECTIONS = ['ui', 'main'] as const;

const used = collectAllKeys(ROOT);
const localeFiles = fs.readdirSync(LOCALES).filter(name => name.endsWith('.json'));

const file = (code: string, ui: Record<string, string> = {}, main: Record<string, string> = {}, locale = code) => ({
  language: { name: code.toUpperCase(), locale },
  ui,
  main
});

describe('choix de la langue', () => {
  const { catalog } = buildCatalog({ en: file('en', { Oui: 'Yes', Non: 'No' }, {}, 'en-US'), ja: file('ja', { Oui: 'はい' }), de: file('de', { Oui: 'Ja', Vide: '' }), 'pt-BR': file('pt-BR') });

  it('suit le choix des Paramètres s\'il existe', () => {
    expect(resolveLanguage('ja', ['fr-FR'], catalog)).toBe('ja');
    expect(resolveLanguage('fr', ['en-US'], catalog)).toBe('fr');
    expect(resolveLanguage('de', ['en-US'], catalog)).toBe('de');
    // Fichier retiré depuis : comme « système ».
    expect(resolveLanguage('es', ['fr-FR'], catalog)).toBe('fr');
  });

  it('prend la langue du système si l\'interface y est traduite, sinon l\'anglais', () => {
    expect(resolveLanguage('system', ['fr-CA', 'en-US'], catalog)).toBe('fr');
    expect(resolveLanguage('system', ['ja'], catalog)).toBe('ja');
    expect(resolveLanguage(undefined, ['en-GB'], catalog)).toBe('en');
    expect(resolveLanguage('system', ['de-DE', 'fr-FR'], catalog)).toBe('de');
    expect(resolveLanguage('system', ['es-ES', 'fr-FR'], catalog)).toBe('en');
    expect(resolveLanguage('system', [], catalog)).toBe('en');
  });

  it('rapproche les variantes régionales', () => {
    const codes = ['fr', 'en', 'pt-BR', 'zh-Hans', 'zh-Hant'];
    expect(matchLanguage('pt', codes)).toBe('pt-BR');
    expect(matchLanguage('pt-PT', codes)).toBe('pt-BR');
    expect(matchLanguage('zh-Hant-TW', codes)).toBe('zh-Hant');
    expect(matchLanguage('PT-br', codes)).toBe('pt-BR');
    expect(matchLanguage('es', codes)).toBeNull();
  });

  it('sans fichier anglais, se replie sur le français', () => {
    expect(resolveLanguage('system', ['de-DE'], buildCatalog({}).catalog)).toBe('fr');
  });

  it('liste le français, l\'anglais puis les autres par code', () => {
    expect(catalog.languages.map(language => language.code)).toEqual(['fr', 'en', 'de', 'ja', 'pt-BR']);
  });
});

describe('traductions partielles', () => {
  const { catalog } = buildCatalog({ en: file('en', { Oui: 'Yes', Non: 'No' }), de: file('de', { Oui: 'Ja', Non: '' }) });

  it('texte absent ou vide : anglais, puis le français', () => {
    expect(lookup(catalog, 'de', 'ui', 'Oui')).toBe('Ja');
    expect(lookup(catalog, 'de', 'ui', 'Non')).toBe('No');
    expect(lookup(catalog, 'de', 'ui', 'Peut-être')).toBe('Peut-être');
    expect(lookup(catalog, 'fr', 'ui', 'Oui')).toBe('Oui');
    expect(lookup(catalog, 'de', 'main', 'Oui')).toBe('Oui');
    expect(lookup(catalog, 'de', 'ui', 'constructor')).toBe('constructor');
  });
});

describe('fichiers de langue invalides', () => {
  it('sont ignorés et signalés, sans empêcher les autres', () => {
    const { catalog, errors } = buildCatalog({
      en: file('en'),
      fr: file('fr'),
      Deutsch: file('de'),
      es: { language: { name: 'Español', locale: 'pas une locale !' }, ui: {} },
      it: { language: { name: 'Italiano', locale: 'it-IT' }, ui: { Oui: 3 } }
    });
    expect(catalog.languages.map(language => language.code)).toEqual(['fr', 'en']);
    expect(errors).toHaveLength(4);
  });

  it('une section absente compte comme vide', () => {
    expect(parseLocaleFile('de', { language: { name: 'Deutsch', locale: 'de-DE' } })).toEqual({ language: { name: 'Deutsch', locale: 'de-DE' }, ui: {}, main: {} });
  });
});

describe('t', () => {
  it('rend le français tel quel et interpole les paramètres', () => {
    setUiLanguage('fr');
    expect(t('{n} œuvres', { n: 3 })).toBe('3 œuvres');
    expect(interpolate('{a} et {b}', { a: 1 })).toBe('1 et {b}');
  });

  it('lit les fichiers de locales/ (embarqués par Vite)', () => {
    setUiLanguage('ja');
    expect(t('Paramètres')).toBe('設定');
    expect(uiLocale()).toBe('ja-JP');
    setUiLanguage('en');
    expect(t('{n} œuvres', { n: 3 })).toBe('3 works');
    expect(resolveUiLanguage('system', ['en-US'])).toBe('en');
    setUiLanguage('fr');
    expect(uiLocale()).toBe('fr-FR');
  });
});

describe('processus principal', () => {
  it('lit les mêmes fichiers que le renderer et traduit la section main', async () => {
    const { loadLocales, setMainLanguage, tm } = await import('../../src/main/i18n');
    const { catalog, errors } = loadLocales(LOCALES);
    expect(errors).toEqual([]);
    expect(catalog.languages).toEqual(uiLanguages());
    expect(setMainLanguage('ja')).toBe('ja');
    // Même clé, traduction propre à chaque section.
    expect(tm('Mettre à jour')).toBe('更新する');
    expect(catalog.files.get('ja')!.ui['Mettre à jour']).toBe('更新');
    setMainLanguage('fr');
  });

  it('ignore un fichier illisible', async () => {
    const { loadLocales } = await import('../../src/main/i18n');
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify(file('en', {}, { Oui: 'Yes' })));
    fs.writeFileSync(path.join(dir, 'de.json'), '{ "language": ');
    const { catalog, errors } = loadLocales(dir);
    expect(catalog.languages.map(language => language.code)).toEqual(['fr', 'en']);
    expect(errors).toHaveLength(1);
  });
});

describe('fichiers de locales/', () => {
  it('chaque appel t(…) / tm(…) / msg(…) reçoit une chaîne littérale', () => {
    expect([...used.ui.nonLiteral, ...used.main.nonLiteral]).toEqual([]);
  });

  it('existent pour les langues complètes', () => {
    for (const code of COMPLETE) expect(localeFiles).toContain(`${code}.json`);
  });

  for (const name of localeFiles) {
    const code = name.slice(0, -'.json'.length);
    describe(name, () => {
      const text = fs.readFileSync(path.join(LOCALES, name), 'utf8');
      const data = JSON.parse(text);
      const parsed = parseLocaleFile(code, data);

      it('est un fichier de langue valide', () => {
        expect(typeof parsed === 'string' ? parsed : null).toBeNull();
        expect(Object.keys(data).filter(key => !['language', 'ui', 'main', 'obsolete'].includes(key))).toEqual([]);
      });

      it('ne contient que des clés utilisées par le code', () => {
        const unknown = SECTIONS.flatMap(section => Object.keys(data[section] ?? {}).filter(key => !used[section].keys.has(key)).map(key => `[${section}] ${key}`));
        expect(unknown, 'clés inconnues (npm run i18n:template les range dans « obsolete »)').toEqual([]);
      });

      it('garde les {paramètres} du texte français', () => {
        const bad = SECTIONS.flatMap(section =>
          Object.entries((data[section] ?? {}) as Record<string, string>)
            .filter(([key, value]) => value && placeholders(key).join() !== placeholders(value).join())
            .map(([key]) => `[${section}] ${key}`)
        );
        expect(bad).toEqual([]);
      });

      if (COMPLETE.includes(code)) {
        it('est complet, trié et sans « obsolete »', () => {
          const file = parsed as LocaleFile;
          const missing = SECTIONS.flatMap(section => [...used[section].keys].filter(([key]) => !file[section][key]).map(([key, where]) => `${where} ${key}`));
          expect(missing, `clés sans traduction (${code})`).toEqual([]);
          expect(data.obsolete).toBeUndefined();
          for (const section of SECTIONS) expect(Object.keys(data[section])).toEqual(Object.keys(data[section]).sort());
        });
      } else {
        it('taux de traduction (informatif)', () => {
          const file = parsed as LocaleFile;
          const total = used.ui.keys.size + used.main.keys.size;
          const done = SECTIONS.reduce((sum, section) => sum + [...used[section].keys.keys()].filter(key => file[section][key]).length, 0);
          console.info(`[i18n] ${name} : ${done}/${total} textes traduits (${Math.floor((done / total) * 100)} %), le reste s'affiche en anglais`);
        });
      }
    });
  }
});

describe('modèle de traduction (npm run i18n:template)', () => {
  const keys = { ui: ['Oui', 'Non', '{n} jeux'], main: ['Quitter'] };

  it('crée un fichier complet aux valeurs vides, clés triées, nom et locale devinés', () => {
    const { data, report } = updateLocale(null, 'de', keys);
    expect(data.language).toEqual({ name: 'Deutsch', locale: 'de-DE' });
    expect(Object.entries(data.ui)).toEqual([['Non', ''], ['Oui', ''], ['{n} jeux', '']]);
    expect(data.main).toEqual({ Quitter: '' });
    expect(data.obsolete).toBeUndefined();
    expect(report.sections.ui).toEqual({ total: 3, translated: 0, added: 3 });
  });

  it('garde les traductions, range les clés obsolètes et signale les {paramètres} perdus', () => {
    const existing = { language: { name: 'Deutsch (Test)', locale: 'de-AT' }, ui: { Oui: 'Ja', '{n} jeux': 'Spiele', Ancien: 'Alt' }, main: {} };
    const { data, report } = updateLocale(existing, 'de', keys);
    expect(data.language).toEqual(existing.language);
    expect(data.ui).toEqual({ Non: '', Oui: 'Ja', '{n} jeux': 'Spiele' });
    expect(data.obsolete).toEqual({ ui: { Ancien: 'Alt' } });
    expect(report.obsolete).toEqual([{ section: 'ui', key: 'Ancien' }]);
    expect(report.badParams).toEqual([{ section: 'ui', key: '{n} jeux' }]);
  });

  it('remet une traduction obsolète quand sa clé revient', () => {
    const { data, report } = updateLocale({ ui: { Oui: '' }, obsolete: { ui: { Oui: 'Ja' } } }, 'de', keys);
    expect(data.ui.Oui).toBe('Ja');
    expect(data.obsolete).toBeUndefined();
    expect(report.restored).toEqual([{ section: 'ui', key: 'Oui' }]);
  });

  it('en ligne de commande, crée un fichier valide qui couvre toutes les clés', () => {
    const dir = makeTempDir();
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/i18n-template.mjs'), 'de', '--locales', dir]);
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'de.json'), 'utf8'));
    expect(parseLocaleFile('de', data)).not.toBeTypeOf('string');
    expect(Object.keys(data.ui).length).toBe(used.ui.keys.size);
    expect(Object.keys(data.main).length).toBe(used.main.keys.size);
    // Relancé sur un fichier modifié, il garde le travail du traducteur.
    data.ui['Paramètres'] = 'Einstellungen';
    fs.writeFileSync(path.join(dir, 'de.json'), JSON.stringify(data));
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/i18n-template.mjs'), 'de', '--locales', dir]);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'de.json'), 'utf8')).ui['Paramètres']).toBe('Einstellungen');
  });

  it('refuse le français et un code invalide', () => {
    for (const code of ['fr', 'Deutsch']) {
      expect(() => execFileSync(process.execPath, [path.join(ROOT, 'scripts/i18n-template.mjs'), code, '--locales', makeTempDir()], { stdio: 'pipe' })).toThrow();
    }
  });
});
