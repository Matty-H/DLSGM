/**
 * Génère les icônes de l'exécutable et de l'installeur, aux couleurs du thème
 * par défaut (Néon Tokyo, la palette officielle) :
 * - build/icon.ico (Windows) : 16 à 256 px, chaque taille dessinée à sa
 *   taille depuis le logo vectoriel (jamais une grande image réduite — c'est
 *   ce qui crénelait l'icône quand electron-builder convertissait un PNG) ;
 * - build/icon.icns (macOS) : 16 à 1024 px, au gabarit Apple (plaque
 *   arrondie, marge transparente) ;
 * - build/icon.png (1024 px, Linux) ;
 * et les logos du README aux mêmes couleurs, sans fond (docs/logo/*-neon.svg).
 * Les autres thèmes ne changent que l'icône de la fenêtre, de la zone de
 * notification et du Dock, à l'exécution, avec les mêmes tracés.
 *
 * Lancé par `npm run icon` (Chromium rasterise le SVG ; compile d'abord
 * src/main et src/shared vers dist/main).
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { LOGO_HORIZONTAL, LOGO_SQUARE, MAC_ICON_SIZES, WINDOWS_ICON_SIZES, appIconSvg, logoSvg } = require(path.join(root, 'dist/main/shared/logo.js'));
const { DEFAULT_THEME, ICON_CORNER_RADIUS, resolveTheme } = require(path.join(root, 'dist/main/shared/themes.js'));
const { encodeIcns, encodeIco } = require(path.join(root, 'dist/main/main/icon-files.js'));

/** SVG rasterisé par Chromium à sa taille exacte, comme le fait le renderer à l'exécution (hooks/activeTheme.ts). */
function rasterize(window, svg, size) {
  const source = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return window.webContents.executeJavaScript(`(async () => {
    const image = new Image(${size}, ${size});
    image.src = ${JSON.stringify(source)};
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ${size};
    canvas.getContext('2d').drawImage(image, 0, 0, ${size}, ${size});
    return canvas.toDataURL('image/png');
  })()`).then(dataUrl => Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(path.relative(root, file));
}

async function generate() {
  const theme = resolveTheme(DEFAULT_THEME);
  const colors = { background: theme.icon.bg, dls: theme.icon.dls, gm: theme.icon.gm };
  const cornerRadius = theme.icon.rounded ? ICON_CORNER_RADIUS : 0;

  // Logos du README sans fond (cadrés au plus près) : un aplat sombre jure sur le thème clair comme sur le sombre de GitHub.
  for (const [name, shape] of [['square', LOGO_SQUARE], ['horizontal', LOGO_HORIZONTAL]]) {
    write(path.join(root, 'docs', 'logo', `dlsgm-${name}-${theme.id}.svg`), `${logoSvg(shape, { dls: colors.dls, gm: colors.gm })}\n`);
  }

  const window = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await window.loadURL('data:text/html;charset=utf-8,<body></body>');
  const square = size => rasterize(window, appIconSvg(colors, { size, cornerRadius }), size);
  const mac = size => rasterize(window, appIconSvg(colors, { size, mac: true }), size);

  const windowsPngs = [];
  for (const size of WINDOWS_ICON_SIZES) windowsPngs.push(await square(size));
  write(path.join(root, 'build', 'icon.ico'), encodeIco(windowsPngs));
  const macPngs = [];
  for (const size of MAC_ICON_SIZES) macPngs.push(await mac(size));
  write(path.join(root, 'build', 'icon.icns'), encodeIcns(macPngs));
  write(path.join(root, 'build', 'icon.png'), await square(1024));
  console.log(`(${theme.id})`);
}

app.disableHardwareAcceleration();
app.whenReady()
  .then(generate)
  .then(() => app.exit(0))
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
