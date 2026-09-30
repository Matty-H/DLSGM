import type { UpstreamProxy } from './proxy-relay';

/**
 * Adresse du proxy DLsite (paramètre `dlsiteProxy`) :
 * `schéma://[identifiant[:mot de passe]@]hôte:port`, schémas http, https,
 * socks4, socks5. Le mot de passe n'est jamais gardé en clair dans les
 * paramètres : il y est remplacé par PASSWORD_MASK, et sa version chiffrée
 * (DPAPI sous Windows, via safeStorage) est dans `dlsiteProxySecret`.
 */

export const PASSWORD_MASK = '********';

// Hôte : nom ou IPv4, ou IPv6 entre crochets. Identifiants : caractères
// spéciaux (@, /, :) encodés en %XX dans l'identifiant.
export const PROXY_URL_REGEX =
  /^(https?|socks[45]?):\/\/(?:([^:@/\s]+)(?::([^@/\s]*))?@)?([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\]):(\d{1,5})$/;

export interface ParsedProxy {
  scheme: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  /** Tel que saisi : peut valoir PASSWORD_MASK (inchangé depuis le dernier enregistrement). */
  password?: string;
}

export function parseProxyUrl(value: string): ParsedProxy | null {
  const match = PROXY_URL_REGEX.exec(value.trim());
  if (!match) return null;
  const [, rawScheme, user, pass, host, portText] = match;
  const port = Number(portText);
  if (port < 1 || port > 65535) return null;
  // "socks" seul désigne SOCKS4 pour Chromium.
  const scheme = (rawScheme === 'socks' ? 'socks4' : rawScheme) as ParsedProxy['scheme'];
  try {
    const username = user !== undefined ? decodeURIComponent(user) : undefined;
    const password = pass !== undefined ? decodeURIComponent(pass) : undefined;
    // SOCKS4 n'a pas de mot de passe (seulement un identifiant) : non pris en charge.
    if (scheme === 'socks4' && username !== undefined) return null;
    return { scheme, host, port, ...(username !== undefined && { username }), ...(password !== undefined && { password }) };
  } catch {
    return null; // %XX invalide
  }
}

/** Adresse à enregistrer / afficher : mot de passe remplacé par le masque. */
export function maskProxyUrl(value: string): string {
  const parsed = parseProxyUrl(value);
  if (!parsed?.username || parsed.password === undefined) return value.trim();
  return `${parsed.scheme}://${encodeURIComponent(parsed.username)}:${PASSWORD_MASK}@${parsed.host}:${parsed.port}`;
}

/**
 * Proxy à utiliser, mot de passe réel compris (`storedPassword`, déchiffré
 * par l'appelant, quand l'adresse porte le masque).
 */
export function resolveUpstream(parsed: ParsedProxy, storedPassword: string | null): UpstreamProxy | null {
  if (parsed.scheme === 'socks4' || parsed.username === undefined) return null; // pas de relais nécessaire
  const password = parsed.password === PASSWORD_MASK ? storedPassword ?? '' : parsed.password ?? '';
  return { scheme: parsed.scheme, host: parsed.host.replace(/^\[|\]$/g, ''), port: parsed.port, username: parsed.username, password };
}
