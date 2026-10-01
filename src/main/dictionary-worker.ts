import fs from 'fs';
import yauzl from 'yauzl';
import { buildIndex, lookupText, type DictIndex } from './dictionary';

/**
 * Processus utilitaire du dictionnaire hors ligne : construit l'index depuis
 * les archives téléchargées (JMdict anglais ~120 Mo de JSON une fois
 * décompressé) puis répond aux recherches. Séparé du processus principal :
 * l'index chargé pèse ~200 Mo et son analyse bloquerait l'application.
 *
 * Messages : `{ type: 'build', id, eng, fre, kanji, version, out }` (chemins
 * des .zip, index écrit dans `out`) ; `{ type: 'lookup', id, index, texts,
 * lang }` (charge `index` à la première recherche). Réponse `{ id, result }`
 * ou `{ id, error }`.
 */

/** Contenu du seul fichier .json d'une archive zip. */
function readJsonFromZip(file: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error('Archive illisible.'));
      zip.on('error', reject);
      zip.on('entry', (entry: yauzl.Entry) => {
        if (!entry.fileName.endsWith('.json')) return zip.readEntry();
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) return reject(err ?? new Error('Entrée illisible.'));
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('error', reject);
          stream.on('end', () => {
            // Archive refermée tout de suite : sinon Windows refuse ensuite de la supprimer.
            zip.close();
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (e) {
              reject(e);
            }
          });
        });
      });
      zip.on('end', () => reject(new Error(`Aucun JSON dans ${file}`)));
      zip.readEntry();
    });
  });
}

let loaded: { path: string; index: DictIndex } | null = null;

function indexAt(file: string): DictIndex {
  if (!loaded || loaded.path !== file) loaded = { path: file, index: JSON.parse(fs.readFileSync(file, 'utf8')) as DictIndex };
  return loaded.index;
}

type Request =
  | { type: 'build'; id: number; eng: string; fre: string; kanji: string; version: string; out: string }
  | { type: 'lookup'; id: number; index: string; texts: string[]; lang: 'fr' | 'en' };

process.parentPort.on('message', async ({ data }: { data: Request }) => {
  try {
    if (data.type === 'build') {
      const [eng, fre, kanji] = [await readJsonFromZip(data.eng), await readJsonFromZip(data.fre), await readJsonFromZip(data.kanji)];
      const index = buildIndex(eng as never, fre as never, kanji as never, data.version);
      fs.writeFileSync(`${data.out}.tmp`, JSON.stringify(index));
      fs.renameSync(`${data.out}.tmp`, data.out);
      loaded = { path: data.out, index };
      process.parentPort.postMessage({ id: data.id, result: { words: index.entries.length, kanji: Object.keys(index.kanji).length } });
    } else {
      const index = indexAt(data.index);
      process.parentPort.postMessage({ id: data.id, result: data.texts.map(text => lookupText(index, text, data.lang)) });
    }
  } catch (error) {
    process.parentPort.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
  }
});
