import type { Messages } from '../i18n.js';
import { WISHLIST } from './messages/wishlist.js';
import { STATS } from './messages/stats.js';
import { NETWORK } from './messages/network.js';
import { TOOLS } from './messages/tools.js';
import { SHARE } from './messages/share.js';
import { OCR } from './messages/ocr.js';
import { FORMAT } from './messages/format.js';
import { COLLECTIONS } from './messages/collections.js';
import { GAME } from './messages/game.js';
import { LIBRARY } from './messages/library.js';
import { INGAME } from './messages/ingame.js';
import { SETTINGS } from './messages/settings.js';
import { COMMON } from './messages/common.js';

/** Toutes les traductions de l'interface (clé = texte français), un fichier par zone. */
export const MESSAGES: Messages = {
  ...WISHLIST,
  ...STATS,
  ...NETWORK,
  ...TOOLS,
  ...SHARE,
  ...OCR,
  ...FORMAT,
  ...COLLECTIONS,
  ...GAME,
  ...LIBRARY,
  ...INGAME,
  ...SETTINGS,
  ...COMMON,
};
