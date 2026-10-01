import type { DictKanji, DictToken } from '../shared/ipc-types';

/**
 * Dictionnaire japonais hors ligne, pour la traduction à l'écran « légère » :
 * pas une phrase traduite, mais le sens de chaque mot et de chaque kanji
 * (comme Yomichan / Jisho). Données JMdict (mots) et KANJIDIC2 (kanji) de
 * l'EDRDG, au format jmdict-simplified (CC BY-SA 4.0), téléchargées une fois
 * puis réduites en un index compact.
 *
 * Le texte est découpé par correspondance la plus longue, après avoir
 * ramené les verbes et adjectifs conjugués à leur forme du dictionnaire
 * (食べました → 食べる, 美味しかった → 美味しい).
 */

// --- Index compact ------------------------------------------------------------

export interface DictEntry {
  /** Formes en kanji, puis lectures en kana. */
  k: string[];
  r: string[];
  /** Natures (v1, v5k, adj-i, vs-i, n...) : valident une déconjugaison. */
  p: string[];
  /** Sens (chacun : quelques traductions), en anglais… */
  s: string[][];
  /** … et en français quand JMdict en a. */
  f?: string[][];
  /** Mot courant. */
  c?: 1;
}

export interface KanjiEntry {
  /** Sens anglais, et français quand KANJIDIC en a. */
  m: string[];
  mf?: string[];
  on: string[];
  kun: string[];
}

export interface DictIndex {
  version: string;
  entries: DictEntry[];
  /** Forme (kanji ou kana) → entrées. */
  forms: Record<string, number[]>;
  kanji: Record<string, KanjiEntry>;
}

// Format jmdict-simplified (seulement ce qui sert ici).
interface JmWord {
  id: string;
  kanji: { text: string; common: boolean }[];
  kana: { text: string; common: boolean }[];
  sense: { partOfSpeech: string[]; gloss: { text: string }[] }[];
}
interface JmDict {
  words: JmWord[];
}
interface KanjiDic {
  characters: {
    literal: string;
    readingMeaning: { groups: { readings: { type: string; value: string }[]; meanings: { lang: string; value: string }[] }[] } | null;
  }[];
}

const MAX_SENSES = 4;
const MAX_GLOSSES = 3;

const senses = (word: JmWord) => word.sense.slice(0, MAX_SENSES).map(s => s.gloss.slice(0, MAX_GLOSSES).map(g => g.text)).filter(s => s.length > 0);

/** JMdict anglais (complet) + français (partiel, mêmes IDs) + KANJIDIC2 → index compact. */
export function buildIndex(eng: JmDict, fre: JmDict | null, kanjidic: KanjiDic, version: string): DictIndex {
  const french = new Map((fre?.words ?? []).map(w => [w.id, senses(w)]));
  const entries: DictEntry[] = [];
  const forms: Record<string, number[]> = {};
  for (const word of eng.words) {
    const entry: DictEntry = {
      k: word.kanji.map(k => k.text),
      r: word.kana.map(k => k.text),
      p: [...new Set(word.sense.flatMap(s => s.partOfSpeech))],
      s: senses(word)
    };
    const f = french.get(word.id);
    if (f && f.length > 0) entry.f = f;
    if (word.kanji.some(k => k.common) || word.kana.some(k => k.common)) entry.c = 1;
    const index = entries.push(entry) - 1;
    for (const form of new Set([...entry.k, ...entry.r])) (forms[form] ??= []).push(index);
  }
  const kanji: Record<string, KanjiEntry> = {};
  for (const c of kanjidic.characters) {
    const groups = c.readingMeaning?.groups ?? [];
    const meanings = groups.flatMap(g => g.meanings);
    const readings = groups.flatMap(g => g.readings);
    const en = meanings.filter(m => m.lang === 'en').map(m => m.value).slice(0, 5);
    const fr = meanings.filter(m => m.lang === 'fr').map(m => m.value).slice(0, 5);
    if (en.length === 0 && fr.length === 0) continue;
    kanji[c.literal] = {
      m: en,
      ...(fr.length > 0 && { mf: fr }),
      on: readings.filter(r => r.type === 'ja_on').map(r => r.value).slice(0, 4),
      kun: readings.filter(r => r.type === 'ja_kun').map(r => r.value).slice(0, 4)
    };
  }
  return { version, entries, forms, kanji };
}

// --- Déconjugaison ---------------------------------------------------------------

/** Nature grammaticale d'une forme reconstruite. */
type WordType = 'v1' | 'v5' | 'vk' | 'vs' | 'adj-i' | 'te' | 'masu';

interface Rule {
  from: string;
  to: string;
  /** Natures acceptées pour la forme de départ (vide : forme lue telle quelle). */
  in: (WordType | null)[];
  out: WordType;
}

// Lignes des verbes godan : terminaison (u) et ses rangées i / a / e / o.
const GODAN: [u: string, i: string, a: string, e: string, o: string][] = [
  ['く', 'き', 'か', 'け', 'こ'],
  ['ぐ', 'ぎ', 'が', 'げ', 'ご'],
  ['す', 'し', 'さ', 'せ', 'そ'],
  ['つ', 'ち', 'た', 'て', 'と'],
  ['ぬ', 'に', 'な', 'ね', 'の'],
  ['ぶ', 'び', 'ば', 'べ', 'ぼ'],
  ['む', 'み', 'ま', 'め', 'も'],
  ['る', 'り', 'ら', 'れ', 'ろ'],
  ['う', 'い', 'わ', 'え', 'お']
];

const ANY: (WordType | null)[] = [null];
// Suffixes après la base « masu » (rangée i des godan, base nue des ichidan).
const MASU_SUFFIXES = ['ます', 'ました', 'ません', 'ませんでした', 'ましょう', 'たい', 'たかった', 'たくない', 'ながら', 'なさい', 'すぎる', 'に'];
// Après la rangée a (négatif, passif, causatif).
const NAI_SUFFIXES = ['ない', 'なかった', 'なくて', 'なければ', 'ず', 'れる', 'れた', 'せる', 'せた'];

function buildRules(): Rule[] {
  const rules: Rule[] = [];
  const add = (from: string, to: string, out: WordType, inTypes = ANY) => rules.push({ from, to, in: inTypes, out });
  // 行く d'abord : 行った / 行って sont aussi le passé de 行う, bien plus rare.
  for (const ending of ['った', 'って']) {
    add('行' + ending, '行く', 'v5');
    add('い' + ending, 'いく', 'v5');
  }
  for (const [u, i, a, e, o] of GODAN) {
    for (const s of MASU_SUFFIXES) add(i + s, u, 'v5');
    for (const s of NAI_SUFFIXES) add((u === 'う' ? 'わ' : a) + s, u, 'v5');
    add(e + 'ば', u, 'v5');
    add(e + 'る', u, 'v5'); // potentiel
    add(e + 'ない', u, 'v5');
    add(o + 'う', u, 'v5'); // volitif
  }
  // Passé et forme en -te des godan.
  for (const [ending, bases] of [
    ['いた', ['く']], ['いて', ['く']], ['いだ', ['ぐ']], ['いで', ['ぐ']], ['した', ['す']], ['して', ['す']],
    ['った', ['う', 'つ', 'る']], ['って', ['う', 'つ', 'る']], ['んだ', ['ぬ', 'ぶ', 'む']], ['んで', ['ぬ', 'ぶ', 'む']]
  ] as [string, string[]][]) {
    for (const base of bases) add(ending, base, 'v5');
  }
  // Ichidan : base nue + suffixe.
  for (const s of [...MASU_SUFFIXES, ...NAI_SUFFIXES.filter(s => !s.startsWith('れ') && !s.startsWith('せ')), 'た', 'て', 'よう', 'られる', 'られた', 'させる', 'させた', 'れば', 'ろ', 'よ']) add(s, 'る', 'v1');
  // する / 来る.
  for (const s of [...MASU_SUFFIXES, 'た', 'て', 'ない', 'なかった', 'なくて', 'よう']) {
    add('し' + s, 'する', 'vs');
    add('来' + s, '来る', 'vk');
    if (s !== 'ない' && s !== 'なかった' && s !== 'なくて' && s !== 'よう') add('き' + s, 'くる', 'vk');
  }
  for (const s of ['ない', 'なかった', 'なくて', 'よう']) add('こ' + s, 'くる', 'vk');
  for (const [from, to] of [['させる', 'する'], ['される', 'する'], ['すれば', 'する'], ['来れば', '来る'], ['くれば', 'くる']]) add(from, to, from.includes('来') || from.startsWith('く') ? 'vk' : 'vs');
  // Adjectifs en -i.
  for (const s of ['かった', 'くない', 'くなかった', 'くて', 'く', 'ければ', 'さ', 'そう', 'すぎる']) add(s, 'い', 'adj-i');
  // Formes en -te suivies d'un auxiliaire (ている, てしまう...) : on revient à -te, puis à la base.
  for (const [aux, te] of [['ている', 'て'], ['ていた', 'て'], ['ています', 'て'], ['てる', 'て'], ['てた', 'て'], ['てしまう', 'て'], ['てしまった', 'て'], ['ちゃう', 'て'], ['ちゃった', 'て'], ['ておく', 'て'], ['てください', 'て'], ['でいる', 'で'], ['でいた', 'で'], ['でしまった', 'で'], ['じゃう', 'で']]) {
    add(aux, te, 'te');
  }
  // Une forme -te / -de obtenue ci-dessus se ramène comme une forme -te lue directement.
  for (const rule of [...rules]) {
    if ((rule.from.endsWith('て') || rule.from.endsWith('で')) && rule.in === ANY && rule.out !== 'te') rules.push({ ...rule, in: ['te'] });
  }
  return rules;
}

const RULES = buildRules();

export interface Deinflection {
  text: string;
  type: WordType | null;
}

/** Formes de base possibles d'un mot (lui-même compris), jusqu'à deux règles enchaînées. */
export function deinflect(word: string): Deinflection[] {
  const out: Deinflection[] = [{ text: word, type: null }];
  const seen = new Set([`${word}|`]);
  for (let i = 0; i < out.length && i < 200; i++) {
    const current = out[i];
    if (current.type !== null && current.type !== 'te') continue;
    for (const rule of RULES) {
      if (!current.text.endsWith(rule.from) || !rule.in.includes(current.type)) continue;
      const stem = current.text.slice(0, -rule.from.length);
      // Radical vide : seulement si la règle redonne un mot entier (行く, する, くる), jamais une terminaison seule (す, る, い).
      if (!stem && rule.to.length < 2) continue;
      const text = stem + rule.to;
      const key = `${text}|${rule.out}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text, type: rule.out });
    }
  }
  return out.filter(d => d.type !== 'te');
}

/** La nature d'une entrée accepte-t-elle cette forme reconstruite ? */
function typeMatches(entry: DictEntry, type: WordType | null): boolean {
  if (type === null) return true;
  switch (type) {
    case 'v1':
      return entry.p.some(p => p === 'v1' || p === 'v1-s');
    case 'v5':
      return entry.p.some(p => p.startsWith('v5'));
    case 'vk':
      return entry.p.includes('vk');
    case 'vs':
      return entry.p.some(p => p.startsWith('vs'));
    case 'adj-i':
      return entry.p.some(p => p === 'adj-i' || p === 'adj-ix');
    default:
      return false;
  }
}

// --- Découpage ---------------------------------------------------------------------

const KANJI = /[㐀-䶿一-鿿々〆]/;
const JAPANESE = /[぀-ヿ㐀-䶿一-鿿々〆ー]/;
const PARTICLES = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'へ', 'や', 'か', 'ね', 'よ']);
// Mots grammaticaux qui commencent par une particule mais forment un tout (です, でした, から...).
const GRAMMAR = new Set(['です', 'でした', 'でしょう', 'ではない', 'では', 'でも', 'には', 'とは', 'から', 'まで', 'より', 'ので', 'のに', 'けど', 'けれど', 'ても', 'でしょ', 'だった', 'だろう', 'かな', 'かも', 'ながら']);
const MAX_WORD = 12;

function kanjiOf(index: DictIndex, text: string, lang: 'fr' | 'en'): DictKanji[] {
  return [...new Set([...text].filter(ch => KANJI.test(ch)))].flatMap(ch => {
    const k = index.kanji[ch];
    if (!k) return [];
    const french = lang === 'fr' && k.mf && k.mf.length > 0;
    return [{ char: ch, meanings: french ? k.mf! : k.m, french: Boolean(french), on: k.on, kun: k.kun }];
  });
}

/** Meilleure entrée pour une forme : courante d'abord, puis celle qui s'écrit ainsi en kanji. */
function bestEntry(index: DictIndex, form: string, type: WordType | null): DictEntry | null {
  const candidates = (index.forms[form] ?? []).map(i => index.entries[i]).filter(e => typeMatches(e, type));
  if (candidates.length === 0) return null;
  const kanaOnly = !KANJI.test(form);
  // Une forme en kana seule ne vaut qu'un mot courant (sinon trop de faux découpages).
  const usable = kanaOnly ? candidates.filter(e => e.c) : candidates;
  if (usable.length === 0) return null;
  // Particule seule : l'entrée « particule » (は, pas 羽 « aile »).
  const particle = PARTICLES.has(form) ? usable.find(e => e.p.includes('prt')) : undefined;
  if (particle) return particle;
  // Courant d'abord, puis l'entrée dont c'est la graphie principale (本 : ほん « livre », pas もと où 本 est la 2e graphie).
  const rank = (e: DictEntry) => (e.k.indexOf(form) >= 0 ? e.k.indexOf(form) : e.r.indexOf(form) >= 0 ? 10 + e.r.indexOf(form) : 99);
  return usable.sort((a, b) => (b.c ?? 0) - (a.c ?? 0) || rank(a) - rank(b))[0];
}

/** Lecture cohérente avec les kana affichés (いい天気 → いいてんき, pas よいてんき). */
function readingFor(entry: DictEntry, base: string): string | null {
  const kanaRuns = base.split(/[\u3400-\u4dbf\u4e00-\u9fff々〆]+/).filter(Boolean);
  const fits = (reading: string) => {
    let from = 0;
    for (const run of kanaRuns) {
      const at = reading.indexOf(run, from);
      if (at < 0) return false;
      from = at + run.length;
    }
    return true;
  };
  return entry.r.find(fits) ?? entry.r[0] ?? null;
}

function tokenFor(index: DictIndex, surface: string, base: string, entry: DictEntry, lang: 'fr' | 'en'): DictToken {
  const french = lang === 'fr' && entry.f && entry.f.length > 0;
  const kanaSurface = !KANJI.test(surface);
  return {
    text: surface,
    base: base !== surface ? base : null,
    reading: kanaSurface ? null : readingFor(entry, base),
    senses: french ? entry.f! : entry.s,
    french: Boolean(french),
    kanji: kanjiOf(index, surface, lang)
  };
}

/**
 * Découpe `text` en mots du dictionnaire (correspondance la plus longue, avec
 * déconjugaison). Ce qui n'est pas trouvé reste en morceaux sans sens ; un
 * kanji isolé inconnu comme mot garde au moins son sens de kanji.
 */
export function lookupText(index: DictIndex, text: string, lang: 'fr' | 'en'): DictToken[] {
  const tokens: DictToken[] = [];
  let plain = '';
  const flushPlain = () => {
    if (plain) tokens.push({ text: plain, base: null, reading: null, senses: [], french: false, kanji: [] });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (!JAPANESE.test(ch)) {
      plain += ch;
      i++;
      continue;
    }
    // Particule juste après un mot en kanji : elle-même, pas le début d'un mot en kana (今日|は|いい).
    const previous = tokens[tokens.length - 1];
    const grammar = [...GRAMMAR].some(word => text.startsWith(word, i));
    if (!plain && previous && KANJI.test(previous.text) && PARTICLES.has(ch) && !grammar) {
      const particle = bestEntry(index, ch, null);
      tokens.push(particle ? tokenFor(index, ch, ch, particle, lang) : { text: ch, base: null, reading: null, senses: [], french: false, kanji: [] });
      i++;
      continue;
    }
    let match: DictToken | null = null;
    for (let length = Math.min(MAX_WORD, text.length - i); length > 0 && !match; length--) {
      const surface = text.slice(i, i + length);
      if (!JAPANESE.test(surface[surface.length - 1])) continue;
      for (const candidate of deinflect(surface)) {
        const entry = bestEntry(index, candidate.text, candidate.type);
        if (entry) {
          match = tokenFor(index, surface, candidate.text, entry, lang);
          break;
        }
      }
    }
    // Mot en kanji qui avale la particule suivante (今日は = « bonjour ») : le mot seul, si c'en est un.
    if (match && !match.base && match.text.length > 1 && PARTICLES.has(match.text[match.text.length - 1]) && KANJI.test(match.text)) {
      const shorter = match.text.slice(0, -1);
      const entry = KANJI.test(shorter) ? bestEntry(index, shorter, null) : null;
      if (entry) match = tokenFor(index, shorter, shorter, entry, lang);
    }
    if (match) {
      flushPlain();
      tokens.push(match);
      i += match.text.length;
    } else if (KANJI.test(ch)) {
      flushPlain();
      tokens.push({ text: ch, base: null, reading: null, senses: [], french: false, kanji: kanjiOf(index, ch, lang) });
      i++;
    } else {
      plain += ch;
      i++;
    }
  }
  flushPlain();
  return tokens;
}
