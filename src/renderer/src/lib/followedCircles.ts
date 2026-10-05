import type { CircleWork, FollowedCircle } from '../../../shared/ipc-types';

export type { CircleWork, FollowedCircle };

export interface LibraryCircle {
  makerId: string;
  site: string;
  name: string;
}

/** Cercles des jeux présents (identifiant DLsite, section, nom japonais), par nom. */
export function collectLibraryCircles(games: { data: { maker_id?: string | null; platform?: string; circle?: string | null; brand?: string | null } }[]): LibraryCircle[] {
  const circles = new Map<string, LibraryCircle>();
  for (const { data } of games) {
    if (!data.maker_id || circles.has(data.maker_id)) continue;
    circles.set(data.maker_id, { makerId: data.maker_id, site: data.platform || 'maniax', name: data.circle || data.brand || data.maker_id });
  }
  return [...circles.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fil des cercles suivis : nouveautés (apparues depuis le début du suivi)
 * puis annonces, sans ce qui est déjà dans la bibliothèque.
 */
export function splitFeed(feed: CircleWork[], inLibrary: Set<string>): { releases: CircleWork[]; announces: CircleWork[] } {
  const visible = feed.filter(work => !inLibrary.has(work.id));
  return {
    releases: visible.filter(work => work.kind === 'sale' && work.isNew),
    announces: visible.filter(work => work.kind === 'announce')
  };
}

export const dlsiteWorkUrl = (work: Pick<CircleWork, 'id' | 'site' | 'kind'>) =>
  `https://www.dlsite.com/${work.site}/${work.kind === 'announce' ? 'announce' : 'work'}/=/product_id/${work.id}.html`;
