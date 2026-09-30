import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import zlib from 'zlib';

/**
 * Icône de la zone de notification (option `closeToTray`) : fermer la
 * fenêtre la cache au lieu de quitter, pour que le suivi du temps de jeu, la
 * copie des sauvegardes à la fermeture d'un jeu et la réception réseau local
 * continuent. "Quitter" dans le menu de l'icône quitte vraiment.
 */

let tray: Tray | null = null;
let enabled = false;
let quitting = false;

app.on('before-quit', () => {
  quitting = true;
});

/** PNG RGBA minimal (pas de fichier d'icône dans le dépôt) : disque bleu accent, cercle blanc au centre. */
function drawIcon(size: number): Buffer {
  const rows: Buffer[] = [];
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // octet de filtre PNG (0) + pixels
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - center, y - center) / (size / 2);
      const [r, g, b, a] =
        distance > 0.98 ? [0, 0, 0, 0] :
        distance > 0.3 && distance < 0.5 ? [255, 255, 255, 255] :
        [0x1a, 0x9f, 0xff, 255];
      row.set([r, g, b, a], 1 + x * 4);
    }
    rows.push(row);
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, compression/filtre/entrelacement standard
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function showWindow(getWindow: () => BrowserWindow | null): void {
  const window = getWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/**
 * Active ou désactive l'icône. Idempotent : appelé au démarrage puis à
 * chaque enregistrement des paramètres.
 */
export function setTrayEnabled(value: boolean, getWindow: () => BrowserWindow | null): void {
  enabled = value;
  if (!value) {
    tray?.destroy();
    tray = null;
    // Fenêtre cachée au moment où l'option est désactivée : sans icône, plus
    // aucun moyen de la rouvrir.
    const window = getWindow();
    if (window && !window.isVisible()) window.show();
    return;
  }
  if (tray) return;
  tray = new Tray(nativeImage.createFromBuffer(drawIcon(32)));
  tray.setToolTip('DLSGM');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir DLSGM', click: () => showWindow(getWindow) },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() }
  ]));
  tray.on('click', () => showWindow(getWindow));
}

/** À brancher sur l'événement `close` de la fenêtre : la cache au lieu de la fermer si l'option est active. */
export function hideInsteadOfClose(event: Electron.Event, window: BrowserWindow): void {
  if (enabled && tray && !quitting) {
    event.preventDefault();
    window.hide();
  }
}
