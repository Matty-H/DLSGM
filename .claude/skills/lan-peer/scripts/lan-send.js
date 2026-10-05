// Envoi LAN avec le VRAI code de DLSGM (LanShare.sendGames compilé), sans l'UI.
//   npx tsc -p tsconfig.main.json
//   npx electron .claude/skills/lan-peer/scripts/lan-send.js <host> <port> <code> <ID...>
// Découverte UDP incluse (affichée). La bibliothèque est lue en LECTURE SEULE :
// settings.db / cache.db parsés ligne à ligne, jamais ouverts par NeDB (DLSGM
// peut tourner en même temps ; deux Datastores sur un fichier le corrompent).
// Un code qui n'a pas 6 chiffres (ex. « x ») ne fait que la découverte.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { REPO, userDataDir } = require('./session');

const USER_DATA = userDataDir();
const { LanShare } = require(path.join(REPO, 'dist/main/main/lan-share.js'));

function readDb(file) {
  const docs = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const doc = JSON.parse(line);
    if (doc.$$deleted) docs.delete(doc._id); else docs.set(doc._id, doc);
  }
  return docs;
}

app.whenReady().then(async () => {
  const [host, port, code, ...ids] = process.argv.slice(2);
  const settings = readDb(path.join(USER_DATA, 'settings.db'));
  const cache = readDb(path.join(USER_DATA, 'cache.db'));
  const dest = process.env.GAMES_DIR || settings.get('destinationFolder').value;
  let last = 0;
  const lan = new LanShare({
    getDestinationFolder: async () => dest,
    getImgCacheDir: () => path.join(USER_DATA, 'img_cache'),
    getCacheEntry: async id => cache.get(id)?.value,
    insertCacheEntry: async () => false,
    emitProgress: p => {
      const now = Date.now();
      if (p.state !== 'active' || now - last > 3000) {
        last = now;
        console.log(`[${p.state}] ${p.gameId} ${p.doneFiles}/${p.totalFiles} fichiers ${(p.transferredBytes / 1e6).toFixed(1)}/${(p.totalBytes / 1e6).toFixed(1)} Mo${p.error ? ' — ' + p.error : ''}`);
      }
    },
    emitReceiverStatus: () => undefined
  });
  console.log('pairs découverts :', JSON.stringify(await lan.discoverPeers()));
  const t0 = Date.now();
  try {
    const result = await lan.sendGames({ host, port: Number(port), code, gameIds: ids }, async id => path.join(dest, id));
    console.log('résultat :', JSON.stringify(result), `en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    console.log('ERREUR :', e.message);
  }
  app.quit();
});
