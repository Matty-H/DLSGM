import { useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { formatBytes } from '../../lib/diskUsage.js';
import type { DictionaryStatus } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

/** Installation du dictionnaire hors ligne (≈14 Mo téléchargés une fois, préparés en un index local). */
export default function DictionaryInstall() {
  const [status, setStatus] = useState<DictionaryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.getDictionaryStatus().then(setStatus).catch(() => undefined);
    return window.electronAPI.onDictionaryStatus(setStatus);
  }, []);

  if (!status) return null;
  const progress = status.progress;

  const install = async () => {
    setError(null);
    try {
      setStatus(await window.electronAPI.installDictionary());
    } catch (err) {
      setError(ipcErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col items-end gap-1 text-[12px]">
      {progress ? (
        <span className="text-text-secondary">
          {progress.step === 'download'
            ? t('Téléchargement… {received} / {total}', { received: formatBytes(progress.received), total: formatBytes(progress.total) })
            : t('Préparation de l’index…')}
        </span>
      ) : status.installed ? (
        <div className="flex items-center gap-2">
          <span className="text-play">{t('Installé ({version})', { version: status.version?.split('+')[0] ?? '' })}</span>
          <button type="button" className="btn btn-ghost py-1 text-[12px]" onClick={() => window.electronAPI.removeDictionary().then(setStatus)}>
            <Trash2 size={13} strokeWidth={2.25} />
            {t('Supprimer')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn" onClick={install}>
          <Download size={14} strokeWidth={2.25} />
          {t('Télécharger (≈14 Mo)')}
        </button>
      )}
      {(error || status.error) && <span className="text-danger">{error ?? status.error}</span>}
    </div>
  );
}
