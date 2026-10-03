import { useEffect, useState } from 'react';
import type { UpdateDownloadProgress } from '../../../shared/ipc-types';

/** Téléchargement d'une mise à jour en cours (poussé par main, voir src/main/updater.ts), null sinon. */
export function useUpdateDownloadProgress(): UpdateDownloadProgress | null {
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  useEffect(() => window.electronAPI.onUpdateDownloadProgress(setProgress), []);
  return progress;
}
