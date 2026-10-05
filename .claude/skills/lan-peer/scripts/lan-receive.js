// Réception LAN avec le VRAI code de DLSGM (LanShare.startReceiver compilé), sans l'UI,
// dans un dossier de TEST — jamais la vraie bibliothèque ni le vrai cache.
//   npx tsc -p tsconfig.main.json
//   npx electron .claude/skills/lan-peer/scripts/lan-receive.js [dossier=<tmp>/dlsgm-lan-recv] > recv.log 2>&1
// Toujours rediriger vers un fichier : à travers un pipe (grep…) la sortie
// d'Electron reste bufferisée et le code à 6 chiffres n'apparaît jamais.
// Ouvre un port en écoute (47821 + UDP 47822) : à lancer seulement avec l'accord de l'utilisateur.
// Arrêt : tuer le processus (il ne quitte pas seul, même fermé après 10 mauvais codes).
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { REPO } = require('./session');

const ROOT = process.argv[2] || path.join(os.tmpdir(), 'dlsgm-lan-recv');
const GAMES = path.join(ROOT, 'Games');
const IMG = path.join(ROOT, 'img_cache');
const CACHE = path.join(ROOT, 'cache.json');
fs.mkdirSync(GAMES, { recursive: true });
fs.mkdirSync(IMG, { recursive: true });
const { LanShare } = require(path.join(REPO, 'dist/main/main/lan-share.js'));

const readCache = () => (fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {});
let last = 0;

app.whenReady().then(async () => {
  const lan = new LanShare({
    getDestinationFolder: async () => GAMES,
    getImgCacheDir: () => IMG,
    getCacheEntry: async id => readCache()[id],
    insertCacheEntry: async (id, entry) => {
      const c = readCache();
      if (c[id]) return false;
      c[id] = entry;
      fs.writeFileSync(CACHE, JSON.stringify(c, null, 1));
      return true;
    },
    emitProgress: p => {
      const now = Date.now();
      if (p.state !== 'active' || now - last > 3000) {
        last = now;
        console.log(new Date().toISOString(), `[${p.state}] ${p.gameId} de ${p.peer} ${p.doneFiles}/${p.totalFiles} ${p.transferredBytes}/${p.totalBytes} o${p.error ? ' — ' + p.error : ''}`);
      }
    },
    emitReceiverStatus: s => console.log('STATUT', JSON.stringify(s))
  });
  console.log('RECEPTION', JSON.stringify(await lan.startReceiver(47821)), 'dossier', ROOT);
});
