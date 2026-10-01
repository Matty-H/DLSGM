import { run7z, type SevenZipRequest } from './archive-7z';

/**
 * Processus utilitaire (Electron `utilityProcess`) qui extrait une archive
 * avec 7-Zip/WASM (archive-7z.ts). Séparé du processus principal :
 * `callMain` est synchrone et bloquerait toute l'application pendant
 * l'extraction de plusieurs Go.
 *
 * Message reçu : `{ archive, destination, password? }` (chemins absolus).
 * Réponse : `{ code, errors }` (code 7-Zip : 0 = OK, 1 = avertissement, 2+ = erreur).
 */
process.parentPort.once('message', async ({ data }: { data: SevenZipRequest }) => {
  process.parentPort.postMessage(await run7z(data));
});
