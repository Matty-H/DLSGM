import * as cheerio from 'cheerio';
import type Store from './store';
import type { CircleWork, FollowedCircle } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Cercles suivis : leurs sorties et annonces récentes, lues sur la page
 * profil DLsite du cercle (sans compte) — `発売予告作品` (annonces, avec la
 * date prévue) et `販売作品` (en vente, du plus récent au plus ancien).
 *
 * Stockés à part (`followed-circles.db`, un document par identifiant de
 * cercle RG…/BG…). La première vérification d'un cercle ne fait que noter
 * ce qui existe déjà (`baseline`) : seules les œuvres apparues ensuite sont
 * des nouveautés, sans quoi suivre un cercle afficherait tout son catalogue.
 */

export const MAKER_ID_REGEX = /^[A-Z]{2}\d{3,9}$/;
const WORK_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;
const SITE_REGEX = /^[a-z]{2,16}$/;

// Œuvres gardées par cercle (les plus récentes d'abord).
const MAX_WORKS = 100;
// Pause entre deux pages de cercle : vérification en tâche de fond, sans marteler DLsite.
export const CHECK_SPACING_MS = 2000;
// Vérification automatique au plus une fois par jour.
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface StoredCircle {
  name: string;
  site: string;
  followedAt: string;
  /** Suivi automatique (cercle de la bibliothèque) ; false : suivi à la main. */
  auto: boolean;
  /** Retiré par l'utilisateur : le suivi automatique ne le reprend pas. */
  muted?: boolean;
  lastCheck: string | null;
  error: string | null;
  works: StoredWork[];
}

interface StoredWork {
  id: string;
  title: string;
  kind: 'sale' | 'announce';
  category: string | null;
  expected: string | null;
  firstSeen: string;
  /** Déjà là à la première vérification : pas une nouveauté. */
  baseline: boolean;
}

export interface ParsedProfile {
  name: string | null;
  works: Omit<StoredWork, 'firstSeen' | 'baseline'>[];
}

export function profileUrl(site: string, makerId: string): string {
  return `https://www.dlsite.com/${site}/circle/profile/=/maker_id/${makerId}.html?locale=ja_JP`;
}

const idFromLink = (href: string | undefined) => /product_id\/([A-Z]{2}\d{6,9})/.exec(href ?? '')?.[1] ?? null;
const categoryOf = (className: string | undefined) => /\btype_([A-Z0-9]{2,4})\b/.exec(className ?? '')?.[1] ?? null;

/** Œuvres de la page profil d'un cercle : annonces puis ventes, sans doublon. */
export function parseCircleProfile(html: string): ParsedProfile {
  const $ = cheerio.load(html);
  const title = $('title').first().text();
  const name = /^(.+?)\s*(サークル|ブランド)プロフィール/.exec(title)?.[1]?.trim() || null;
  const works = new Map<string, ParsedProfile['works'][number]>();

  // Annonces : lien /announce/, date prévue dans .expected_date.
  $('dt.work_name').each((_, el) => {
    const link = $(el).find('a[href*="/announce/"]').first();
    const id = idFromLink(link.attr('href'));
    if (!id || works.has(id)) return;
    const row = $(el).closest('tr');
    works.set(id, {
      id,
      title: link.text().trim(),
      kind: 'announce',
      category: categoryOf(row.find('.work_category').attr('class')),
      expected: $(el).find('.expected_date').text().trim() || null
    });
  });

  // En vente : grille du catalogue, triée par date de sortie décroissante.
  $('li[data-list_item_product_id]').each((_, el) => {
    const id = $(el).attr('data-list_item_product_id');
    if (!id || !WORK_ID_REGEX.test(id) || works.has(id)) return;
    const link = $(el).find('.work_name a').first();
    works.set(id, {
      id,
      title: (link.attr('title') || link.text()).trim(),
      kind: 'sale',
      category: categoryOf($(el).find('.work_category').attr('class')),
      expected: null
    });
  });

  return { name, works: [...works.values()] };
}

/** Fusionne le résultat d'une vérification dans les œuvres connues. */
export function mergeWorks(known: StoredWork[], parsed: ParsedProfile['works'], now: string, firstCheck: boolean): StoredWork[] {
  const byId = new Map(known.map(work => [work.id, work]));
  const merged: StoredWork[] = parsed.map(work => {
    const previous = byId.get(work.id);
    return previous
      ? { ...previous, ...work, firstSeen: previous.firstSeen, baseline: previous.baseline }
      : { ...work, firstSeen: now, baseline: firstCheck };
  });
  // Une œuvre disparue de la page (au-delà de la première page, retirée) reste connue.
  for (const work of known) if (!merged.some(m => m.id === work.id)) merged.push(work);
  return merged.slice(0, MAX_WORKS);
}

export interface FollowedCirclesDeps {
  store: Store;
  fetchHtml: (url: string) => Promise<string>;
  now?: () => Date;
  wait?: (ms: number) => Promise<void>;
}

export class FollowedCircles {
  private checking: Promise<void> | null = null;

  constructor(private deps: FollowedCirclesDeps) {}

  private now(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  private async all(): Promise<Record<string, StoredCircle>> {
    return await this.deps.store.getAll() as Record<string, StoredCircle>;
  }

  /** Cercles suivis (sans ceux retirés), par nom. */
  async list(): Promise<FollowedCircle[]> {
    return Object.entries(await this.all())
      .filter(([, circle]) => !circle.muted)
      .map(([makerId, circle]) => ({
        makerId,
        name: circle.name,
        site: circle.site,
        auto: circle.auto,
        lastCheck: circle.lastCheck,
        error: circle.error,
        workCount: circle.works.length
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Suit un cercle (à la main) ; reprend un cercle retiré. */
  async follow(makerId: string, site: string, name: string): Promise<void> {
    if (!MAKER_ID_REGEX.test(makerId) || !SITE_REGEX.test(site)) throw new Error(tm('Identifiant de cercle invalide.'));
    const existing = (await this.all())[makerId];
    await this.deps.store.set(makerId, existing
      ? { ...existing, muted: false, auto: false }
      : { name: name.trim().slice(0, 200) || makerId, site, followedAt: this.now(), auto: false, lastCheck: null, error: null, works: [] } satisfies StoredCircle);
  }

  /**
   * Ne suit plus ce cercle. Un cercle suivi automatiquement est gardé, marqué
   * retiré, pour que le suivi automatique ne le reprenne pas.
   */
  async unfollow(makerId: string): Promise<void> {
    const existing = (await this.all())[makerId];
    if (!existing) return;
    if (existing.auto) await this.deps.store.set(makerId, { ...existing, muted: true });
    else await this.deps.store.delete(makerId);
  }

  /** Suivi automatique des cercles de la bibliothèque (ajoute ceux qui manquent, jamais un cercle retiré). */
  async syncLibraryCircles(circles: { makerId: string; site: string; name: string }[]): Promise<number> {
    const all = await this.all();
    let added = 0;
    for (const circle of circles) {
      if (!MAKER_ID_REGEX.test(circle.makerId) || !SITE_REGEX.test(circle.site) || all[circle.makerId]) continue;
      await this.deps.store.set(circle.makerId, {
        name: circle.name.trim().slice(0, 200) || circle.makerId,
        site: circle.site,
        followedAt: this.now(),
        auto: true,
        lastCheck: null,
        error: null,
        works: []
      } satisfies StoredCircle);
      all[circle.makerId] = (await this.deps.store.get(circle.makerId)) as StoredCircle;
      added++;
    }
    return added;
  }

  /** Vérifie un cercle ; une erreur est notée sur le cercle, les œuvres connues restent. */
  private async checkOne(makerId: string, circle: StoredCircle): Promise<void> {
    const now = this.now();
    try {
      const parsed = parseCircleProfile(await this.deps.fetchHtml(profileUrl(circle.site, makerId)));
      const current = ((await this.deps.store.get(makerId)) as StoredCircle | undefined) ?? circle;
      await this.deps.store.set(makerId, {
        ...current,
        name: current.auto && parsed.name ? parsed.name : current.name,
        lastCheck: now,
        error: null,
        works: mergeWorks(current.works, parsed.works, now, current.lastCheck === null)
      });
    } catch (error) {
      const current = ((await this.deps.store.get(makerId)) as StoredCircle | undefined) ?? circle;
      await this.deps.store.set(makerId, { ...current, lastCheck: now, error: (error as Error).message || String(error) });
    }
  }

  /**
   * Vérifie les cercles suivis (tous, ou ceux vérifiés il y a plus de
   * `olderThanMs`), un à la fois, espacés. Une seule vérification à la fois.
   */
  async check({ olderThanMs = 0, onProgress }: { olderThanMs?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<void> {
    if (this.checking) return this.checking;
    this.checking = (async () => {
      const limit = (this.deps.now?.() ?? new Date()).getTime() - olderThanMs;
      const due = Object.entries(await this.all()).filter(
        ([, circle]) => !circle.muted && (olderThanMs === 0 || !circle.lastCheck || new Date(circle.lastCheck).getTime() <= limit)
      );
      for (const [index, [makerId, circle]] of due.entries()) {
        if (index > 0) await (this.deps.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(CHECK_SPACING_MS);
        await this.checkOne(makerId, circle);
        onProgress?.(index + 1, due.length);
      }
    })();
    try {
      await this.checking;
    } finally {
      this.checking = null;
    }
  }

  /** Annonces et nouveautés des cercles suivis (jamais le catalogue de la première vérification), les plus récentes d'abord. */
  async feed(): Promise<CircleWork[]> {
    const works: CircleWork[] = [];
    for (const [makerId, circle] of Object.entries(await this.all())) {
      if (circle.muted) continue;
      for (const work of circle.works) {
        if (work.baseline && work.kind !== 'announce') continue;
        works.push({ ...work, makerId, circle: circle.name, site: circle.site, isNew: !work.baseline });
      }
    }
    return works.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.id.localeCompare(b.id));
  }
}
