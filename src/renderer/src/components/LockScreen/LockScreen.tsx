import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Delete, Lock } from 'lucide-react';
import type { AppLockKind } from '../../../../shared/ipc-types';
import { useGamepadNavigation } from '../../hooks/useGamepadNavigation';
import { t } from '../../lib/i18n.js';
import Logo from '../Logo/Logo';

const PIN_MAX = 12;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Écran de verrouillage (route #lock, fenêtre ouverte par main avant tout le
 * reste — src/main/app-lock.ts). Main décide seul si le code ouvre le vrai
 * profil ou le leurre : rien ici ne distingue les deux, ni l'existence d'un
 * leurre. Code PIN : pavé numérique utilisable à la souris et à la manette
 * (B efface), en plus du clavier.
 */
export default function LockScreen() {
  const [kind, setKind] = useState<AppLockKind | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.electronAPI
      .getLockScreen()
      .then(info => setKind(info.kind))
      .catch(() => setKind('password'));
  }, []);

  const waiting = waitUntil > now;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [waiting]);

  useEffect(() => {
    if (kind && !busy) inputRef.current?.focus();
  }, [kind, busy]);

  const submit = async () => {
    if (busy || waiting || code.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.electronAPI.unlockApp(code);
      if (result.ok) return; // main cache cette fenêtre et ouvre l'application
      setCode('');
      setError(kind === 'pin' ? t('Code PIN incorrect.') : t('Mot de passe incorrect.'));
      if (result.retryInMs) {
        setWaitUntil(Date.now() + result.retryInMs);
        setNow(Date.now());
      }
    } catch {
      setError(t('Déverrouillage impossible.'));
    } finally {
      setBusy(false);
    }
  };

  const press = (digit: string) => setCode(current => (current.length < PIN_MAX ? current + digit : current));
  const erase = () => setCode(current => current.slice(0, -1));

  useGamepadNavigation({
    enabled: kind === 'pin',
    onBack: erase,
    onShoulder: () => undefined,
    onTrigger: () => undefined,
    onSearch: () => undefined,
    onToggleFullscreen: () => undefined
  });

  if (!kind) return <div className="h-screen bg-bg" />;

  const seconds = Math.ceil((waitUntil - now) / 1000);
  const disabled = busy || waiting;

  return (
    <div className="flex h-screen select-none flex-col items-center justify-center gap-6 bg-bg px-8 text-text">
      <Logo variant="horizontal" height={44} />
      <div className="flex items-center gap-2 text-[15px] text-text-secondary">
        <Lock size={16} strokeWidth={2.25} />
        {kind === 'pin' ? t('Entre ton code PIN') : t('Entre ton mot de passe')}
      </div>
      <form
        className="flex w-full max-w-[300px] gap-2"
        onSubmit={event => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          ref={inputRef}
          type="password"
          inputMode={kind === 'pin' ? 'numeric' : undefined}
          autoComplete="off"
          spellCheck={false}
          value={code}
          disabled={disabled}
          maxLength={kind === 'pin' ? PIN_MAX : 128}
          onChange={event => setCode(kind === 'pin' ? event.target.value.replace(/\D/g, '') : event.target.value)}
          aria-label={kind === 'pin' ? t('Code PIN') : t('Mot de passe')}
          className="input min-w-0 flex-1 text-center text-[18px] tracking-[0.3em]"
        />
        <button type="submit" className="btn btn-primary" disabled={disabled || code.length === 0} aria-label={t('Déverrouiller')}>
          <ArrowRight size={18} strokeWidth={2.5} />
        </button>
      </form>
      {kind === 'pin' && (
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map(digit => (
            <button key={digit} type="button" className="btn h-12 w-16 justify-center text-[18px]" disabled={disabled} onClick={() => press(digit)}>
              {digit}
            </button>
          ))}
          <button type="button" className="btn h-12 w-16 justify-center" disabled={disabled || code.length === 0} onClick={erase} aria-label={t('Effacer')}>
            <Delete size={18} strokeWidth={2.25} />
          </button>
          <button type="button" className="btn h-12 w-16 justify-center text-[18px]" disabled={disabled} onClick={() => press('0')}>
            0
          </button>
          <button type="button" className="btn btn-primary h-12 w-16 justify-center" disabled={disabled || code.length === 0} onClick={() => void submit()} aria-label={t('Déverrouiller')}>
            <ArrowRight size={18} strokeWidth={2.5} />
          </button>
        </div>
      )}
      <div className="min-h-[20px] text-center text-[13px] text-danger" role="alert">
        {waiting ? t('Trop d’essais : réessaie dans {seconds} s.', { seconds }) : error}
      </div>
    </div>
  );
}
