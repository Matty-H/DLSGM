import { useEffect, useState } from 'react';
import { Download, RotateCw } from 'lucide-react';
import Select from '../Select/Select';
import { retryAllFailuresThroughVpn } from '../../lib/dataFetcher.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { getPiaStatus, sortRegions, type PiaStatus } from '../../lib/vpn.js';

export interface PiaSettingsProps {
  enabled: boolean;
  region: string;
  onEnabledChange: (enabled: boolean) => void;
  onRegionChange: (region: string) => void;
  /** La région affichée n'est pas encore enregistrée : la session VPN utiliserait l'ancienne. */
  regionDirty: boolean;
  /** Après une nouvelle tentative : relire le cache. */
  onRetried: () => void;
}

/**
 * Private Internet Access : refaire les fetchs en échec à travers un
 * serveur japonais (œuvres à restriction régionale). PIA est piloté par
 * `piactl` le temps des fetchs, puis remis dans son état d'avant.
 */
export default function PiaSettings({ enabled, region, onEnabledChange, onRegionChange, regionDirty, onRetried }: PiaSettingsProps) {
  const [status, setStatus] = useState<PiaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    getPiaStatus().then(setStatus).catch(() => setStatus({ available: false, connectionState: null, region: null, regions: [] }));
  }, []);

  const retryNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await retryAllFailuresThroughVpn();
      const fixed = result.fixed.length + result.wishlistFixed.length;
      setMessage({
        text:
          fixed === 0 && result.stillFailing.length === 0
            ? 'Aucune fiche en échec.'
            : `${fixed} fiche${fixed > 1 ? 's' : ''} récupérée${fixed > 1 ? 's' : ''} via le VPN` +
              (result.stillFailing.length > 0 ? ` · toujours en échec : ${result.stillFailing.join(', ')} (ce n'est donc pas une restriction régionale)` : ''),
        isError: false
      });
      onRetried();
    } catch (error) {
      setMessage({ text: ipcErrorMessage(error), isError: true });
    } finally {
      setBusy(false);
      getPiaStatus().then(setStatus).catch(() => undefined);
    }
  };

  const regions = sortRegions(status?.regions ?? []);
  const regionOptions = (regions.includes(region) ? regions : [region, ...regions]).map(r => ({ value: r, label: r }));

  return (
    <div className="border-b border-divider py-4 last:border-0">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">Réessayer les échecs via Private Internet Access</div>
          <div className="mt-1 text-[13px] leading-relaxed text-text-muted">
            Une œuvre à restriction régionale ne répond pas hors du Japon et passe pour introuvable. Avec cette option, les
            fiches en échec (scan, mise à jour groupée) sont refaites en connectant PIA au Japon le temps des requêtes, puis
            PIA revient à son état d'avant. Le VPN s'applique à tout le PC pendant ces quelques secondes. PIA doit être
            ouvert (ou « piactl background enable »).
          </div>
          <div className="mt-2 text-[13px]">
            {status === null ? (
              <span className="text-text-muted">Recherche de PIA…</span>
            ) : !status.available ? (
              <span className="text-danger">
                PIA introuvable sur ce PC.{' '}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                  onClick={() => window.electronAPI.openExternal('https://www.privateinternetaccess.com/download')}
                >
                  <Download size={13} strokeWidth={2.5} />
                  Télécharger
                </button>
              </span>
            ) : status.error ? (
              <span className="text-danger">PIA ne répond pas : {status.error}</span>
            ) : (
              <span className="text-text-secondary">
                PIA détecté · {status.connectionState === 'Connected' ? `connecté (${status.region})` : 'déconnecté'}
              </span>
            )}
          </div>
        </div>
        <input
          type="checkbox"
          className="toggle flex-shrink-0"
          aria-label="Réessayer les échecs via Private Internet Access"
          checked={enabled}
          disabled={!status?.available}
          onChange={e => onEnabledChange(e.target.checked)}
        />
      </div>

      {status?.available && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={region} options={regionOptions} onChange={onRegionChange} aria-label="Région PIA" className="w-[240px]" />
          <button type="button" onClick={retryNow} disabled={busy || regionDirty || Boolean(status.error)} className="btn">
            <RotateCw size={15} strokeWidth={2.25} className={busy ? 'animate-spin' : ''} />
            {busy ? 'Connexion et nouvelles tentatives…' : 'Réessayer les échecs maintenant'}
          </button>
          {regionDirty && <span className="text-[12px] text-text-muted">Enregistre d'abord la nouvelle région.</span>}
        </div>
      )}
      {message && <p className={`mb-0 mt-2 text-[13px] ${message.isError ? 'text-danger' : 'text-text-secondary'}`}>{message.text}</p>}
    </div>
  );
}
