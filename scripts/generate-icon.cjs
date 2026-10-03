/**
 * Génère build/icon.png (1024 px), l'icône de l'exécutable et de
 * l'installeur qu'electron-builder convertit en .ico/.icns : logo carré aux
 * couleurs du thème par défaut (Néon Tokyo, la palette officielle) ; et les
 * logos du README aux mêmes couleurs (docs/logo/*-neon.svg). Les autres
 * thèmes ne changent que l'icône de la fenêtre et de la zone de
 * notification, à l'exécution.
 *
 * Lancé par `npm run icon` (Electron rasterise le SVG ; compile d'abord
 * src/shared vers dist/main/shared).
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { LOGO_HORIZONTAL, LOGO_SQUARE, logoSvg } = require(path.join(root, 'dist/main/shared/logo.js'));
const { DEFAULT_THEME, resolveTheme } = require(path.join(root, 'dist/main/shared/themes.js'));

const SIZE = 1024;

async function generate() {
  const theme = resolveTheme(DEFAULT_THEME);
  const colors = { background: theme.icon.bg, dls: theme.icon.dls, gm: theme.icon.gm };

  for (const [name, shape] of [['square', LOGO_SQUARE], ['horizontal', LOGO_HORIZONTAL]]) {
    const file = path.join(root, 'docs', 'logo', `dlsgm-${name}-${theme.id}.svg`);
    fs.writeFileSync(file, `${logoSvg(shape, colors)}\n`);
    console.log(path.relative(root, file));
  }

  const svg = logoSvg(LOGO_SQUARE, colors, { width: SIZE, height: SIZE });
  const window = new BrowserWindow({ width: SIZE, height: SIZE, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;overflow:hidden">${svg}</body>`));
  await new Promise(resolve => setTimeout(resolve, 300));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const output = path.join(root, 'build', 'icon.png');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, image.resize({ width: SIZE, height: SIZE, quality: 'best' }).toPNG());
  console.log(`${path.relative(root, output)} (${theme.id})`);
}

app.disableHardwareAcceleration();
app.whenReady()
  .then(generate)
  .then(() => app.exit(0))
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
