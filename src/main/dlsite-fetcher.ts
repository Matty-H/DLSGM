import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { GameMetadata } from '../shared/ipc-types';
import { dlsiteFetch } from './dlsite-net';
import { tm } from './i18n';

/**
 * Récupère les métadonnées d'une œuvre DLsite en deux requêtes HTTP non
 * authentifiées, sans dépendance Python : un endpoint JSON (ajax) puis une
 * page HTML parsée (avec repli sur la variante "announce" pour les œuvres
 * pas encore sorties). Réplique le comportement de la librairie Python
 * `dlsite-async` (vérifié directement dans son code source et contre des
 * réponses réelles de DLsite), y compris la convention `null` pour les
 * champs absents (jamais la chaîne "N/A", qui ne se déclenche en réalité
 * jamais côté Python puisque tous ces champs existent sur le dataclass
 * `Work`, juste parfois à `None`).
 */

const USER_AGENT = 'Mozilla/5.0 (compatible; DLSGM/1.0)';
// Par requête : un proxy lent ne doit pas bloquer un fetch indéfiniment.
const REQUEST_TIMEOUT_MS = 30000;

const AGE_CATEGORY_NAMES: Record<number, GameMetadata['age_category']> = {
  1: 'ALL_AGES',
  2: 'R15',
  3: 'R18'
};

/**
 * Codes de l'option `options` du endpoint ajax ("JPN#ENG#TRI"...), repris de
 * `WorkOption` (dlsite-async 0.11.0). Les langues remplissent `language`.
 */
const LANGUAGE_OPTIONS: Record<string, string> = {
  JPN: 'Japonais',
  ENG: 'Anglais',
  CHI_HANS: 'Chinois (simplifié)',
  CHI_HANT: 'Chinois (traditionnel)',
  KO_KR: 'Coréen',
  FRE: 'Français',
  GER: 'Allemand',
  SPA: 'Espagnol',
  ITA: 'Italien',
  POR: 'Portugais',
  RUS: 'Russe',
  UKR: 'Ukrainien',
  POL: 'Polonais',
  DUT: 'Néerlandais',
  SWE: 'Suédois',
  DAN: 'Danois',
  FIN: 'Finnois',
  ICE: 'Islandais',
  CZE: 'Tchèque',
  SLO: 'Slovaque',
  SLV: 'Slovène',
  HUN: 'Hongrois',
  RUM: 'Roumain',
  BUL: 'Bulgare',
  GRE: 'Grec',
  EST: 'Estonien',
  LAV: 'Letton',
  THA: 'Thaï',
  VIE: 'Vietnamien',
  IND: 'Indonésien'
};
const OTHER_OPTIONS = new Set([
  'AIG', 'AIP', 'WAP', 'DLP', 'EVT', 'GRO', 'MEN', 'MS2', 'WPD', 'VET', 'REV', 'SBK', 'TRI', 'MV2', 'SND'
]);

/** Options connues (les codes inconnus sont ignorés, comme dans dlsite-async). */
export function parseOptions(raw: unknown): string[] | null {
  if (typeof raw !== 'string' || raw === '') return null;
  const options = raw.split('#').filter(code => code in LANGUAGE_OPTIONS || OTHER_OPTIONS.has(code));
  return options.length > 0 ? options : null;
}

interface AjaxProductInfo {
  site_id: string;
  work_name: string;
  work_image: string | null;
  title_name: string | null;
  title_name_masked: string | null;
  age_category: number;
  work_type: string | null;
  regist_date: string | null;
  options: string[] | null;
}

interface HtmlDetails {
  circle?: string;
  brand?: string;
  publisher?: string;
  label?: string;
  author?: string[];
  event?: string[];
  file_format?: string[];
  illustration?: string[];
  genre?: string[];
  music?: string[];
  scenario?: string[];
  voice_actor?: string[];
  writer?: string[];
  file_size?: string;
  title_name_masked?: string;
  page_count?: number;
  announce_date?: string;
  modified_date?: string;
  sample_images?: string[];
  maker_id?: string;
  /** Identifiants DLsite des genres (lien /genre/<id>/), dans l'ordre de `genre` : les mêmes dans toutes les langues. */
  genre_ids?: string[];
  description?: string;
}

function unescapeText(text: string): string {
  return text.normalize('NFKC').trim();
}

function pad2(n: number | string): string {
  return String(n).padStart(2, '0');
}

/** Parse le format "%Y-%m-%d %H:%M:%S" renvoyé par l'endpoint ajax (regist_date). */
export function parseAjaxTimestamp(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Parse une date de table HTML DLsite, dans l'un des 3 formats utilisés par
 * le site selon la locale : "%Y年%m月%d日", "%b/%d/%Y", "%B/%d/%Y". Réplique
 * `_DateRowParser` de dlsite-async (y compris le split sur le premier token,
 * la date étant parfois suivie d'autre texte dans la cellule).
 */
export function parseTableDate(rawText: string): string | null {
  const token = unescapeText(rawText).split(/\s+/)[0];
  if (!token) return null;

  let m = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(token);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${pad2(mo)}-${pad2(d)}T00:00:00`;
  }

  m = /^([A-Za-z]+)\/(\d{1,2})\/(\d{4})$/.exec(token);
  if (m) {
    const [, monthName, d, y] = m;
    const lower = monthName.toLowerCase();
    const monthIndex = MONTH_ABBR.indexOf(lower) !== -1 ? MONTH_ABBR.indexOf(lower) : MONTH_FULL.indexOf(lower);
    if (monthIndex !== -1) {
      return `${y}-${pad2(monthIndex + 1)}-${pad2(d)}T00:00:00`;
    }
  }

  return null;
}

async function fetchProductInfoJson(gameId: string, locale: string): Promise<AjaxProductInfo> {
  const url = `https://www.dlsite.com/maniax/product/info/ajax?product_id=${encodeURIComponent(gameId)}&locale=${encodeURIComponent(locale)}`;
  const response = await dlsiteFetch(url, {
    headers: { Cookie: 'adultchecked=1', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(tm('Échec de la requête product-info (HTTP {status}) pour {id}', { status: response.status, id: gameId }));
  }
  const data = await response.json() as Record<string, Record<string, unknown>>;
  const info = data[gameId];
  if (!info) {
    throw new Error(tm('Aucune donnée product-info pour {id}', { id: gameId }));
  }

  return {
    site_id: String(info.site_id ?? ''),
    work_name: String(info.work_name ?? gameId),
    work_image: (info.work_image as string | null) ?? null,
    title_name: (info.title_name as string | null) ?? null,
    title_name_masked: (info.title_name_masked as string | null) ?? null,
    age_category: Number(info.age_category),
    work_type: (info.work_type as string | null) ?? null,
    regist_date: typeof info.regist_date === 'string' ? parseAjaxTimestamp(info.regist_date) : null,
    options: parseOptions(info.options)
  };
}

/** Requête HTML avec repli work -> announce (œuvres pas encore sorties), comme `_fetch_work_html`. */
async function fetchWorkHtml(siteId: string, gameId: string, locale: string): Promise<string | null> {
  const urls = ['work', 'announce'].map(
    kind => `https://www.dlsite.com/${siteId}/${kind}/=/product_id/${gameId}.html?locale=${encodeURIComponent(locale)}`
  );

  for (const url of urls) {
    const response = await dlsiteFetch(url, {
      headers: { Cookie: 'adultchecked=1', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (response.status === 200) {
      return await response.text();
    }
  }
  return null;
}

type RowParserKind = 'date' | 'int' | 'maker' | 'list' | 'text';

const ROW_PARSERS: Array<{ field: keyof HtmlDetails; kind: RowParserKind; headers: string[] }> = [
  { field: 'announce_date', kind: 'date', headers: ['予告開始日', 'Published date'] },
  { field: 'modified_date', kind: 'date', headers: ['最終更新日', '更新情報', 'Last updated', 'Update information'] },
  { field: 'page_count', kind: 'int', headers: ['ページ数', 'Page count'] },
  { field: 'brand', kind: 'maker', headers: ['ブランド名', 'Brand'] },
  { field: 'circle', kind: 'maker', headers: ['サークル名', 'Circle'] },
  { field: 'publisher', kind: 'maker', headers: ['出版社名', 'Publisher'] },
  { field: 'label', kind: 'maker', headers: ['レーベル', 'Label'] },
  { field: 'author', kind: 'list', headers: ['作者', '著者', 'Author'] },
  { field: 'event', kind: 'list', headers: ['イベント', 'Event'] },
  { field: 'file_format', kind: 'list', headers: ['ファイル形式', 'File format'] },
  { field: 'illustration', kind: 'list', headers: ['イラスト', 'Illustration'] },
  { field: 'genre', kind: 'list', headers: ['ジャンル', 'Genre'] },
  { field: 'music', kind: 'list', headers: ['音楽', 'Music'] },
  { field: 'scenario', kind: 'list', headers: ['シナリオ', 'Scenario'] },
  { field: 'voice_actor', kind: 'list', headers: ['声優', 'Voice Actor'] },
  { field: 'writer', kind: 'list', headers: ['作家', 'Writer'] },
  { field: 'file_size', kind: 'text', headers: ['ファイル容量', 'File size'] },
  { field: 'title_name_masked', kind: 'text', headers: ['シリーズ名', 'Series', 'Series name'] }
];

const HEADER_TO_PARSER = new Map<string, { field: keyof HtmlDetails; kind: RowParserKind }>();
for (const parser of ROW_PARSERS) {
  for (const header of parser.headers) {
    HEADER_TO_PARSER.set(header, { field: parser.field, kind: parser.kind });
  }
}

// Boilerplate marketing DLsite à retirer de la fin de la description (verbatim depuis _scraper.py).
const DESC_EN = /"DLsite.*DLsite!$/;
const DESC_JP = /「DLsite[^」]*」.*「DLsite[^」]*」!$/;

function parseWorkOutlineRow($: cheerio.CheerioAPI, tr: Element, details: HtmlDetails): void {
  const $tr = $(tr);
  const th = $tr.find('th').first();
  const td = $tr.find('td').first();
  if (th.length === 0 || td.length === 0) return;

  const headerText = unescapeText(th.text());
  const parser = HEADER_TO_PARSER.get(headerText);
  if (!parser) return;

  switch (parser.kind) {
    case 'date': {
      const value = parseTableDate(td.text());
      if (value !== null) (details as Record<string, unknown>)[parser.field] = value;
      break;
    }
    case 'int': {
      const value = parseInt(unescapeText(td.text()), 10);
      if (!Number.isNaN(value)) (details as Record<string, unknown>)[parser.field] = value;
      break;
    }
    case 'maker': {
      const span = td.find('span.maker_name').first();
      if (span.length > 0) (details as Record<string, unknown>)[parser.field] = unescapeText(span.text());
      // Identifiant du cercle / de la marque (RG..., BG...) : le même quelle
      // que soit la langue, contrairement au nom ("cat 3" / "猫3").
      if (parser.field === 'circle' || parser.field === 'brand') {
        const makerId = /maker_id\/([A-Z]{2}\d+)/.exec(span.find('a').attr('href') ?? '')?.[1];
        if (makerId && !details.maker_id) details.maker_id = makerId;
      }
      break;
    }
    case 'list': {
      const links = td.find('a').toArray();
      (details as Record<string, unknown>)[parser.field] = links.map(a => unescapeText($(a).text()));
      if (parser.field === 'genre') {
        details.genre_ids = links.map(a => /\/genre\/(\d+)\//.exec($(a).attr('href') ?? '')?.[1] ?? '');
      }
      break;
    }
    case 'text': {
      (details as Record<string, unknown>)[parser.field] = unescapeText(td.text());
      break;
    }
  }
}

export function parseWorkHtml(html: string): HtmlDetails {
  const $ = cheerio.load(html);
  const details: HtmlDetails = {};

  for (const tableId of ['work_maker', 'work_outline']) {
    $(`table#${tableId} tr`).each((_i, tr) => parseWorkOutlineRow($, tr, details));
  }

  const sampleImages: string[] = [];
  $('div.product-slider-data').find('div').each((_i, div) => {
    const src = $(div).attr('data-src');
    if (src && !src.includes('_img_main')) sampleImages.push(src);
  });
  if (sampleImages.length > 0) details.sample_images = sampleImages;

  const metaDescription = $('meta[name="description"]').attr('content');
  if (metaDescription) {
    let description = unescapeText(metaDescription);
    description = description.replace(DESC_EN, '').trim();
    description = description.replace(DESC_JP, '').trim();
    if (description) details.description = description;
  }

  return details;
}

/**
 * Traductions JP → EN des genres d'une œuvre, appariés par identifiant
 * DLsite (jamais par position : les deux pages pourraient ne pas lister les
 * mêmes genres dans le même ordre).
 */
export function pairGenreTranslations(ja: HtmlDetails, en: HtmlDetails | null): Record<string, string> {
  const pairs: Record<string, string> = {};
  if (!en?.genre || !en.genre_ids || !ja.genre || !ja.genre_ids) return pairs;
  const enById = new Map(en.genre_ids.map((id, i) => [id, en.genre![i]]));
  ja.genre_ids.forEach((id, i) => {
    const english = id ? enById.get(id) : undefined;
    if (english && ja.genre![i]) pairs[ja.genre![i]] = english;
  });
  return pairs;
}

export interface FetchedWork {
  /** Fiche en japonais (langue de référence), avec `work_name_en` / `circle_en` si la page anglaise a répondu. */
  metadata: GameMetadata;
  /** Genres JP → EN appris sur cette œuvre. */
  genreTranslations: Record<string, string>;
}

/**
 * Récupère une œuvre : la version japonaise fait foi (DLsite est un site
 * japonais, la plupart des cercles écrivent en japonais) ; la version
 * anglaise, facultative (`translations`), n'apporte que des traductions —
 * titre, nom du cercle et genres. Son échec n'empêche pas le fetch.
 */
export async function fetchWork(gameId: string, { translations = true }: { translations?: boolean } = {}): Promise<FetchedWork> {
  const ajax = await fetchProductInfoJson(gameId, 'ja_JP');
  const html = ajax.site_id ? await fetchWorkHtml(ajax.site_id, gameId, 'ja_JP') : null;
  const details = html ? parseWorkHtml(html) : {};

  let english: { ajax: AjaxProductInfo; details: HtmlDetails } | null = null;
  if (translations && ajax.site_id) {
    try {
      const ajaxEn = await fetchProductInfoJson(gameId, 'en_US');
      const htmlEn = await fetchWorkHtml(ajax.site_id, gameId, 'en_US');
      english = { ajax: ajaxEn, details: htmlEn ? parseWorkHtml(htmlEn) : {} };
    } catch (error) {
      console.warn(`Traductions anglaises indisponibles pour ${gameId}:`, (error as Error).message);
    }
  }

  return {
    metadata: {
      ...buildMetadata(ajax, details),
      work_name_en: english?.ajax.work_name ?? null,
      circle_en: english?.details.circle ?? null
    },
    genreTranslations: pairGenreTranslations(details, english?.details ?? null)
  };
}

function buildMetadata(ajax: AjaxProductInfo, details: HtmlDetails): GameMetadata {
  const titleNameMasked = details.title_name_masked ?? ajax.title_name_masked ?? null;
  const languages = (ajax.options ?? []).filter(code => code in LANGUAGE_OPTIONS).map(code => LANGUAGE_OPTIONS[code]);

  return {
    work_name: ajax.work_name,
    title_name_masked: titleNameMasked,
    age_category: AGE_CATEGORY_NAMES[ajax.age_category] ?? 'ALL_AGES',
    circle: details.circle ?? null,
    brand: details.brand ?? null,
    publisher: details.publisher ?? null,
    label: details.label ?? null,
    work_image: ajax.work_image,
    description: details.description ?? null,
    genre: details.genre ?? null,
    sample_images: details.sample_images ?? null,
    category: ajax.work_type,
    announce_date: details.announce_date ?? null,
    release_date: ajax.regist_date,
    regist_date: ajax.regist_date,
    modified_date: details.modified_date ?? null,
    file_format: details.file_format ?? null,
    file_size: details.file_size ?? null,
    language: languages.length > 0 ? languages : null,
    options: ajax.options,
    platform: ajax.site_id,
    series: titleNameMasked ?? ajax.title_name ?? null,
    page_count: details.page_count ?? null,
    author: details.author ?? null,
    writer: details.writer ?? null,
    scenario: details.scenario ?? null,
    illustration: details.illustration ?? null,
    voice_actor: details.voice_actor ?? null,
    music: details.music ?? null,
    event: details.event ?? null,
    maker_id: details.maker_id ?? null
  };

}
