import path from 'path';
import SevenZip from '7z-wasm';

/**
 * Extraction avec 7-Zip compilé en WASM : RAR (y compris multi-parties et
 * auto-extractible `.part1.exe`, le format des gros téléchargements DLsite),
 * 7z, zip chiffré, etc. — sans binaire natif par plateforme. Synchrone
 * (`callMain`) : en production, appelé depuis un processus utilitaire
 * (archive-7z-worker.ts) pour ne pas bloquer l'application ; directement
 * dans les tests.
 */

export interface SevenZipRequest {
  archive: string;
  destination: string;
  /** Mot de passe essayé ; absent = un mot de passe factice (jamais d'invite). */
  password?: string;
  /** Taille de l'archive (toutes ses parties) : sert à situer l'avancement. Absent = pas d'avancement. */
  totalBytes?: number;
}

/** Message d'avancement envoyé par le processus d'extraction avant son résultat. */
export interface SevenZipProgress {
  progress: number;
}

export interface SevenZipResult {
  /** Code 7-Zip : 0 = OK, 1 = avertissement, 2+ = erreur. */
  code: number;
  errors: string[];
  /**
   * 7-Zip/WASM a levé une exception brute au lieu de rendre un code : c'est
   * ce qu'il fait sur une archive à en-têtes chiffrés avec un mauvais mot de
   * passe (aucun message), mais aussi sur une archive endommagée.
   */
  crashed?: boolean;
}

/**
 * `onProgress` reçoit la part de l'archive déjà lue (0 à 1). 7-Zip n'annonce
 * rien d'exploitable ici (`callMain` est synchrone, sa sortie n'est rendue
 * qu'à la fin) : on compte les octets qu'il lit dans l'archive. Le cumul, et
 * non la position — un .7z lit d'abord son en-tête, à la fin du fichier.
 */
export async function run7z({ archive, destination, password, totalBytes }: SevenZipRequest, onProgress?: (fraction: number) => void): Promise<SevenZipResult> {
  const errors: string[] = [];
  let code = 2;
  let crashed = false;
  let sevenZip: Awaited<ReturnType<typeof SevenZip>> | null = null;
  try {
    sevenZip = await SevenZip({
      print: () => undefined,
      printErr: (line: string) => errors.push(line)
    });
    // L'archive et la destination sont montées depuis le vrai disque (NODEFS) :
    // rien n'est chargé en mémoire en entier.
    sevenZip.FS.mkdir('/in');
    sevenZip.FS.mount(sevenZip.NODEFS, { root: path.dirname(archive) }, '/in');
    sevenZip.FS.mkdir('/out');
    sevenZip.FS.mount(sevenZip.NODEFS, { root: destination }, '/out');
    if (onProgress && totalBytes && totalBytes > 0) {
      type Read = (stream: { path?: string }, buffer: unknown, offset: number, length: number, position: number) => number;
      const ops = (sevenZip.NODEFS as unknown as { stream_ops: { read: Read } }).stream_ops;
      const read = ops.read;
      let done = 0;
      let last = -1;
      ops.read = function (this: unknown, stream, buffer, offset, length, position) {
        const count = read.call(this, stream, buffer, offset, length, position);
        if (stream.path?.startsWith('/in/')) {
          done += count;
          // Au plus 200 messages par extraction.
          const step = Math.min(200, Math.floor((done / totalBytes) * 200));
          if (step !== last) {
            last = step;
            onProgress(step / 200);
          }
        }
        return count;
      };
    }
    // -p : toujours un mot de passe (factice par défaut) plutôt qu'une invite
    // qui attendrait indéfiniment sur une entrée standard inexistante.
    code = (sevenZip.callMain(['x', `/in/${path.basename(archive)}`, '-o/out', '-y', `-p${password || 'DLSGM'}`, '-bb0']) as unknown as number) ?? 0;
  } catch (error) {
    crashed = true;
    if (error instanceof Error) errors.push(error.message);
    // Après une exception, 7-Zip n'a pas refermé ses fichiers : sous Windows,
    // ils ne pourraient plus être supprimés tant que le processus vit.
    const streams = (sevenZip?.FS as unknown as { streams?: (Parameters<NonNullable<typeof sevenZip>['FS']['close']>[0] | null)[] } | undefined)?.streams ?? [];
    for (const stream of streams) {
      try {
        if (stream) sevenZip!.FS.close(stream);
      } catch {
        // déjà fermé
      }
    }
  }
  return { code, errors: errors.filter(l => l.trim()).slice(-20), ...(crashed ? { crashed } : {}) };
}

/** Échec peut-être dû au mot de passe (absent ou faux) : à réessayer avec un autre. */
export function isPasswordFailure({ code, errors, crashed }: SevenZipResult): boolean {
  return code >= 2 && (crashed === true || /wrong password|encrypted/i.test(errors.join(' ')));
}
