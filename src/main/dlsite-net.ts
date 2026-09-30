import { net, session } from 'electron';

/**
 * Accès réseau vers DLsite (fiches et images), par la pile réseau de
 * Chromium (`net.fetch`) plutôt que par le `fetch` de Node : Node ignore tout
 * proxy (même celui de Windows) et ses erreurs se résument à "fetch failed",
 * alors que Chromium suit le proxy de la session et nomme la cause
 * (net::ERR_CONNECTION_RESET, net::ERR_PROXY_CONNECTION_FAILED...).
 *
 * Proxy : celui du paramètre `dlsiteProxy` s'il est renseigné (ex: un proxy
 * japonais pour les œuvres restreintes par région), sinon celui du système.
 */

/** Formats acceptés : http://hôte:port, https://…, socks4://…, socks5://… */
export const PROXY_REGEX = /^(https?|socks[45]?):\/\/[A-Za-z0-9.\-[\]:]+:\d{1,5}$/;

/**
 * Applique le proxy à la session par défaut (utilisée par `net.fetch`).
 * Adresse invalide : ignorée (proxy système) plutôt que de couper tout accès.
 */
export async function applyDlsiteProxy(proxy: string | undefined): Promise<void> {
  const value = (proxy ?? '').trim();
  if (value && PROXY_REGEX.test(value)) {
    // <local> : le serveur de dev Vite (localhost) ne passe jamais par le proxy.
    await session.defaultSession.setProxy({ proxyRules: value, proxyBypassRules: '<local>' });
  } else {
    if (value) console.warn(`Proxy DLsite invalide, ignoré : ${value}`);
    await session.defaultSession.setProxy({ mode: 'system' });
  }
  // Les connexions déjà ouvertes garderaient l'ancien chemin.
  await session.defaultSession.closeAllConnections();
}

/** `net.fetch` avec une erreur réseau lisible (cause Chromium + URL). */
export async function dlsiteFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await net.fetch(url, init);
  } catch (error) {
    const message = (error as Error).message || String(error);
    if ((error as Error).name === 'AbortError') throw error;
    throw new Error(`Connexion à DLsite impossible (${message}) — ${new URL(url).host}. Si DLsite n'est accessible que via un proxy, renseigne-le dans Paramètres › Bibliothèque.`);
  }
}
