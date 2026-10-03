/**
 * Captures du README (docs/screenshots/*.png, 1600×900), une couleur de
 * thème par capture pour montrer les thèmes. `npm run screenshots`.
 *
 * Chargé avant l'app (`electron -r scripts/readme-screenshots.cjs .`) :
 * travaille sur une COPIE du profil (bases et jaquettes de userData, dans le
 * dossier temporaire), jamais sur le vrai — la copie passe en anglais, R18
 * flouté, et change de thème entre les captures. Les dossiers de jeux ne sont
 * que lus (scan de la bibliothèque).
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'docs', 'screenshots');
const WIDTH = 1600;
const HEIGHT = 900;
// Fiche montrée sur la capture de la page d'un jeu (à défaut : le premier jeu).
const GAME_ID = 'RJ01226398';

/** Une capture : thème, puis navigation dans l'interface (code exécuté dans la page). */
const SHOTS = [
  { file: 'home.png', theme: 'neon', steps: [`click('button[aria-label="Home"]')`] },
  { file: 'library.png', theme: 'sakura', steps: [`click('button[aria-label="Library"]')`] },
  {
    file: 'game-page.png',
    theme: 'aizome',
    steps: [`click('button[aria-label="Library"]')`, `click('[data-game-id="${GAME_ID}"]') || click('[data-game-id]')`]
  },
  { file: 'settings.png', theme: 'retro', steps: [`click('button[aria-label="Settings"]')`, `clickText('In-game tools')`] },
  { file: 'themes.png', theme: 'turbo', steps: [`click('button[aria-label="Settings"]')`, `clickText('Display')`] }
];

// Fichiers du profil utiles à l'interface (pas les caches de Chromium).
const PROFILE_ENTRIES = ['settings.db', 'archive-passwords.db', 'cache.db', 'wishlist.db', 'translations.db', 'disk-usage.db', 'macros.db', 'img_cache'];

// Chargé avant l'app : son nom (donc son userData) n'est pas encore connu, on le lit dans package.json.
const source = path.join(app.getPath('appData'), require('../package.json').name);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dlsgm-screenshots-'));
for (const entry of PROFILE_ENTRIES) {
  const from = path.join(source, entry);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(profile, entry), { recursive: true });
}
app.setPath('userData', profile);
console.log(`Profil copié dans ${profile}`);

const HELPERS = `
  window.click = selector => { const element = document.querySelector(selector); element?.click(); return Boolean(element); };
  window.clickText = text => {
    const element = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text);
    element?.click();
    return Boolean(element);
  };
  true;
`;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function reloadAndWait(window) {
  window.webContents.reload();
  await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  await wait(3000); // scan de la bibliothèque, jaquettes
}

/** Enregistre des réglages dans la copie du profil, puis recharge pour repartir d'un état cohérent. */
async function saveAndReload(window, patch) {
  await window.webContents.executeJavaScript(`(async () => {
    const settings = await window.electronAPI.getSettings();
    await window.electronAPI.saveSettings({ ...settings, ...${JSON.stringify(patch)} });
  })()`);
  await wait(800); // un changement de langue recharge déjà la fenêtre
  await reloadAndWait(window);
}

/** Jamais de capture sans le flou R18 ni ailleurs qu'en anglais (le README est public). */
async function assertSafe(window) {
  const state = await window.webContents.executeJavaScript(`(async () => ({
    lang: document.documentElement.lang,
    blur: (await window.electronAPI.getSettings()).blurAdultContent
  }))()`);
  if (state.lang !== 'en' || state.blur !== true) throw new Error(`Capture refusée : ${JSON.stringify(state)}`);
}

async function run(window) {
  await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  window.setContentSize(WIDTH, HEIGHT);
  fs.mkdirSync(OUTPUT, { recursive: true });
  // Deux fois : le premier chargement peut réécrire les réglages qu'il avait lus.
  await saveAndReload(window, { uiLanguage: 'en', blurAdultContent: true });
  await saveAndReload(window, { uiLanguage: 'en', blurAdultContent: true });

  for (const shot of SHOTS) {
    await saveAndReload(window, { uiLanguage: 'en', blurAdultContent: true, theme: shot.theme });
    await assertSafe(window);
    await window.webContents.executeJavaScript(HELPERS);
    for (const step of shot.steps) {
      if (!(await window.webContents.executeJavaScript(step))) throw new Error(`Étape introuvable (${shot.file}) : ${step}`);
      await wait(1200);
    }
    // Pas de focus visible ni de survol sur la capture.
    await window.webContents.executeJavaScript('document.activeElement?.blur()');
    await wait(1000);
    await assertSafe(window);
    const image = await window.webContents.capturePage();
    fs.writeFileSync(path.join(OUTPUT, shot.file), image.resize({ width: WIDTH, height: HEIGHT, quality: 'best' }).toPNG());
    console.log(`${shot.file} (${shot.theme})`);
  }
}

app.once('browser-window-created', (_event, window) => {
  run(window)
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => {
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
      } catch {
        console.warn(`Copie du profil à supprimer à la main : ${profile}`);
      }
      app.exit(process.exitCode ?? 0);
    });
});

// Pas d'autre instance ni de fenêtre secondaire attendue : sécurité si l'app ne s'ouvre pas.
setTimeout(() => {
  if (BrowserWindow.getAllWindows().length === 0) {
    console.error('Fenêtre principale jamais ouverte');
    app.exit(1);
  }
}, 60_000);
