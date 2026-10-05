import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Page de DLSGM : le renderer buildé (`index.html`, toute route `#…`) ou,
 * en dev, le serveur Vite. Les canaux IPC donnent accès au disque et au
 * lancement de programmes : ils ne répondent qu'à ces pages, chargées dans
 * le cadre principal d'une fenêtre de DLSGM — jamais à un site externe ni à
 * un iframe, même si l'un d'eux finissait dans une fenêtre avec le preload.
 */
export function isAppUrl(url: string, appIndexFile: string, devServerUrl?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (devServerUrl) {
    try {
      if (parsed.origin === new URL(devServerUrl).origin) return true;
    } catch {
      // adresse de dev invalide : seul le build compte
    }
  }
  if (parsed.protocol !== 'file:') return false;
  parsed.hash = '';
  parsed.search = '';
  const file = path.resolve(fileURLToPath(parsed));
  const expected = path.resolve(appIndexFile);
  return process.platform === 'win32' ? file.toLowerCase() === expected.toLowerCase() : file === expected;
}

/** Cadre à l'origine d'un message IPC (sous-ensemble de WebFrameMain). */
export interface SenderFrame {
  url: string;
  parent: unknown;
}

/** Message IPC venu du cadre principal d'une page de DLSGM. */
export function isTrustedSender(frame: SenderFrame | null | undefined, isApp: (url: string) => boolean): boolean {
  return !!frame && frame.parent === null && isApp(frame.url);
}
