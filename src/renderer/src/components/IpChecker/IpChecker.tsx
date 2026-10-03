import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import type { IpCheckResult } from '../../../../shared/ipc-types';
import { t } from '../../lib/i18n.js';

/**
 * Vérificateur d'IP : adresses locales (LAN, une par interface — un VPN
 * connecté y ajoute son adaptateur) et IP publique (WAN) vue par le même
 * chemin que les requêtes DLsite, donc avec le proxy / VPN en place.
 */
export default function IpChecker() {
  const [result, setResult] = useState<IpCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await window.electronAPI.checkIp());
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const wan = result?.wan;
  const inJapan = wan?.country === 'JP';

  return (
    <div className="border-b border-divider py-4 last:border-0">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">{t('Adresses IP')}</div>
          <div className="mt-1 text-[13px] leading-relaxed text-text-muted">
            {t('LAN : adresses de ce PC sur chaque réseau. WAN : ton IP publique telle que DLsite la voit (proxy / VPN compris), demandée au service ipinfo.io quand tu cliques sur Vérifier.')}
          </div>
        </div>
        <button type="button" onClick={check} disabled={busy} className="btn flex-shrink-0">
          <RefreshCw size={15} strokeWidth={2.25} className={busy ? 'animate-spin' : ''} />
          {busy ? t('Vérification…') : t('Vérifier')}
        </button>
      </div>

      {result && (
        <div className="mt-3 grid grid-cols-1 gap-3 text-[13px] md:grid-cols-2">
          <div className="rounded-md bg-bg-deep p-3">
            <div className="section-title mb-2 text-[11px]">LAN</div>
            {result.lan.length === 0 && <div className="text-text-muted">{t('Aucune interface réseau active.')}</div>}
            {result.lan.map(entry => (
              <div key={`${entry.interface}-${entry.address}`} className="flex justify-between gap-3 py-0.5">
                <span className="min-w-0 truncate text-text-secondary" title={entry.interface}>
                  {entry.interface}
                </span>
                <span className="font-mono tabular-nums">{entry.address}</span>
              </div>
            ))}
          </div>

          <div className="rounded-md bg-bg-deep p-3">
            <div className="section-title mb-2 text-[11px]">WAN</div>
            {wan ? (
              <>
                <div className="font-mono text-[15px] font-semibold tabular-nums">{wan.ip}</div>
                <div className="mt-1 text-text-secondary">
                  {[wan.city, wan.region, wan.country].filter(Boolean).join(', ') || t('Localisation inconnue')}
                </div>
                {wan.org && <div className="truncate text-text-muted" title={wan.org}>{wan.org}</div>}
                <div className={`mt-2 font-semibold ${inJapan ? 'text-play' : 'text-text-secondary'}`}>
                  {inJapan ? t('Vu depuis le Japon : les œuvres réservées au Japon devraient être accessibles.') : t('Hors du Japon : les œuvres réservées au Japon resteront sans doute introuvables.')}
                </div>
              </>
            ) : (
              <div className="text-danger">{t('IP publique indisponible : {error}', { error: result.wanError ?? '' })}</div>
            )}
          </div>
        </div>
      )}
      {error && <p className="mb-0 mt-2 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
