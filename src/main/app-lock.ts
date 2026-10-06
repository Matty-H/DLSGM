import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Verrouillage au démarrage : DLSGM demande un code PIN ou un mot de passe
 * avant d'ouvrir quoi que ce soit (main.ts : écran `#lock`, avant que les
 * stores n'ouvrent leurs fichiers). Un second mot de passe facultatif, le
 * « leurre », ouvre à la place un profil séparé (`DECOY_PROFILE_DIR`) : ses
 * propres réglages, cache et bibliothèque, comme une autre installation.
 *
 * C'est un écran de confidentialité, pas un chiffrement : les fichiers de
 * DLSGM (et les jeux) restent lisibles sur le disque par qui y a accès.
 *
 * La configuration vit dans `app-lock.json` du **vrai** dossier de données,
 * hors des stores (lue avant leur ouverture) ; seuls des hachages scrypt
 * salés y sont écrits, jamais les codes.
 */

export type LockKind = 'pin' | 'password';

export interface SecretHash {
  salt: string;
  hash: string;
}

export interface LockConfig {
  kind: LockKind;
  secret: SecretHash;
  /** Mot de passe leurre : ouvre le profil leurre. */
  decoy?: SecretHash;
  /** Langue de l'écran de verrouillage (copie du réglage, les stores n'étant pas encore ouverts). */
  uiLanguage?: string;
  /** Thème du profil leurre à sa création, pour qu'il ressemble au vrai. */
  theme?: string;
}

export const LOCK_FILE = 'app-lock.json';
/** Profil leurre, sous le vrai dossier de données. */
export const DECOY_PROFILE_DIR = 'alt-profile';

export const PIN_PATTERN = /^\d{4,12}$/;
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 128;

// scrypt ≈ 0,1 s par vérification : ralentit un essai en masse sur le fichier.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 32;

/** Raison du refus d'un code (clé de traduction côté appelant), ou null s'il est valable. */
export function secretProblem(kind: LockKind, value: unknown): 'pin' | 'password' | null {
  if (typeof value !== 'string') return kind;
  if (kind === 'pin') return PIN_PATTERN.test(value) ? null : 'pin';
  return value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX && !/[\r\n]/.test(value) ? null : 'password';
}

function derive(value: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(value.normalize('NFC'), salt, KEY_LENGTH, SCRYPT, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashSecret(value: string): Promise<SecretHash> {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('base64'), hash: (await derive(value, salt)).toString('base64') };
}

export async function matchesSecret(value: string, stored: SecretHash): Promise<boolean> {
  const expected = Buffer.from(stored.hash, 'base64');
  const actual = await derive(value, Buffer.from(stored.salt, 'base64'));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/**
 * Profil ouvert par ce code : le vrai, le leurre, ou aucun. Les deux
 * hachages sont toujours calculés, pour que la durée ne trahisse pas
 * l'existence d'un leurre.
 */
export async function unlockTarget(config: LockConfig, value: unknown): Promise<'real' | 'decoy' | null> {
  if (typeof value !== 'string' || value.length === 0 || value.length > PASSWORD_MAX) return null;
  const [real, decoy] = await Promise.all([
    matchesSecret(value, config.secret),
    config.decoy ? matchesSecret(value, config.decoy) : matchesSecret(value, config.secret).then(() => false)
  ]);
  if (real) return 'real';
  return decoy ? 'decoy' : null;
}

function isSecretHash(value: unknown): value is SecretHash {
  const v = value as SecretHash | null;
  return !!v && typeof v.salt === 'string' && typeof v.hash === 'string' && v.salt.length > 0 && v.hash.length > 0;
}

/** Configuration valide, ou null (pas de verrouillage). */
export function parseLockConfig(raw: unknown): LockConfig | null {
  const v = raw as Partial<LockConfig> | null;
  if (!v || (v.kind !== 'pin' && v.kind !== 'password') || !isSecretHash(v.secret)) return null;
  return {
    kind: v.kind,
    secret: { salt: v.secret.salt, hash: v.secret.hash },
    ...(isSecretHash(v.decoy) ? { decoy: { salt: v.decoy.salt, hash: v.decoy.hash } } : {}),
    ...(typeof v.uiLanguage === 'string' ? { uiLanguage: v.uiLanguage } : {}),
    ...(typeof v.theme === 'string' ? { theme: v.theme } : {})
  };
}

/**
 * Lit `app-lock.json`. Absent = pas de verrouillage. Illisible : signalé et
 * traité comme absent — un fichier abîmé ne doit pas fermer l'accès à
 * l'app pour toujours (et qui peut l'abîmer peut déjà lire les données).
 */
export function readLockConfig(dir: string, log: (message: string) => void = console.warn): LockConfig | null {
  const file = path.join(dir, LOCK_FILE);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const config = parseLockConfig(JSON.parse(text));
    if (!config) log(`${LOCK_FILE} invalide : verrouillage ignoré.`);
    return config;
  } catch (error) {
    log(`${LOCK_FILE} illisible : verrouillage ignoré (${(error as Error).message}).`);
    return null;
  }
}

/** Écrit (`.tmp` puis renommage) ou supprime (`null`) la configuration. */
export function writeLockConfig(dir: string, config: LockConfig | null): void {
  const file = path.join(dir, LOCK_FILE);
  if (!config) {
    fs.rmSync(file, { force: true });
    return;
  }
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Essais ratés : libres jusqu'à `FREE_ATTEMPTS`, puis une attente qui
 * double à chaque échec (1 s, 2 s, 4 s… jusqu'à une minute). Compté en
 * mémoire : un redémarrage remet le compteur à zéro, mais coûte plus cher
 * qu'une attente.
 */
export class UnlockThrottle {
  static readonly FREE_ATTEMPTS = 5;
  static readonly MAX_DELAY_MS = 60_000;
  private failures = 0;
  private nextAttemptAt = 0;

  /** Attente restante avant le prochain essai (ms, 0 = tout de suite). */
  remaining(now = Date.now()): number {
    return Math.max(0, this.nextAttemptAt - now);
  }

  fail(now = Date.now()): void {
    this.failures += 1;
    const over = this.failures - UnlockThrottle.FREE_ATTEMPTS;
    if (over >= 0) this.nextAttemptAt = now + Math.min(1000 * 2 ** over, UnlockThrottle.MAX_DELAY_MS);
  }

  succeed(): void {
    this.failures = 0;
    this.nextAttemptAt = 0;
  }
}
