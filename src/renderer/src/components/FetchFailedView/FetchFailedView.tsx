import { useState } from 'react';
import { FolderOpen, Globe, Pencil, RotateCcw, TriangleAlert } from 'lucide-react';

export interface FetchFailedViewProps {
  gameId: string;
  error?: string;
  onRetry: () => void;
  onManualEdit: () => void;
  onOpenFolder: () => void;
  /** Nouvelle tentative à travers le VPN japonais (PIA) ; absent si PIA n'est pas installé. */
  onRetryVpn?: () => Promise<void>;
}

export default function FetchFailedView({ gameId, error, onRetry, onManualEdit, onOpenFolder, onRetryVpn }: FetchFailedViewProps) {
  const [vpnBusy, setVpnBusy] = useState(false);
  const [vpnError, setVpnError] = useState<string | null>(null);
  // DLsite répond vide (et non 404) pour une œuvre restreinte hors du Japon.
  const looksRegionLocked = /product-info/i.test(error ?? '');

  const retryVpn = async () => {
    if (!onRetryVpn) return;
    setVpnBusy(true);
    setVpnError(null);
    try {
      await onRetryVpn();
    } catch (err) {
      setVpnError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setVpnBusy(false);
    }
  };

  return (
    <div className="panel p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
          <TriangleAlert size={20} strokeWidth={2.25} />
        </span>
        <div>
          <h3 className="mb-0.5">{gameId}</h3>
          <p className="m-0 text-text-secondary">Échec de la récupération des données.</p>
        </div>
      </div>
      <p className="mb-5 rounded-sm bg-bg-deep px-3 py-2 font-mono text-[13px] text-text-secondary">{error || 'Erreur inconnue'}</p>
      {looksRegionLocked && (
        <p className="mb-4 mt-0 text-[13px] text-text-secondary">
          DLsite n'a renvoyé aucune donnée : souvent une œuvre à restriction régionale, visible seulement depuis le Japon.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="btn btn-primary">
          <RotateCcw size={15} strokeWidth={2.25} />
          Réessayer
        </button>
        {onRetryVpn && (
          <button type="button" onClick={retryVpn} disabled={vpnBusy} className={`btn ${looksRegionLocked ? 'btn-primary' : ''}`}>
            <Globe size={15} strokeWidth={2.25} />
            {vpnBusy ? 'Connexion au VPN…' : 'Réessayer via le VPN (Japon)'}
          </button>
        )}
        <button type="button" onClick={onManualEdit} className="btn">
          <Pencil size={15} strokeWidth={2.25} />
          Modifier manuellement
        </button>
        <button type="button" onClick={onOpenFolder} className="btn btn-ghost">
          <FolderOpen size={15} strokeWidth={2.25} />
          Ouvrir le dossier
        </button>
      </div>
      {vpnError && <p className="mb-0 mt-3 text-[13px] text-danger">{vpnError}</p>}
    </div>
  );
}
