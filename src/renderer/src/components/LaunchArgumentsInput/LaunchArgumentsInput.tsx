import { useEffect, useState } from 'react';
import { t } from '../../lib/i18n.js';

// Même limite que main (src/main/launch-args.ts) : au-delà, aucun argument n'est passé.
const MAX_LENGTH = 1024;

export interface LaunchArgumentsInputProps {
  value: string;
  onSave: (value: string) => void;
}

/**
 * Arguments passés à l'exécutable au lancement (`-dx11`...). Enregistrés en
 * quittant le champ ou avec Entrée ; Échap annule la saisie.
 */
export default function LaunchArgumentsInput({ value, onSave }: LaunchArgumentsInputProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.replace(/[\r\n]+/g, ' ').trim();
    if (next !== value) onSave(next);
    else setDraft(value);
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(value);
        }
      }}
      placeholder={t('Aucun (ex. -dx11)')}
      aria-label={t('Arguments de lancement')}
      maxLength={MAX_LENGTH}
      autoComplete="off"
      spellCheck={false}
      className="input w-full font-mono text-[13px]"
    />
  );
}
