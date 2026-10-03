import { msg } from './i18n.js';
/** Options de la traduction à l'écran (Paramètres › Outils en jeu). */

// Libellés : clés de traduction, afficher avec tr().
export const OCR_SOURCE_LANGUAGES = [
  { value: 'ja', label: msg('Japonais') },
  { value: 'en-US', label: msg('Anglais') },
  { value: 'zh-Hans', label: msg('Chinois simplifié') },
  { value: 'zh-Hant', label: msg('Chinois traditionnel') },
  { value: 'ko', label: msg('Coréen') }
];

export const OCR_TARGET_LANGUAGES = [
  { value: 'fr', label: msg('Français') },
  { value: 'en', label: msg('Anglais') }
];

export const OCR_ENGINES = [
  { value: 'dictionary', label: msg('Dictionnaire (hors ligne)') },
  { value: 'none', label: msg('Aucune (texte lu)') },
  { value: 'local', label: msg('Serveur LLM local (avancé)') },
  { value: 'deepl', label: msg('DeepL (en ligne)') },
  { value: 'google', label: msg('Google (en ligne)') }
];

/**
 * La langue choisie est-elle installée pour l'OCR de Windows ? Windows
 * annonce `ja` ou `ja-JP`, `en-US`, `zh-Hans-CN`… : même langue de base
 * (et même écriture pour le chinois) suffit.
 */
export function ocrLanguageInstalled(installed: string[], wanted: string): boolean {
  const norm = (tag: string) => tag.toLowerCase().split('-');
  const [lang, script] = norm(wanted);
  return installed.some(tag => {
    const [l, s] = norm(tag);
    if (l !== lang) return false;
    return lang !== 'zh' || !script || s === script;
  });
}

/** Sens affiché sous un mot : la première traduction de ses deux premiers sens (« lire », « aujourd'hui · ce jour »). */
export function shortGloss(word: { senses: string[][]; kanji: { meanings: string[] }[] }): string {
  if (word.senses.length > 0) return [...new Set(word.senses.slice(0, 2).map(s => s[0]).filter(Boolean))].join(' · ');
  // Kanji isolé inconnu comme mot : son sens de kanji.
  return word.kanji.map(k => k.meanings[0]).filter(Boolean).join(' · ');
}
