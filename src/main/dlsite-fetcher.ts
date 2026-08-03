import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { GameMetadata } from '../shared/ipc-types';

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

const AGE_CATEGORY_NAMES: Record<number, GameMetadata['age_category']> = {
  1: 'ALL_AGES',
  2: 'R15',
  3: 'R18'
};

interface AjaxProductInfo {
  site_id: string;
  work_name: string;
  work_image: string | null;
  title_name: string | null;
  title_name_masked: string | null;
  age_category: number;
  work_type: string | null;
  regist_date: string | null;
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
  description?: string;
}

function unescapeText(text: string): string {
  return text.normalize('NFKC').trim();
}

function pad2(n: number | string): string {
  return String(n).padStart(2, '0');
}

/** Parse le format "%Y-%m-%d %H:%M:%S" renvoyé par l'endpoint ajax (regist_date). */
function parseAjaxTimestamp(value: string): string | null {
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
function parseTableDate(rawText: string): string | null {
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
  const response = await fetch(url, {
    headers: { Cookie: 'adultchecked=1', 'User-Agent': USER_AGENT }
  });
  if (!response.ok) {
    throw new Error(`Échec de la requête product-info (HTTP ${response.status}) pour ${gameId}`);
  }
  const data = await response.json() as Record<string, Record<string, unknown>>;
  const info = data[gameId];
  if (!info) {
    throw new Error(`Aucune donnée product-info pour ${gameId}`);
  }

  return {
    site_id: String(info.site_id ?? ''),
    work_name: String(info.work_name ?? gameId),
    work_image: (info.work_image as string | null) ?? null,
    title_name: (info.title_name as string | null) ?? null,
    title_name_masked: (info.title_name_masked as string | null) ?? null,
    age_category: Number(info.age_category),
    work_type: (info.work_type as string | null) ?? null,
    regist_date: typeof info.regist_date === 'string' ? parseAjaxTimestamp(info.regist_date) : null
  };
}

/** Requête HTML avec repli work -> announce (œuvres pas encore sorties), comme `_fetch_work_html`. */
async function fetchWorkHtml(siteId: string, gameId: string, locale: string): Promise<string | null> {
  const urls = ['work', 'announce'].map(
    kind => `https://www.dlsite.com/${siteId}/${kind}/=/product_id/${gameId}.html?locale=${encodeURIComponent(locale)}`
  );

  for (const url of urls) {
    const response = await fetch(url, { headers: { Cookie: 'adultchecked=1', 'User-Agent': USER_AGENT } });
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
      break;
    }
    case 'list': {
      const values = td.find('a').map((_i, a) => unescapeText($(a).text())).get();
      (details as Record<string, unknown>)[parser.field] = values;
      break;
    }
    case 'text': {
      (details as Record<string, unknown>)[parser.field] = unescapeText(td.text());
      break;
    }
  }
}

function parseWorkHtml(html: string): HtmlDetails {
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
 * Orchestrateur principal, équivalent de `fetch_game_data()` dans
 * fetch_dlsite.py : reproduit exactement les mêmes champs de sortie pour que
 * dataFetcher.js et store.js n'aient aucun changement structurel à subir.
 */
export async function fetchGameMetadata(gameId: string, locale: string): Promise<GameMetadata> {
  const ajax = await fetchProductInfoJson(gameId, locale);
  const html = ajax.site_id ? await fetchWorkHtml(ajax.site_id, gameId, locale) : null;
  const details = html ? parseWorkHtml(html) : {};

  const titleNameMasked = details.title_name_masked ?? ajax.title_name_masked ?? null;

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
    language: null,
    platform: ajax.site_id,
    series: titleNameMasked ?? ajax.title_name ?? null,
    page_count: details.page_count ?? null,
    author: details.author ?? null,
    writer: details.writer ?? null,
    scenario: details.scenario ?? null,
    illustration: details.illustration ?? null,
    voice_actor: details.voice_actor ?? null,
    music: details.music ?? null,
    event: details.event ?? null
  };
}
