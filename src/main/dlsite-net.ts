import { net, safeStorage, session } from 'electron';
import { PASSWORD_MASK, maskProxyUrl, parseProxyUrl, resolveUpstream } from './proxy-config';
import { startProxyRelay, type ProxyRelay } from './proxy-relay';

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

/**
 * Proxy à utiliser, avec relais local si le proxy demande des identifiants
 * (Chromium ne sait pas s'authentifier en SOCKS5 — voir proxy-relay.ts).
 */
let relay: ProxyRelay | null = null;

/** Chiffre un mot de passe de proxy pour les paramètres (DPAPI sous Windows). */
export function encryptSecret(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Chiffrement indisponible sur ce système : impossible d'enregistrer le mot de passe du proxy.");
  }
  return safeStorage.encryptString(plain).toString('base64');
}

function decryptSecret(blob: string | undefined): string | null {
  if (!blob) return null;
  try {
    return safeStorage.decryptString(Buffer.from(blob, 'base64'));
  } catch (error) {
    console.error('Mot de passe du proxy illisible (chiffré sur un autre compte Windows ?) :', error);
    return null;
  }
}

/**
 * Valeurs à enregistrer pour le proxy : adresse avec mot de passe masqué, et
 * mot de passe chiffré — un masque inchangé garde le mot de passe précédent.
 */
export function protectProxySettings(value: string | undefined, previousSecret: string | undefined): { dlsiteProxy: string; dlsiteProxySecret: string } {
  const trimmed = (value ?? '').trim();
  const parsed = trimmed ? parseProxyUrl(trimmed) : null;
  if (!parsed?.username || parsed.password === undefined) return { dlsiteProxy: trimmed, dlsiteProxySecret: '' };
  const dlsiteProxySecret = parsed.password === PASSWORD_MASK ? previousSecret ?? '' : encryptSecret(parsed.password);
  return { dlsiteProxy: maskProxyUrl(trimmed), dlsiteProxySecret };
}

/**
 * Applique le proxy à la session par défaut (utilisée par `net.fetch`).
 * Adresse invalide : ignorée (proxy système) plutôt que de couper tout accès.
 */
export async function applyDlsiteProxy(proxy: string | undefined, secret?: string): Promise<void> {
  await relay?.close();
  relay = null;
  const value = (proxy ?? '').trim();
  const parsed = value ? parseProxyUrl(value) : null;
  if (parsed) {
    const upstream = resolveUpstream(parsed, decryptSecret(secret));
    if (upstream) relay = await startProxyRelay(upstream);
    // <local> : le serveur de dev Vite (localhost) ne passe jamais par le proxy.
    const proxyRules = relay ? relay.url : `${parsed.scheme}://${parsed.host}:${parsed.port}`;
    await session.defaultSession.setProxy({ proxyRules, proxyBypassRules: '<local>' });
  } else {
    if (value) console.warn('Proxy DLsite invalide, ignoré.');
    await session.defaultSession.setProxy({ mode: 'system' });
  }
  // Les connexions déjà ouvertes garderaient l'ancien chemin.
  await session.defaultSession.closeAllConnections();
}

/** Test de l'accès à DLsite avec le proxy enregistré (bouton des paramètres). */
export async function testDlsiteConnection(): Promise<{ status: number; ms: number }> {
  const started = Date.now();
  const response = await dlsiteFetch('https://www.dlsite.com/maniax/', { method: 'HEAD', signal: AbortSignal.timeout(15000) });
  return { status: response.status, ms: Date.now() - started };
}

/** `net.fetch` avec une erreur réseau lisible (cause Chromium + URL). */
export async function dlsiteFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await net.fetch(url, init);
  } catch (error) {
    const message = (error as Error).message || String(error);
    if ((error as Error).name === 'AbortError') throw error;
    if (message.includes('ERR_NETWORK_ACCESS_DENIED')) {
      throw new Error(
        `Accès réseau refusé à DLSGM par Windows (${message}) : pare-feu, ou split tunneling de PIA en mode « Only VPN » ` +
        'alors que le VPN est déconnecté — règle DLSGM sur « Use VPN » (Paramètres › Réseau & VPN).'
      );
    }
    if (/ERR_(SOCKS|PROXY|TUNNEL)/.test(message)) {
      throw new Error(`Le proxy DLsite refuse la connexion (${message}) : vérifie son adresse et ses identifiants dans Paramètres › Réseau & VPN.`);
    }
    throw new Error(`Connexion à DLsite impossible (${message}) — ${new URL(url).host}. Si DLsite n'est accessible que via un proxy, renseigne-le dans Paramètres › Réseau & VPN.`);
  }
}
