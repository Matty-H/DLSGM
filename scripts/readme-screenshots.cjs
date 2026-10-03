/**
 * Captures du README (docs/screenshots/*.png, 1600×900), une couleur de
 * thème par capture pour montrer les thèmes. `npm run screenshots`.
 * La navigation animée en tête du README est faite par `readme-gif.cjs`.
 *
 * Chargé avant l'app (`electron -r scripts/readme-screenshots.cjs .`) : voir
 * `readme-capture.cjs` (copie du profil, anglais, R18 flouté, `assertSafe`).
 */
const fs = require('fs');
const path = require('path');
const { WIDTH, HEIGHT, HELPERS, wait, useProfileCopy, saveAndReload, assertSafe, prepareWindow, captureMain } = require('./readme-capture.cjs');

const OUTPUT = path.join(__dirname, '..', 'docs', 'screenshots');

/** Une capture : thème, puis navigation dans l'interface (code exécuté dans la page). */
const SHOTS = [
  { file: 'settings.png', theme: 'retro', steps: [`click('button[aria-label="Settings"]')`, `clickText('In-game tools')`] },
  { file: 'themes.png', theme: 'turbo', steps: [`click('button[aria-label="Settings"]')`, `clickText('Display')`] }
];

const profile = useProfileCopy();

captureMain(profile, async window => {
  await prepareWindow(window);
  fs.mkdirSync(OUTPUT, { recursive: true });

  for (const shot of SHOTS) {
    await saveAndReload(window, { theme: shot.theme });
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
});
