import type { AppLockKind } from '../../../shared/ipc-types';
import { t } from './i18n.js';

/**
 * Mêmes règles que main (src/main/app-lock.ts, `secretProblem`), vérifiées
 * avant l'envoi pour un message immédiat ; main revérifie de toute façon.
 */
export const PIN_PATTERN = /^\d{4,12}$/;
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 128;

export function appLockSecretError(kind: AppLockKind, value: string): string | null {
  if (kind === 'pin') return PIN_PATTERN.test(value) ? null : t('Le code PIN doit faire de 4 à 12 chiffres.');
  return value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX && !/[\r\n]/.test(value)
    ? null
    : t('Le mot de passe doit faire de 4 à 128 caractères, sur une ligne.');
}
