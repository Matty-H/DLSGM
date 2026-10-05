import { useState } from 'react';
import { FolderOpen, Siren } from 'lucide-react';
import type { SuperPanicSettings as Settings } from '../../../../shared/ipc-types';
import { SUPER_PANIC_HOTKEYS, superPanicTargetIsUrl, superPanicTargetValid } from '../../lib/superPanic.js';
import { t, tr } from '../../lib/i18n.js';
import Select from '../Select/Select';

export interface SuperPanicSettingsProps {
  value: Settings;
  onChange: (value: Settings) => void;
  /** Raccourcis des outils en jeu, exclus de la liste. */
  takenHotkeys: string[];
}

/**
 * Super bouton panique (Paramètres › Affichage) : réduit toutes les fenêtres,
 * coupe le son et ouvre une fenêtre de travail ; un second appui restaure.
 */
export default function SuperPanicSettings({ value, onChange, takenHotkeys }: SuperPanicSettingsProps) {
  const set = (patch: Partial<Settings>) => onChange({ ...value, ...patch });
  const taken = takenHotkeys.map(k => k.toLowerCase());
  const options = SUPER_PANIC_HOTKEYS.filter(o => o.value === value.hotkey || !taken.includes(o.value.toLowerCase())).map(o => ({ value: o.value, label: tr(o.label) }));
  const targetInvalid = value.target.trim() !== '' && !superPanicTargetValid(value.target);
  // Un chemin n'est enregistré par main que choisi avec « Parcourir » (ou déjà enregistré) : jamais tapé.
  const [pickedPath, setPickedPath] = useState(value.target);
  const typedPath = !targetInvalid && value.target.trim() !== '' && !superPanicTargetIsUrl(value.target) && value.target !== pickedPath;

  return (
    <section className="my-4 rounded-md border border-divider px-4 pb-1 pt-3">
      <div className="flex items-center justify-between gap-6 border-b border-divider pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <Siren size={17} strokeWidth={2.25} className="text-accent" />
            {t('Super bouton panique')}
          </div>
          <div className="mt-1 text-[13px] leading-relaxed text-text-muted">
            {t("Un raccourci, valable partout : réduit toutes les fenêtres (jeu compris), coupe le son et ouvre ta fenêtre de travail. Un second appui remet les fenêtres comme elles étaient. Alt+Espace reste la panique simple (DLSGM seul).")}
          </div>
        </div>
        <input type="checkbox" className="toggle" aria-label={t('Super bouton panique')} checked={value.enabled} onChange={e => set({ enabled: e.target.checked })} />
      </div>
      {value.enabled && (
        <>
          <div className="flex items-center justify-between gap-6 border-b border-divider py-3">
            <div className="text-[14px] font-semibold">{t('Raccourci')}</div>
            <Select value={value.hotkey} options={options} onChange={hotkey => set({ hotkey })} aria-label={t('Raccourci du super bouton panique')} className="w-[200px]" />
          </div>
          <div className="border-b border-divider py-3">
            <div className="text-[14px] font-semibold">{t('Fenêtre de travail')}</div>
            <div className="mb-2 mt-1 text-[13px] text-text-muted">{t('Une adresse web (https://…), ou une application ou un document à ouvrir. Vide : rien ne s’ouvre, le bureau reste vide.')}</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={value.target}
                onChange={e => set({ target: e.target.value })}
                placeholder="https://… / C:\…\Rapport.docx"
                aria-label={t('Fenêtre de travail')}
                spellCheck={false}
                className="input min-w-0 flex-1"
              />
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const file = await window.electronAPI.chooseSuperPanicTarget();
                  if (file) {
                    setPickedPath(file);
                    set({ target: file });
                  }
                }}
              >
                <FolderOpen size={16} strokeWidth={2.25} />
                {t('Parcourir')}
              </button>
            </div>
            {targetInvalid && <div className="mt-1 text-[12px] text-danger">{t('Ni une adresse web, ni un chemin complet : rien ne sera ouvert.')}</div>}
            {typedPath && <div className="mt-1 text-[12px] text-danger">{t('Choisis le fichier ou l’application avec « Parcourir » : par sécurité, un chemin tapé au clavier n’est pas enregistré.')}</div>}
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-6 py-3">
            <span className="text-[14px] font-semibold">{t('Couper le son')}</span>
            <input type="checkbox" className="toggle" checked={value.mute} onChange={e => set({ mute: e.target.checked })} />
          </label>
        </>
      )}
    </section>
  );
}
