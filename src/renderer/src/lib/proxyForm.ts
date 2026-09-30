/**
 * Formulaire du proxy DLsite (type, hôte, port, identifiant, mot de passe)
 * ⇄ adresse enregistrée dans `dlsiteProxy`
 * (`schéma://[identifiant[:mot de passe]@]hôte:port`, voir
 * src/main/proxy-config.ts). Le mot de passe enregistré n'est jamais rendu
 * au renderer : main le remplace par PASSWORD_MASK, qui veut dire
 * « inchangé ». Pur, sans DOM.
 */

export const PASSWORD_MASK = '********';

/** '' = pas de proxy (proxy système). https / socks4 : seulement pour garder une adresse déjà saisie. */
export type ProxyType = '' | 'http' | 'socks5' | 'https' | 'socks4';

export interface ProxyForm {
  type: ProxyType;
  host: string;
  port: string;
  username: string;
  /** Vide avec `hasStoredPassword` : on garde le mot de passe enregistré. */
  password: string;
  /** Un mot de passe est enregistré (chiffré côté main). */
  hasStoredPassword: boolean;
}

export const EMPTY_PROXY_FORM: ProxyForm = { type: '', host: '', port: '', username: '', password: '', hasStoredPassword: false };

const URL_REGEX = /^(https?|socks[45]?):\/\/(?:([^:@/\s]+)(?::([^@/\s]*))?@)?([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\]):(\d{1,5})$/;

const decode = (text: string | undefined) => {
  if (text === undefined) return '';
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** Champs du formulaire pour une adresse enregistrée ; null si elle n'est pas lisible. */
export function parseProxyForm(value: string): ProxyForm | null {
  const trimmed = value.trim();
  if (!trimmed) return { ...EMPTY_PROXY_FORM };
  const match = URL_REGEX.exec(trimmed);
  if (!match) return null;
  const [, scheme, user, pass, host, port] = match;
  const password = decode(pass);
  return {
    type: (scheme === 'socks' ? 'socks4' : scheme) as ProxyType,
    host: host.replace(/^\[|\]$/g, ''),
    port,
    username: decode(user),
    password: password === PASSWORD_MASK ? '' : password,
    hasStoredPassword: password === PASSWORD_MASK
  };
}

/** Erreur à afficher, ou null si le formulaire est valide. */
export function proxyFormError(form: ProxyForm): string | null {
  if (form.type === '') return null;
  const host = form.host.trim();
  if (!host) return "Indique l'hôte du proxy.";
  if (!/^[A-Za-z0-9.-]+$/.test(host) && !/^[0-9A-Fa-f:.]+$/.test(host)) return 'Hôte invalide (nom, IPv4 ou IPv6).';
  const port = Number(form.port);
  if (!/^\d{1,5}$/.test(form.port.trim()) || port < 1 || port > 65535) return 'Port invalide (1 à 65535).';
  const hasCredentials = form.username !== '' || form.password !== '';
  if (hasCredentials && form.type === 'socks4') return "SOCKS4 n'accepte pas d'identifiants : choisis SOCKS5.";
  if (form.password !== '' && form.username === '') return 'Un mot de passe demande un identifiant.';
  return null;
}

/**
 * Adresse à enregistrer. Identifiants encodés en %XX ; mot de passe laissé
 * vide alors qu'un mot de passe est enregistré (même identifiant) : masque,
 * que main remplace par le mot de passe chiffré.
 */
export function buildProxyUrl(form: ProxyForm, storedUsername?: string): string {
  if (form.type === '' || proxyFormError(form)) return '';
  const host = form.host.trim();
  const hostPart = host.includes(':') ? `[${host}]` : host;
  let credentials = '';
  if (form.username !== '') {
    const keepStored = form.password === '' && form.hasStoredPassword && form.username === storedUsername;
    const password = keepStored ? PASSWORD_MASK : form.password;
    credentials = `${encodeURIComponent(form.username)}${password !== '' ? `:${encodeURIComponent(password)}` : ''}@`;
  }
  return `${form.type}://${credentials}${hostPart}:${Number(form.port)}`;
}
