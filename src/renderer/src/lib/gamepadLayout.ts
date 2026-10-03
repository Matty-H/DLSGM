import { t } from './i18n.js';

/**
 * Famille de manette et libellés de ses boutons, pour afficher les bons
 * symboles dans l'interface (barre d'aide du bas).
 *
 * La navigation reste positionnelle, comme le fait Steam par défaut : le
 * bouton du bas valide et celui de droite revient en arrière, quelle que
 * soit la manette. Sur une Switch Pro, le bouton du bas est donc "B" ; c'est
 * ce libellé qui est affiché, pour correspondre à ce qui est imprimé dessus.
 */

export type PadType = 'xbox' | 'playstation' | 'nintendo';

/** Boutons par position dans la disposition "standard" de l'API Gamepad. */
export type PadButton = 'south' | 'east' | 'west' | 'north' | 'lb' | 'rb' | 'lt' | 'rt' | 'view' | 'menu';

/**
 * Déduit la famille de manette de `Gamepad.id`, qui contient le nom du
 * périphérique et, sous Chromium, ses identifiants USB (ex:
 * "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)").
 * 054c = Sony, 057e = Nintendo ; tout le reste (Xbox, Steam Deck, XInput
 * génériques) utilise la disposition Xbox.
 */
export function detectPadType(gamepadId: string): PadType {
  const id = gamepadId.toLowerCase();
  if (/vendor: ?054c|054c-|dualsense|dualshock|playstation|ps[345] controller/.test(id)) return 'playstation';
  if (/vendor: ?057e|057e-|nintendo|pro controller|joy-con/.test(id)) return 'nintendo';
  return 'xbox';
}

/** Symboles PlayStation, rendus en icônes par FooterHints. */
export const PS_CROSS = '✕';
export const PS_CIRCLE = '○';
export const PS_SQUARE = '□';
export const PS_TRIANGLE = '△';

export const PAD_LABELS: Record<PadType, Record<PadButton, string>> = {
  xbox: { south: 'A', east: 'B', west: 'X', north: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', view: 'View', menu: 'Menu' },
  playstation: {
    south: PS_CROSS,
    east: PS_CIRCLE,
    west: PS_SQUARE,
    north: PS_TRIANGLE,
    lb: 'L1',
    rb: 'R1',
    lt: 'L2',
    rt: 'R2',
    // Libellé lu à l'affichage : la table est créée avant que la langue soit connue.
    get view() {
      return t('Créer');
    },
    menu: 'Options'
  },
  nintendo: { south: 'B', east: 'A', west: 'Y', north: 'X', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR', view: '−', menu: '+' }
};
