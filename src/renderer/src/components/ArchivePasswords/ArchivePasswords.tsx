import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { t } from '../../lib/i18n.js';

/**
 * Gestionnaire de mots de passe d'archives, essayés d'office à chaque import
 * (après ceux devinés d'après le nom de l'archive). Ajout ici ou depuis la
 * fenêtre de mot de passe d'un import ; ajout et suppression immédiats.
 */
export default function ArchivePasswords() {
  const [passwords, setPasswords] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    window.electronAPI.listArchivePasswords().then(setPasswords).catch(err => setError(ipcErrorMessage(err)));
  }, []);

  const remove = async (password: string) => {
    try {
      setPasswords(await window.electronAPI.removeArchivePassword(password));
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  const add = async () => {
    const password = draft.trim();
    if (!password) return;
    try {
      setPasswords(await window.electronAPI.addArchivePassword(password));
      setDraft('');
      setError(null);
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  if (!passwords) return error ? <span className="text-danger">{error}</span> : null;
  return (
    <div className="flex max-w-[360px] flex-col items-end gap-2">
      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={t('Nouveau mot de passe')}
          aria-label={t('Nouveau mot de passe')}
          autoComplete="off"
          spellCheck={false}
          maxLength={256}
          className="input w-[200px]"
        />
        <button type="submit" disabled={!draft.trim()} className="btn">
          <Plus size={16} strokeWidth={2.25} />
          {t('Ajouter')}
        </button>
      </form>
      {error && <span className="text-danger">{error}</span>}
      {passwords.length === 0 ? (
        <span className="text-text-secondary">{t('Aucun')}</span>
      ) : (
        <ul className="m-0 flex list-none flex-wrap justify-end gap-1.5 p-0">
          {passwords.map(password => (
            <li key={password} className="flex items-center gap-1 rounded bg-white/10 py-0.5 pl-2 pr-0.5 font-mono text-[12px]">
              {password}
              <button type="button" onClick={() => remove(password)} aria-label={t('Oublier {password}', { password })} title={t('Oublier')} className="btn btn-ghost btn-icon h-5 w-5 p-0">
                <X size={12} strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
