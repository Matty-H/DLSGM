import { fetchGameMetadata, retryMissingImages, retryThroughVpn } from './dataFetcher.js';
import { loadSettings } from './settings.js';
import { loadCache } from './cacheManager.js';

/**
 * Scanne le dossier de destination pour détecter les nouveaux jeux.
 *
 * Ce module est volontairement dépourvu de toute manipulation du DOM : il
 * retourne un statut, à charge de l'appelant (le hook useGamesLibrary) de
 * mettre à jour l'interface en conséquence.
 */

// Nombre de jeux traités en parallèle lors d'un scan : reste économe vis-à-vis
// de DLsite tout en évitant qu'un scan initial ne traite tout en série.
const FETCH_CONCURRENCY = 3;

export interface ScanResult {
  status: 'no-folder' | 'empty' | 'ok';
  gameFolders?: string[];
}

/**
 * Exécute `worker` sur chaque élément de `items`, avec au plus `limit`
 * exécutions en parallèle.
 */
async function runWithConcurrencyLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;

  async function processNext(): Promise<void> {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => processNext()));
}

/**
 * Scanne le dossier des jeux, récupère les métadonnées manquantes et retente
 * les images incomplètes.
 */
export async function scanGames(): Promise<ScanResult> {
  // Liste les dossiers correspondant au format DLSite (null = dossier introuvable).
  // Aucune purge : les fiches des jeux absents sont conservées (voir dataFetcher.ts).
  // Tous les dossiers de bibliothèque (null : aucun n'existe).
  const gameFolders = await window.electronAPI.listGameFolders();
  if (!gameFolders) {
    console.error("Le dossier des jeux n'existe pas");
    return { status: 'no-folder' };
  }

  if (gameFolders.length === 0) {
    return { status: 'empty' };
  }

  const cache = await loadCache();

  // Nouveaux jeux : récupération des métadonnées.
  const gamesToFetch = gameFolders.filter(gameId => !cache[gameId]);
  // Jeux déjà en cache mais dont le téléchargement d'images est incomplet :
  // on retente uniquement les images, sans jamais toucher aux métadonnées.
  // `!== true` (et non `=== false`) pour aussi rattraper les entrées où
  // imagesComplete n'a jamais été écrit du tout (fetch métadonnées réussi,
  // mais l'appel de téléchargement d'images ayant levé une exception avant
  // que le flag ne soit enregistré) — sinon ces jeux restent bloqués sans
  // image pour toujours, invisibles à la fois du statut "échec" et de ce filtre.
  const gamesNeedingImages = gameFolders.filter(gameId => cache[gameId] && cache[gameId].imagesComplete !== true);

  await runWithConcurrencyLimit(gamesToFetch, FETCH_CONCURRENCY, gameId => fetchGameMetadata(gameId).then(() => undefined));
  await runWithConcurrencyLimit(gamesNeedingImages, FETCH_CONCURRENCY, retryMissingImages);

  // Fiches en échec refaites une fois à travers le VPN japonais (restriction
  // régionale) si l'option est active ; un nouvel échec y est noté
  // (`failedThroughVpn`) pour ne pas reconnecter le VPN à chaque scan.
  if ((await loadSettings()).piaRetry) {
    const afterFetch = await loadCache();
    const failed = gameFolders.filter(gameId => afterFetch[gameId]?.fetchFailed && !afterFetch[gameId].failedThroughVpn);
    if (failed.length > 0) {
      await retryThroughVpn({ failedEntries: failed }).catch(error => console.error('Nouvelle tentative via le VPN impossible :', error));
    }
  }


  return { status: 'ok', gameFolders };
}
