import fs from 'fs';
import path from 'path';
import type { GameMetadata, WishlistAddResult, WishlistItem } from '../shared/ipc-types';
import type Store from './store';

/**
 * Liste de souhaits : des IDs DLsite que l'on n'a pas (encore), avec
 * quelques métadonnées pour les reconnaître (titre, cercle, couverture).
 * Stockée à part (wishlist.db, un document par ID), jamais dans le cache
 * des jeux : une fiche de cache est un jeu de la bibliothèque, et n'est
 * jamais purgée.
 *
 * Un ID sort de la liste à la main, ou tout seul dès que son dossier existe
 * dans le dossier de jeux (vérifié à chaque lecture de la liste).
 *
 * Les couvertures sont dans `img_cache/_wishlist/<ID>.jpg` (servies par
 * atom://img/_wishlist/<ID>.jpg) : le préfixe `_` ne peut pas être un ID de
 * jeu, le reset du cache d'images les laisse donc en place.
 */

const GAME_ID_IN_TEXT = /[A-Za-z]{2}\d{6,9}/g;
const GAME_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;
// Fetchs DLsite en parallèle lors d'un ajout groupé.
const FETCH_CONCURRENCY = 3;

interface StoredItem {
  addedAt: string;
  work_name?: string | null;
  circle?: string | null;
  age_category?: WishlistItem['age_category'];
  category?: string | null;
  release_date?: string | null;
  work_image?: string | null;
  error?: string;
}

export interface WishlistDeps {
  store: Store;
  getDestinationFolder: () => Promise<string>;
  /** Jeu présent dans un des dossiers de bibliothèque (absent : seul le dossier principal compte). */
  isInLibrary?: (gameId: string) => Promise<boolean>;
  fetchMetadata: (gameId: string) => Promise<GameMetadata>;
  /** Télécharge `url` vers `outputPath` (fichier complet ou rien). */
  downloadImage: (url: string, outputPath: string) => Promise<void>;
  coverDir: () => string;
}

/** IDs DLsite trouvés dans un texte libre (IDs, liens, liste collée), dédoublonnés, dans l'ordre. */
export function parseGameIds(text: string): string[] {
  const ids = (text.match(GAME_ID_IN_TEXT) ?? []).map(id => id.toUpperCase());
  return [...new Set(ids)].filter(id => GAME_ID_REGEX.test(id));
}

async function runWithConcurrency<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  }));
}

export class Wishlist {
  constructor(private deps: WishlistDeps) {}

  private coverPath(gameId: string): string {
    return path.join(this.deps.coverDir(), `${gameId}.jpg`);
  }

  private async isInLibrary(gameId: string): Promise<boolean> {
    if (this.deps.isInLibrary) return this.deps.isInLibrary(gameId);
    const folder = await this.deps.getDestinationFolder();
    return Boolean(folder) && fs.existsSync(path.join(folder, gameId));
  }

  /** Liste, du plus récent ajout au plus ancien, après avoir retiré les jeux arrivés dans la bibliothèque. */
  async list(): Promise<WishlistItem[]> {
    const all = await this.deps.store.getAll() as Record<string, StoredItem>;
    const items: WishlistItem[] = [];
    for (const [id, item] of Object.entries(all)) {
      if (await this.isInLibrary(id)) {
        await this.remove(id);
        continue;
      }
      items.push({
        id,
        addedAt: item.addedAt,
        work_name: item.work_name ?? null,
        circle: item.circle ?? null,
        age_category: item.age_category ?? null,
        category: item.category ?? null,
        release_date: item.release_date ?? null,
        hasCover: fs.existsSync(this.coverPath(id)),
        ...(item.error ? { error: item.error } : {})
      });
    }
    return items.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  /** Ajoute les IDs trouvés dans `text`, puis récupère leurs fiches (un échec n'empêche pas l'ajout). */
  async add(text: string): Promise<WishlistAddResult> {
    const result: WishlistAddResult = { added: [], alreadyListed: [], inLibrary: [] };
    const ids = parseGameIds(text);
    if (ids.length === 0) return { ...result, noIdFound: true };

    const now = Date.now();
    for (const [i, id] of ids.entries()) {
      if (await this.isInLibrary(id)) {
        result.inLibrary.push(id);
      } else if (await this.deps.store.insert(id, { addedAt: new Date(now + i).toISOString() } satisfies StoredItem)) {
        result.added.push(id);
      } else {
        result.alreadyListed.push(id);
      }
    }
    await runWithConcurrency(result.added, FETCH_CONCURRENCY, id => this.refresh(id));
    return result;
  }

  /** (Re)récupère la fiche et la couverture d'un ID de la liste. */
  async refresh(gameId: string): Promise<void> {
    try {
      const metadata = await this.deps.fetchMetadata(gameId);
      await this.deps.store.update(gameId, {
        work_name: metadata.work_name,
        circle: metadata.circle,
        age_category: metadata.age_category,
        category: metadata.category,
        release_date: metadata.release_date,
        work_image: metadata.work_image,
        error: undefined
      });
      if (metadata.work_image) {
        const url = metadata.work_image.startsWith('http') ? metadata.work_image : `https:${metadata.work_image}`;
        fs.mkdirSync(this.deps.coverDir(), { recursive: true });
        await this.deps.downloadImage(url, this.coverPath(gameId)).catch(error => {
          console.error(`Couverture de ${gameId} (liste de souhaits) :`, error);
        });
      }
    } catch (error) {
      // Fiche introuvable (restriction régionale, ID inexistant...) : l'ID
      // reste dans la liste, avec l'erreur, et peut être réessayé.
      await this.deps.store.update(gameId, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async remove(gameId: string): Promise<boolean> {
    fs.rmSync(this.coverPath(gameId), { force: true });
    return this.deps.store.delete(gameId);
  }
}
