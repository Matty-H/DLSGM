/**
 * Certains jeux DLsite ont leurs genres scrapés en japonais, d'autres en
 * anglais (selon la langue active au moment du fetch) — un même genre peut
 * donc apparaître comme deux tags textuellement différents dans la
 * bibliothèque (ex: "Anal" / "アナル"). Un groupe lie ces variantes
 * ensemble ; le premier élément du groupe est le libellé canonique affiché
 * partout dans l'app (chips, filtres, statistiques).
 */
export type GenreAliasGroups = string[][];

/** Libellé canonique du genre donné (1er élément de son groupe), ou le genre lui-même si non lié. */
export function canonicalGenre(genre: string, groups: GenreAliasGroups): string {
  const group = groups.find(g => g.includes(genre));
  return group ? group[0] : genre;
}

/** Tous les alias (le canonique inclus) du genre canonique donné. */
export function aliasesFor(canonicalLabel: string, groups: GenreAliasGroups): string[] {
  const group = groups.find(g => g[0] === canonicalLabel);
  return group ? group : [canonicalLabel];
}

/** Liste dédupliquée et triée des libellés canoniques présents dans une liste de genres bruts. */
export function collectCanonicalGenres(rawGenres: string[], groups: GenreAliasGroups): string[] {
  const set = new Set(rawGenres.map(g => canonicalGenre(g, groups)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Lie `primary` et `secondary` (ou leurs groupes existants) en un seul
 * groupe, `primary` devenant/restant le libellé canonique affiché.
 */
export function linkGenres(groups: GenreAliasGroups, primary: string, secondary: string): GenreAliasGroups {
  if (primary === secondary) return groups;

  const primaryGroup = groups.find(g => g.includes(primary)) ?? [primary];
  const secondaryGroup = groups.find(g => g.includes(secondary)) ?? [secondary];
  if (primaryGroup === secondaryGroup) return groups;

  const seen = new Set<string>();
  const merged = [primary, ...primaryGroup, ...secondaryGroup].filter(g => (seen.has(g) ? false : (seen.add(g), true)));

  return [...groups.filter(g => g !== primaryGroup && g !== secondaryGroup), merged];
}

/** Dissout le groupe dont le libellé canonique est `canonicalLabel` (redevient des tags indépendants). */
export function unlinkGroup(groups: GenreAliasGroups, canonicalLabel: string): GenreAliasGroups {
  return groups.filter(g => g[0] !== canonicalLabel);
}

/** Vrai si `text` contient au moins un caractère japonais (hiragana/katakana/kanji). */
export function isJapaneseText(text: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/.test(text);
}

/**
 * Correspondances JP/EN identifiées avec confiance dans le vocabulaire de
 * genres DLsite (le même genre y est parfois donné en japonais, parfois en
 * anglais, selon la langue active au moment du fetch — voir README/commit).
 * Sert de point de départ par défaut ; l'utilisateur peut délier/relier
 * librement depuis Paramètres, qui écrase entièrement cette liste au premier
 * enregistrement.
 */
export const KNOWN_GENRE_PAIRS: GenreAliasGroups = [
  ['3D Works', '3D作品'],
  ['Anal', 'アナル'],
  ['Anime', 'アニメ'],
  ['Big Breasts', '巨乳/爆乳'],
  ['Blowjob / Fellatio', 'フェラチオ'],
  ['Breasts', 'おっぱい'],
  ['Elder Girl x Younger Boy', 'おねショタ'],
  ['Internal Cumshot', '中出し'],
  ['Interspecies Sex', '異種えっち'],
  ['Lovey Dovey / Sweet Love', 'ラブラブ/あまあま'],
  ['Oneesan / Older Girl / Older Sister', 'お姉さん'],
  ['Outdoor', '青姦'],
  ['Pregnancy / Impregnation', '妊娠/孕ませ'],
  ['Tiny Breasts', '貧乳/微乳'],
  ['Touch / Feel', 'おさわり'],
  ['Virgin Female', '処女']
];
