import type { WishlistAddResult, WishlistItem } from '../../../shared/ipc-types';
import { t } from './i18n.js';

/** Liste de souhaits : fines surcouches IPC (logique dans src/main/wishlist.ts), sans DOM. */

export type { WishlistAddResult, WishlistItem };

export const getWishlist = () => window.electronAPI.getWishlist();
export const addToWishlist = (text: string) => window.electronAPI.addToWishlist(text);
export const removeFromWishlist = (gameId: string) => window.electronAPI.removeFromWishlist(gameId);
export const refreshWishlistItem = (gameId: string) => window.electronAPI.refreshWishlistItem(gameId);

/** URL `atom://` de la couverture d'un jeu de la liste. */
export const wishlistCoverSrc = (gameId: string) => `atom://img/_wishlist/${gameId}.jpg`;

/** Phrase de bilan d'un ajout (ex: "2 ajoutés · RJ01234567 déjà dans la bibliothèque"). */
export function describeAddResult(result: WishlistAddResult): string {
  if (result.noIdFound) return t('Aucun ID DLsite trouvé (ex: RJ01234567, ou un lien vers la page du jeu).');
  const parts: string[] = [];
  if (result.added.length > 0) parts.push(t('{n} ajouté(s)', { n: result.added.length }));
  if (result.alreadyListed.length > 0) parts.push(t('déjà dans la liste : {ids}', { ids: result.alreadyListed.join(', ') }));
  if (result.inLibrary.length > 0) parts.push(t('déjà dans la bibliothèque : {ids}', { ids: result.inLibrary.join(', ') }));
  return parts.join(' · ');
}
