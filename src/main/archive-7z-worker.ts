import path from 'path';
import SevenZip from '7z-wasm';

/**
 * Processus utilitaire (Electron `utilityProcess`) qui extrait une archive
 * avec 7-Zip compilé en WASM : RAR (y compris multi-parties et
 * auto-extractible `.part1.exe`, le format des gros téléchargements DLsite),
 * 7z, etc. — sans binaire natif par plateforme. Séparé du processus
 * principal : `callMain` est synchrone et bloquerait toute l'application
 * pendant l'extraction de plusieurs Go.
 *
 * Message reçu : `{ archive, destination }` (chemins absolus). Réponse :
 * `{ code, errors }` (code 7-Zip : 0 = OK, 1 = avertissement, 2+ = erreur).
 */

interface ExtractRequest {
  archive: string;
  destination: string;
}

process.parentPort.once('message', async ({ data }: { data: ExtractRequest }) => {
  const errors: string[] = [];
  let code = 2;
  try {
    const sevenZip = await SevenZip({
      print: () => undefined,
      printErr: (line: string) => errors.push(line)
    });
    // L'archive et la destination sont montées depuis le vrai disque (NODEFS) :
    // rien n'est chargé en mémoire en entier.
    sevenZip.FS.mkdir('/in');
    sevenZip.FS.mount(sevenZip.NODEFS, { root: path.dirname(data.archive) }, '/in');
    sevenZip.FS.mkdir('/out');
    sevenZip.FS.mount(sevenZip.NODEFS, { root: data.destination }, '/out');
    // -p : un mot de passe factice plutôt qu'une invite qui attendrait
    // indéfiniment sur une entrée standard inexistante.
    code = (sevenZip.callMain(['x', `/in/${path.basename(data.archive)}`, '-o/out', '-y', '-pDLSGM', '-bb0']) as unknown as number) ?? 0;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  process.parentPort.postMessage({ code, errors: errors.filter(l => l.trim()).slice(-20) });
});
