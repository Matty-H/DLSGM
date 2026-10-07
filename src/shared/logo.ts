/**
 * Tracés du logo DLSGM (SVG d'origine : docs/logo/), en deux groupes
 * coloriables séparément, « DLS » et « GM ». Le rectangle blanc des SVG
 * d'origine n'est qu'un cadre : il n'est dessiné que quand un fond est voulu
 * (icône), jamais sur l'interface sombre.
 *
 * Sans import : partagé par main (tsc), le renderer (Vite) et
 * scripts/generate-icon.cjs (via dist/main/shared).
 */

export interface LogoShape {
  /** viewBox complet du SVG d'origine (cadre compris). */
  viewBox: [number, number, number, number];
  /** viewBox serré sur les lettres, pour l'affichage sans fond. */
  tightViewBox: [number, number, number, number];
  dls: string[];
  gm: string[];
}

export const LOGO_SQUARE: LogoShape = {
  viewBox: [0, 0, 62.44, 62.44],
  tightViewBox: [7.86, 8.86, 46.73, 44.72],
  dls: [
    'M35.32,22.89V30.49H24.92V8.86h7.73V22.89Z',
    'M24.3,19.61c0,.89-.06,1.71-.18,2.47-.6,3.83-2.62,5.91-4.81,7.05,0,0,0,0,0,0-1.53.8-3.16,1.12-4.45,1.26-.92.1-1.65.1-2.08.1h-4.91V8.86h3.65c2.36,0,11.25,0,12.61,8.43.12.71.18,1.49.18,2.32Z',
    'M54.54,8.86v7.57h-.02c-2.41,0-3.28,2.19-4.55,5.69-2.1,5.78-5.97,8.38-12.02,8.38h-2.01v-7.61h.18c3.94-.03,5.35-1.14,7.61-6.79,1.98-4.98,4.67-7.24,9.77-7.24h1.04Z'
  ],
  gm: [
    'M21.51,41.56v-12.56c-.16,0-.31,0-.47,0-1.94,1.44-4.55,2.22-7.78,2.28-3.36,2.2-5.4,5.85-5.4,10.38,0,7.23,5.12,11.92,13.17,11.92,1.51,0,2.97-.21,4.33-.59l2.2-11.44h-6.06Z',
    'M49.83,28.53l-9.57,7.5-6.04-4.73h-4.07l-4.22,21.88h28.66l-4.75-24.65Z'
  ]
};

export const LOGO_HORIZONTAL: LogoShape = {
  viewBox: [0, 0, 193.41, 62.44],
  tightViewBox: [5.88, 7.47, 181.66, 45.69],
  dls: [
    'M5.88,8.92h7.46c5.24,0,26.16,0,26.16,21.99s-19.4,22.24-23.57,22.24H5.88V8.92Z',
    'M40.77,8.92h15.8v28.69h5.48v15.54h-21.27V8.92Z',
    'M63.31,37.61c8.34,0,11.25-2.15,15.92-13.9,4.04-10.17,9.54-14.79,19.97-14.79h2.15v15.48h-.06c-4.93,0-6.7,4.49-9.29,11.63-4.3,11.82-12.19,17.12-24.58,17.12h-4.11v-15.54Z'
  ],
  gm: [
    'M127.23,31.24V8.34c-14.55,0-24.89,9.35-24.89,23.09s9.35,21.73,24.02,21.73c2.75,0,5.42-.38,7.89-1.07l4.02-20.85h-11.04Z',
    'M143.95,7.47l17.46,13.68,17.46-13.68,8.67,44.94h-52.25l8.67-44.94Z'
  ]
};

/** SVG autonome (chaîne) : icône avec fond si `background`, sinon lettres seules sur viewBox serré. */
export function logoSvg(shape: LogoShape, colors: { dls: string; gm: string; background?: string }, size?: { width: number; height: number }): string {
  const box = colors.background ? shape.viewBox : shape.tightViewBox;
  const dimensions = size ? ` width="${size.width}" height="${size.height}"` : '';
  const background = colors.background ? `<rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="${colors.background}"/>` : '';
  const paths = (list: string[], fill: string) => `<g fill="${fill}">${list.map(d => `<path d="${d}"/>`).join('')}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}"${dimensions}>${background}${paths(shape.gm, colors.gm)}${paths(shape.dls, colors.dls)}</svg>`;
}

/**
 * Tailles rasterisées pour l'icône de l'application. Windows choisit dans le
 * .ico la taille exacte voulue par l'écran (16 px à 100 %, 20 à 125 %, 24 à
 * 150 %... barre des tâches, Alt+Tab, Explorateur) : chacune est dessinée à
 * sa taille plutôt que réduite. macOS : 16 à 1024 px (.icns, Retina compris).
 */
export const WINDOWS_ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
export const MAC_ICON_SIZES = [16, 32, 64, 128, 256, 512, 1024];

/**
 * Gabarit Apple des icônes d'application (macOS 11 et suivants) : sur 1024 px,
 * une plaque de 824 px centrée aux coins de 185 px. Une icône pleine page
 * paraîtrait plus grosse que toutes les autres dans le Dock.
 */
const MAC_ICON_CANVAS = 1024;
const MAC_ICON_PLATE = 824;
const MAC_ICON_RADIUS = 185.4;

/**
 * Icône carrée de l'application (SVG autonome, `size` px) : fond aux coins
 * arrondis selon `cornerRadius` (fraction du côté, 0 = carré), ou gabarit
 * macOS si `mac` (coins imposés, marge transparente).
 */
export function appIconSvg(colors: { background: string; dls: string; gm: string }, options: { size: number; cornerRadius?: number; mac?: boolean }): string {
  const side = LOGO_SQUARE.viewBox[2];
  const total = options.mac ? side * MAC_ICON_CANVAS / MAC_ICON_PLATE : side;
  const margin = (total - side) / 2;
  const radius = options.mac ? side * MAC_ICON_RADIUS / MAC_ICON_PLATE : side * (options.cornerRadius ?? 0);
  const viewBox = [-margin, -margin, total, total].map(value => Number(value.toFixed(4))).join(' ');
  const corners = radius > 0 ? ` rx="${Number(radius.toFixed(4))}"` : '';
  const paths = (list: string[], fill: string) => `<g fill="${fill}">${list.map(d => `<path d="${d}"/>`).join('')}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${options.size}" height="${options.size}">`
    + `<rect width="${side}" height="${side}"${corners} fill="${colors.background}"/>`
    + `${paths(LOGO_SQUARE.gm, colors.gm)}${paths(LOGO_SQUARE.dls, colors.dls)}</svg>`;
}

/**
 * Icône dessinée à l'exécution aux couleurs du thème, selon l'OS : Windows,
 * toutes les tailles du .ico (fenêtre, barre des tâches, zone de
 * notification) ; macOS, le Dock (1024 px au gabarit Apple, macOS réduit
 * proprement) ; ailleurs, l'icône de fenêtre en 256 px.
 */
export function appIconLayout(platform: string): { sizes: number[]; mac: boolean } {
  if (platform === 'win32') return { sizes: WINDOWS_ICON_SIZES, mac: false };
  if (platform === 'darwin') return { sizes: [1024], mac: true };
  return { sizes: [256], mac: false };
}
