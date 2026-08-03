import { useEffect, useRef, useState } from 'react';
import { resetAndRedownloadImages } from '../../lib/dataFetcher.js';
import type { AppSettings } from '../../hooks/useSettings';

export interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

export default function SettingsPanel({ isOpen, onClose, settings, onSave }: SettingsPanelProps) {
  const [destinationFolder, setDestinationFolder] = useState(settings.destinationFolder);
  const [refreshRate, setRefreshRate] = useState(settings.refreshRate);
  const [language, setLanguage] = useState(settings.language);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDestinationFolder(settings.destinationFolder);
    setRefreshRate(settings.refreshRate);
    setLanguage(settings.language);
  }, [settings]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (rootRef.current && !rootRef.current.contains(target) && !target.closest('[data-settings-toggle]')) {
        onClose();
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    const folderPath = await window.electronAPI.openFolderDialog();
    if (folderPath) setDestinationFolder(folderPath);
  };

  const handleSave = () => {
    onSave({ ...settings, destinationFolder, refreshRate, language });
    onClose();
  };

  return (
    <div
      ref={rootRef}
      className="fixed right-6 top-20 z-[200] w-[350px] animate-slide-in rounded-app border border-border bg-[#121216] p-5 shadow-2xl"
    >
      <div className="mb-4">
        <label className="mb-2 block text-sm text-text-secondary">Dossier des jeux :</label>
        <input
          readOnly
          value={destinationFolder}
          className="w-full rounded border border-border bg-bg p-2 text-white"
        />
        <button onClick={handleBrowse} className="mt-2 w-full rounded bg-primary px-4 py-2 text-white">
          Parcourir
        </button>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-sm text-text-secondary">Rafraîchissement (min) :</label>
        <input
          type="number"
          min={0}
          max={120}
          step={1}
          value={refreshRate}
          onChange={e => setRefreshRate(Number(e.target.value))}
          className="w-16 rounded border border-border bg-bg p-1.5 text-white"
        />
      </div>

      <div className="mb-4">
        <button onClick={() => resetAndRedownloadImages()} className="w-full rounded bg-primary px-4 py-2 text-white">
          Réinitialiser le cache images
        </button>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-sm text-text-secondary">Langue :</label>
        <button
          onClick={() => setLanguage(prev => (prev === 'en_US' ? 'ja_JP' : 'en_US'))}
          className="w-full rounded border border-border bg-surface-hover px-2 py-2 text-white"
        >
          {language === 'en_US' ? '🇬🇧 English' : '🇯🇵 日本語'}
        </button>
      </div>

      <div>
        <button onClick={handleSave} className="w-full rounded bg-primary px-4 py-2 text-white">
          Enregistrer
        </button>
      </div>
    </div>
  );
}
