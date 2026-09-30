import type { GenreTranslations as GenreTranslationMap } from '../shared/ipc-types';
import type Store from './store';

/**
 * Dictionnaire des tags (genres DLsite) : clé = nom japonais, la langue de
 * référence des fiches ; valeur = traduction anglaise. Appris à chaque fetch
 * (genres appariés par identifiant DLsite entre la page japonaise et la page
 * anglaise), corrigeable à la main : une traduction manuelle n'est jamais
 * remplacée par DLsite. Un document par genre dans translations.db.
 *
 * Remplace les "genres liés" (groupes d'alias saisis à la main) : les paires
 * JP/EN déjà liées sont reprises une fois, au démarrage (`seed`).
 */

interface StoredTranslation {
  en: string;
  manual?: boolean;
}

/** Paires JP/EN vérifiées, reprises des anciens "genres liés" par défaut. */
export const KNOWN_GENRE_TRANSLATIONS: Record<string, string> = {
  '3D作品': '3D Works',
  'アナル': 'Anal',
  'アニメ': 'Anime',
  '巨乳/爆乳': 'Big Breasts',
  'フェラチオ': 'Blowjob / Fellatio',
  'おっぱい': 'Breasts',
  'おねショタ': 'Elder Girl x Younger Boy',
  '中出し': 'Internal Cumshot',
  '異種えっち': 'Interspecies Sex',
  'ラブラブ/あまあま': 'Lovey Dovey / Sweet Love',
  'お姉さん': 'Oneesan / Older Girl / Older Sister',
  '青姦': 'Outdoor',
  '妊娠/孕ませ': 'Pregnancy / Impregnation',
  '貧乳/微乳': 'Tiny Breasts',
  'おさわり': 'Touch / Feel',
  '処女': 'Virgin Female'
};

const JAPANESE = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/;

/** Paires JP → EN tirées d'anciens groupes de genres liés (un membre japonais, un non japonais). */
export function pairsFromAliasGroups(groups: unknown): Record<string, string> {
  const pairs: Record<string, string> = {};
  if (!Array.isArray(groups)) return pairs;
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    const japanese = group.find((g): g is string => typeof g === 'string' && JAPANESE.test(g));
    const english = group.find((g): g is string => typeof g === 'string' && g.trim() !== '' && !JAPANESE.test(g));
    if (japanese && english) pairs[japanese] = english;
  }
  return pairs;
}

export class GenreTranslations {
  constructor(private store: Store) {}

  async all(): Promise<GenreTranslationMap> {
    const docs = await this.store.getAll() as Record<string, StoredTranslation>;
    const result: GenreTranslationMap = {};
    for (const [japanese, value] of Object.entries(docs)) {
      if (value && typeof value.en === 'string') result[japanese] = { en: value.en, manual: value.manual === true };
    }
    return result;
  }

  /** Traductions de DLsite : ajoutées ou mises à jour, sauf là où l'utilisateur a choisi la sienne. */
  async learn(pairs: Record<string, string>): Promise<void> {
    for (const [japanese, english] of Object.entries(pairs)) {
      if (!japanese || !english) continue;
      const current = await this.store.get(japanese) as StoredTranslation | undefined;
      if (current?.manual || current?.en === english) continue;
      await this.store.set(japanese, { en: english } satisfies StoredTranslation);
    }
  }

  /** Traduction manuelle ; `null` retire le choix manuel (DLsite la réapprendra au prochain fetch). */
  async setManual(japanese: string, english: string | null): Promise<void> {
    const value = english?.trim();
    if (value) await this.store.set(japanese, { en: value, manual: true } satisfies StoredTranslation);
    else await this.store.delete(japanese);
  }

  /** Amorçage (premier démarrage, reprise des genres liés) : n'écrase rien d'existant. */
  async seed(pairs: Record<string, string>): Promise<void> {
    for (const [japanese, english] of Object.entries(pairs)) {
      await this.store.insert(japanese, { en: english } satisfies StoredTranslation);
    }
  }
}
