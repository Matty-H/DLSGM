/**
 * GIF de navigation en tête du README (docs/screenshots/navigation.gif) :
 * accueil → bibliothèque → page d'un jeu → retour, en boucle, thème Néon
 * Tokyo (palette officielle). `npm run screenshots:gif` (ffmpeg requis, dans
 * le PATH ou via la variable FFMPEG).
 *
 * Chargé avant l'app (`electron -r scripts/readme-gif.cjs .`) : voir
 * `readme-capture.cjs` (copie du profil, anglais, R18 flouté, `assertSafe`
 * avant, pendant et après l'enregistrement). Un faux curseur dessiné dans la
 * page montre les clics ; ceux-ci sont des `element.click()` sur la carte ou
 * le bouton visé — jamais un vrai clic, qui sur une jaquette floutée la
 * révélerait.
 */
const { app } = require('electron');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GAME_ID, HELPERS, wait, useProfileCopy, saveAndReload, assertSafe, prepareWindow, captureMain } = require('./readme-capture.cjs');

const OUTPUT = path.join(__dirname, '..', 'docs', 'screenshots', 'navigation.gif');
const GIF_WIDTH = 960;
const GIF_FPS = 12;
const FRAME_INTERVAL = 1000 / GIF_FPS;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
// Position de repos du curseur (début et fin de la boucle) : entre deux étagères de l'accueil, sur aucune carte.
const REST = { x: 1250, y: 385 };

// Curseur et onde de clic, ajoutés à la page le temps de l'enregistrement.
const CURSOR = `
  (() => {
    const cursor = document.createElement('div');
    cursor.id = 'readme-cursor';
    cursor.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;transform:translate(${REST.x - 4}px,${REST.y - 2}px)';
    cursor.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5v17.2l4.6-4.3 3 6.6 3-1.4-3-6.4h6.3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    // Animations dans la page (requestAnimationFrame) : un aller-retour par étape depuis main serait saccadé.
    const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const animate = (duration, apply) => new Promise(resolve => {
      const start = performance.now();
      const frame = now => {
        const t = Math.min(1, (now - start) / duration);
        apply(ease(t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve(true);
      };
      requestAnimationFrame(frame);
    });
    let position = { x: ${REST.x}, y: ${REST.y} };
    const place = () => { cursor.style.transform = 'translate(' + (position.x - 4) + 'px,' + (position.y - 2) + 'px)'; };
    window.cursorTo = (x, y, duration) => {
      const from = position;
      return animate(duration, k => {
        position = { x: from.x + (x - from.x) * k, y: from.y + (y - from.y) * k };
        place();
      });
    };
    window.scrollContainerTo = (container, top, duration) => {
      const from = container.scrollTop;
      return animate(duration, k => { container.scrollTop = from + (top - from) * k; });
    };
    window.clickPulse = (x, y) => {
      const ring = document.createElement('div');
      ring.style.cssText = 'position:fixed;left:' + (x - 22) + 'px;top:' + (y - 22) + 'px;width:44px;height:44px;border-radius:50%;border:3px solid #fff;z-index:2147483646;pointer-events:none;opacity:.9;transform:scale(.3);transition:transform .45s ease-out,opacity .45s ease-out';
      document.body.appendChild(ring);
      requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.transform = 'scale(1)'; ring.style.opacity = '0'; }));
      setTimeout(() => ring.remove(), 600);
    };
    window.targetCenter = selector => {
      const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    };
    window.gameCard = () => document.querySelector('[data-game-id="${GAME_ID}"]') || document.querySelector('[data-game-id]');
    window.backButton = () => document.querySelector('[data-nav-scope].z-20 > button');
    // Chemins locaux (dossier de travail, sauvegardes…) : jamais à l'écran, ils peuvent contenir le nom d'utilisateur.
    const LOCAL_PATH = /[A-Za-z]:[\\\\/]|\\\\|\\/(Users|home)\\//;
    const pathElements = () => [...document.querySelectorAll('body *')].filter(element =>
      element.children.length === 0 && LOCAL_PATH.test(element.textContent));
    window.visibleLocalPaths = () => pathElements().filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
    }).map(element => element.textContent.slice(0, 40));
    // Défilement maximal (au plus \`wanted\`) qui laisse sous le bas de la fenêtre le premier chemin local du conteneur.
    window.maxSafeScroll = (container, wanted) => {
      const tops = pathElements().filter(element => container.contains(element)).map(element =>
        element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop);
      return Math.max(0, Math.min(wanted, ...tops.map(top => top - innerHeight - 20)));
    };
    return true;
  })()
`;

async function run(window, frames) {
  const page = code => window.webContents.executeJavaScript(code);

  /** Déplace le faux curseur vers `target`, puis la souris de la page (survols). */
  async function moveTo(target, duration = 650) {
    await page(`cursorTo(${target.x}, ${target.y}, ${duration})`);
    window.webContents.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y });
  }

  async function assertNoLocalPath() {
    const paths = await page('visibleLocalPaths()');
    if (paths.length > 0) throw new Error(`Chemin local à l'écran : ${JSON.stringify(paths)}`);
  }

  /** Va sur l'élément (expression évaluée dans la page) et le « clique » par element.click(). */
  async function clickOn(expression, label) {
    const target = await page(`targetCenter(${expression})`);
    if (!target) throw new Error(`Élément introuvable : ${label}`);
    await moveTo(target);
    await wait(180);
    await page(`clickPulse(${target.x}, ${target.y}); (${expression}).click(); true`);
  }

  /** Défile en douceur le conteneur `expression` jusqu'à `top`. */
  async function scrollTo(expression, top, duration) {
    await page(`scrollContainerTo(${expression}, ${top}, ${duration})`);
  }

  await prepareWindow(window);
  await saveAndReload(window, { theme: 'neon' });
  await assertSafe(window);
  await page(HELPERS);
  if (!(await page(`click('button[aria-label="Home"]')`))) throw new Error('Onglet Home introuvable');
  await wait(1500);
  await page(CURSOR);
  // Au premier plan et sans ralentissement : une fenêtre cachée par une autre est peinte au ralenti.
  window.webContents.setBackgroundThrottling(false);
  window.setAlwaysOnTop(true);
  await page('document.activeElement?.blur()');
  window.webContents.sendInputEvent({ type: 'mouseMove', x: REST.x, y: REST.y });
  await wait(300);

  // Enregistrement : les images peintes par Chromium (beginFrameSubscription, bien plus rapide que
  // capturePage), au plus une par 1/GIF_FPS s, horodatées — chacune dure jusqu'à la suivante.
  const shots = [];
  const writes = [];
  let failure = null;
  let endedAt = 0;
  let work = 0;
  window.webContents.beginFrameSubscription(false, image => {
    const at = Date.now();
    if (shots.length > 0 && at - shots.at(-1).at < FRAME_INTERVAL) return;
    const file = `frame_${String(shots.length).padStart(5, '0')}.png`;
    shots.push({ file, at });
    writes.push(fs.promises.writeFile(path.join(frames, file), image.resize({ width: GIF_WIDTH, quality: 'good' }).toPNG()));
    work += Date.now() - at;
  });
  // Vérifications répétées pendant l'enregistrement (réglages sûrs, aucun chemin local à l'écran).
  const guard = setInterval(() => {
    assertSafe(window)
      .then(assertNoLocalPath)
      .catch(error => (failure ??= error));
  }, 500);

  try {
    await wait(1800); // accueil
    await clickOn(`document.querySelector('button[aria-label="Library"]')`, 'Library');
    await wait(1800); // bibliothèque
    await page(`gameCard().scrollIntoView({ block: 'nearest', behavior: 'smooth' }); true`);
    await wait(700);
    await clickOn('gameCard()', 'carte du jeu');
    await wait(2000); // page du jeu
    await scrollTo('backButton().parentElement', await page('maxSafeScroll(backButton().parentElement, 480)'), 1300);
    await assertNoLocalPath();
    await wait(1800);
    await scrollTo('backButton().parentElement', 0, 900);
    await wait(500);
    await clickOn('backButton()', 'retour');
    await wait(1200);
    await clickOn(`document.querySelector('button[aria-label="Home"]')`, 'Home');
    await moveTo(REST, 900); // retour au point de départ : la boucle ne saute pas
    await wait(600);
    await assertSafe(window);
    await assertNoLocalPath();
  } finally {
    endedAt = Date.now();
    window.webContents.endFrameSubscription();
    clearInterval(guard);
    await Promise.all(writes);
  }
  if (failure) throw failure;
  if (shots.length === 0) throw new Error('Aucune image enregistrée');

  // Liste concat ffmpeg : chaque image dure jusqu'à la suivante.
  const list = shots
    .map((shot, i) => `file '${shot.file}'\nduration ${(((shots[i + 1]?.at ?? endedAt) - shot.at) / 1000).toFixed(3)}`)
    .join('\n');
  fs.writeFileSync(path.join(frames, 'frames.txt'), `${list}\nfile '${shots.at(-1).file}'\n`);
  const filter = `fps=${GIF_FPS},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  const result = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-vf', filter, '-loop', '0', OUTPUT], {
    cwd: frames,
    stdio: 'inherit'
  });
  if (result.error || result.status !== 0) throw new Error(`ffmpeg a échoué (${result.error?.message ?? `code ${result.status}`})`);
  const seconds = ((endedAt - shots[0].at) / 1000).toFixed(1);
  const size = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
  console.log(`${path.relative(process.cwd(), OUTPUT)} : ${seconds} s, ${shots.length} images (${(work / shots.length).toFixed(0)} ms/image), ${size} Mo`);
}

// Images peintes en 1600×900 quelle que soit la mise à l'échelle de Windows : chaque image est réduite
// et encodée sur le thread principal, trop lent depuis 2400×1350 (150 %) pour suivre le rythme.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const profile = useProfileCopy();
captureMain(profile, async window => {
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'dlsgm-gif-'));
  try {
    await run(window, frames);
  } finally {
    fs.rmSync(frames, { recursive: true, force: true, maxRetries: 5 });
  }
});
