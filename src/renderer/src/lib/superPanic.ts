import type { SuperPanicSettings } from '../../../shared/ipc-types';
import { msg } from './i18n.js';

export const DEFAULT_SUPER_PANIC_SETTINGS: SuperPanicSettings = { enabled: false, hotkey: 'Ctrl+Shift+Space', target: '', mute: true };

/** Raccourcis proposés au super bouton panique (jamais Alt+Espace, la panique simple). */
export const SUPER_PANIC_HOTKEYS = [
  { value: 'Ctrl+Shift+Space', label: msg('Ctrl+Maj+Espace') },
  { value: 'Ctrl+Alt+Space', label: msg('Ctrl+Alt+Espace') },
  { value: 'Ctrl+Shift+Q', label: msg('Ctrl+Maj+Q') },
  { value: 'Pause', label: msg('Pause') },
  { value: 'ScrollLock', label: msg('Arrêt défil') }
];

/** Adresse web, seule forme de cible que main accepte saisie au clavier (src/main/trusted-paths.ts). */
export function superPanicTargetIsUrl(target: string): boolean {
  return /^https?:\/\/\S+$/i.test(target.trim());
}

/** Même règle que main (src/main/super-panic.ts) : adresse http(s) ou chemin absolu (Windows ou Unix). */
export function superPanicTargetValid(target: string): boolean {
  const value = target.trim();
  return /^https?:\/\/\S+$/i.test(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/');
}
