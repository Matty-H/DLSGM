/**
 * Socle commun des captures du README (`readme-screenshots.cjs`,
 * `readme-gif.cjs`), chargés avant l'app avec `electron -r`.
 *
 * Travaille sur une COPIE du profil (bases et jaquettes de userData, dans le
 * dossier temporaire), jamais sur le vrai — la copie passe en anglais, R18
 * flouté. Les dossiers de jeux ne sont que lus (scan de la bibliothèque).
 * Le README est public : `assertSafe` refuse toute capture sans le flou R18
 * ou ailleurs qu'en anglais.
 */
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WIDTH = 1600;
const HEIGHT = 900;
// Fiche montrée sur la page d'un jeu (à défaut : le premier jeu).
const GAME_ID = 'RJ01226398';
const SAFE_SETTINGS = { uiLanguage: 'en', blurAdultContent: true };

// Fichiers du profil utiles à l'interface (pas les caches de Chromium).
const PROFILE_ENTRIES = ['settings.db', 'archive-passwords.db', 'cache.db', 'wishlist.db', 'translations.db', 'disk-usage.db', 'macros.db', 'img_cache'];

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

/** Copie le profil et y redirige userData — à appeler au chargement, avant que l'app ne lise quoi que ce soit. */
function useProfileCopy() {
  // Chargé avant l'app : son nom (donc son userData) n'est pas encore connu, on le lit dans package.json.
  const source = path.join(app.getPath('appData'), require('../package.json').name);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dlsgm-screenshots-'));
  for (const entry of PROFILE_ENTRIES) {
    const from = path.join(source, entry);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(profile, entry), { recursive: true });
  }
  app.setPath('userData', profile);
  console.log(`Profil copié dans ${profile}`);
  return profile;
}

async function reloadAndWait(window) {
  window.webContents.reload();
  await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  await wait(3000); // scan de la bibliothèque, jaquettes
}

/** Enregistre des réglages dans la copie du profil, puis recharge pour repartir d'un état cohérent. */
async function saveAndReload(window, patch) {
  await window.webContents.executeJavaScript(`(async () => {
    const settings = await window.electronAPI.getSettings();
    await window.electronAPI.saveSettings({ ...settings, ...${JSON.stringify({ ...patch, ...SAFE_SETTINGS })} });
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

/** Attend la fenêtre principale, la met en 1600×900 et la passe (deux fois) en anglais flouté. */
async function prepareWindow(window) {
  // Manette ignorée à chaque chargement : une manette branchée (ou un stick qui dérive) changerait
  // d'onglet en pleine capture, ou révélerait une jaquette floutée.
  window.webContents.on('did-finish-load', () => {
    window.webContents.executeJavaScript('navigator.getGamepads = () => []; true').catch(() => {});
  });
  await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  window.setContentSize(WIDTH, HEIGHT);
  // Deux fois : le premier chargement peut réécrire les réglages qu'il avait lus.
  await saveAndReload(window, {});
  await saveAndReload(window, {});
}

/**
 * Supprime la copie du profil une fois l'app quittée : Chromium y garde des
 * fichiers ouverts (cache, bases) jusqu'à la fin du processus. Un Node détaché
 * (l'exécutable d'Electron en mode Node) attend la sortie puis supprime.
 */
function removeAfterExit(profile) {
  const cleaner = `
    const [profile, pid] = process.argv.slice(-2);
    const alive = () => { try { process.kill(Number(pid), 0); return true; } catch { return false; } };
    const tick = () => alive() ? setTimeout(tick, 500) : require('fs').rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    tick();
  `;
  spawn(process.execPath, ['-e', cleaner, profile, String(process.pid)], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  }).unref();
}

/** Lance `run(window)` sur la fenêtre principale, supprime la copie du profil et quitte. */
function captureMain(profile, run) {
  // Pas d'autre instance ni de fenêtre secondaire attendue : sécurité si l'app ne s'ouvre pas.
  const timeout = setTimeout(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      console.error('Fenêtre principale jamais ouverte');
      removeAfterExit(profile);
      app.exit(1);
    }
  }, 60_000);

  app.once('browser-window-created', (_event, window) => {
    clearTimeout(timeout);
    run(window)
      .catch(error => {
        console.error(error);
        process.exitCode = 1;
      })
      .finally(() => {
        removeAfterExit(profile);
        app.exit(process.exitCode ?? 0);
      });
  });
}

module.exports = { WIDTH, HEIGHT, GAME_ID, HELPERS, wait, useProfileCopy, saveAndReload, assertSafe, prepareWindow, captureMain };
