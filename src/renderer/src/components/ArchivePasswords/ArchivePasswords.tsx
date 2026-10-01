import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ipcErrorMessage } from '../../lib/gameTools.js';

/**
 * Mots de passe d'archives mémorisés (ajoutés depuis le bilan d'un import),
 * essayés d'office à chaque import. La suppression est immédiate.
 */
export default function ArchivePasswords() {
  const [passwords, setPasswords] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <span className="text-danger">{error}</span>;
  if (!passwords) return null;
  if (passwords.length === 0) return <span className="text-text-secondary">Aucun</span>;
  return (
    <ul className="m-0 flex max-w-[360px] list-none flex-wrap justify-end gap-1.5 p-0">
      {passwords.map(password => (
        <li key={password} className="flex items-center gap-1 rounded bg-white/10 py-0.5 pl-2 pr-0.5 font-mono text-[12px]">
          {password}
          <button type="button" onClick={() => remove(password)} aria-label={`Oublier ${password}`} title="Oublier" className="btn btn-ghost btn-icon h-5 w-5 p-0">
            <X size={12} strokeWidth={2.25} />
          </button>
        </li>
      ))}
    </ul>
  );
}
