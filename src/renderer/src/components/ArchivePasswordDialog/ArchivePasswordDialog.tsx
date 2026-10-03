import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, X } from 'lucide-react';
import { t } from '../../lib/i18n.js';

export interface ArchivePasswordDialogProps {
  /** Nom de l'archive à ouvrir. */
  file: string;
  /** Le mot de passe saisi au dernier essai n'ouvrait pas l'archive. */
  wrongPassword: boolean;
  /** Extraction en cours. */
  busy: boolean;
  onSubmit: (password: string, remember: boolean) => void;
  /** Laisse cette archive de côté (le bilan garde un bouton pour revenir ici). */
  onSkip: () => void;
}

/**
 * Mot de passe d'une archive que ni les mots de passe devinés (nom de
 * l'archive, fichiers texte) ni ceux du gestionnaire n'ont ouverte : saisie,
 * ou choix d'un mot de passe du gestionnaire, et case pour l'y ajouter.
 * Fenêtre `data-nav-scope`/`data-nav-popup` : la manette y reste et B la ferme.
 */
export default function ArchivePasswordDialog({ file, wrongPassword, busy, onSubmit, onSkip }: ArchivePasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.electronAPI.listArchivePasswords().then(setSaved).catch(() => setSaved([]));
  }, []);

  useEffect(() => {
    setPassword('');
    inputRef.current?.focus();
  }, [file, wrongPassword]);

  const alreadySaved = saved.includes(password);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onSkip();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onSkip}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t('Mot de passe requis')}
        data-nav-scope
        data-nav-popup
        onKeyDown={onKeyDown}
        onClick={e => e.stopPropagation()}
        onSubmit={e => {
          e.preventDefault();
          if (password && !busy) onSubmit(password, remember && !alreadySaved);
        }}
        className="panel flex max-h-full w-[520px] max-w-full flex-col gap-3 p-5"
      >
        <div className="flex items-center gap-3">
          <KeyRound size={18} strokeWidth={2.25} className="flex-shrink-0 text-accent" />
          <h2 className="m-0 flex-1 text-[18px] font-bold">{t('Mot de passe requis')}</h2>
          <button type="button" onClick={onSkip} aria-label={t('Fermer')} className="btn btn-ghost btn-icon">
            <X size={17} strokeWidth={2.5} />
          </button>
        </div>

        <p className="m-0 break-all text-[14px] font-semibold">{file}</p>
        <p className="m-0 text-[13px] text-text-secondary">
          {t("Aucun mot de passe deviné d'après le nom de l'archive ou ses fichiers texte, ni aucun mot de passe du gestionnaire ne l'ouvre.")}
        </p>
        {wrongPassword && <p className="m-0 text-[13px] text-danger">{t("Ce mot de passe n'ouvre pas l'archive.")}</p>}

        <input
          ref={inputRef}
          type="text"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={t("Mot de passe de l'archive")}
          aria-label={t("Mot de passe de l'archive")}
          autoComplete="off"
          spellCheck={false}
          className="input w-full"
        />

        {saved.length > 0 && (
          <div>
            <div className="section-title mb-1.5">{t('Mots de passe enregistrés')}</div>
            <ul className="m-0 flex max-h-[140px] list-none flex-wrap gap-1.5 overflow-y-auto p-0">
              {saved.map(p => (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => setPassword(p)}
                    aria-pressed={password === p}
                    className={`tag font-mono ${password === p ? 'tag-accent' : ''}`}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className={`flex items-center gap-2 text-[13px] ${alreadySaved ? 'text-text-muted' : 'cursor-pointer text-text-secondary'}`}>
          <input type="checkbox" checked={remember && !alreadySaved} disabled={alreadySaved} onChange={e => setRemember(e.target.checked)} />
          {alreadySaved ? t('Déjà dans le gestionnaire de mots de passe') : t('Ajouter au gestionnaire de mots de passe')}
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onSkip} className="btn btn-ghost">
            {t('Ignorer cette archive')}
          </button>
          <button type="submit" disabled={busy || !password} className="btn btn-primary">
            {busy ? t('Extraction…') : t('Extraire')}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
