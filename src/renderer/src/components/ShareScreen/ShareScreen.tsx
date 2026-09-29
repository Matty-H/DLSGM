import { useEffect, useMemo, useState } from 'react';
import { Download, Monitor, RefreshCw, Search, Send, Upload, X } from 'lucide-react';
import type { LanShareState } from '../../hooks/useLanShare';
import { formatBytes, parseLanAddress, progressRatio, type LanTransferProgress } from '../../lib/lanShare.js';

export interface ShareScreenProps {
  share: LanShareState;
  /** Jeux présents dans le dossier de bibliothèque. */
  games: { id: string; name: string }[];
  port: number;
  onPortChange: (port: number) => void;
}

const STATE_LABELS: Record<LanTransferProgress['state'], string> = {
  active: 'En cours',
  done: 'Terminé',
  failed: 'Échec',
  cancelled: 'Annulé'
};

function TransferRow({ transfer, gameName }: { transfer: LanTransferProgress; gameName: string }) {
  const ratio = progressRatio(transfer);
  const finished = transfer.state !== 'active';
  const barColor = transfer.state === 'failed' || transfer.state === 'cancelled' ? 'bg-danger' : transfer.state === 'done' ? 'bg-play' : 'bg-accent';
  return (
    <li className="border-b border-divider py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 truncate text-[14px] font-semibold" title={gameName}>
          {gameName}
        </div>
        <div className={`flex-shrink-0 text-[12px] ${transfer.state === 'failed' ? 'text-danger' : 'text-text-muted'}`}>
          {STATE_LABELS[transfer.state]}
          {!finished && ` · ${Math.floor(ratio * 100)} %`}
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-deep">
        <div className={`h-full ${barColor} transition-[width] duration-200`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between gap-3 text-[12px] text-text-muted">
        <span className="truncate">
          {transfer.direction === 'send' ? 'Vers' : 'De'} {transfer.peer} · {transfer.doneFiles}/{transfer.totalFiles} fichiers
        </span>
        <span className="flex-shrink-0 tabular-nums">
          {formatBytes(transfer.transferredBytes)} / {formatBytes(transfer.totalBytes)}
        </span>
      </div>
      {(transfer.error) && <div className="mt-1 text-[12px] text-danger">{transfer.error}</div>}
    </li>
  );
}

/**
 * Échange de jeux en réseau local : à gauche, ouvrir ce PC à la réception
 * (port + code à communiquer) ; à droite, envoyer des jeux de la
 * bibliothèque vers un autre PC dont la réception est ouverte.
 */
export default function ShareScreen({ share, games, port, onPortChange }: ShareScreenProps) {
  const { receiver } = share;
  const receiving = receiver?.running ?? false;

  const [portInput, setPortInput] = useState(String(port));
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  useEffect(() => setPortInput(String(port)), [port]);

  // Première recherche des PC à l'ouverture de l'écran.
  useEffect(() => {
    share.discover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gameNames = useMemo(() => new Map(games.map(g => [g.id, g.name])), [games]);
  const visibleGames = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const list = term ? games.filter(g => g.id.toLowerCase().includes(term) || g.name.toLowerCase().includes(term)) : games;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [games, filter]);

  const parsedPort = Number(portInput);
  const portValid = Number.isInteger(parsedPort) && parsedPort >= 1024 && parsedPort <= 65535;
  const target = parseLanAddress(address);
  const canSend = !share.isSending && target !== null && /^\d{6}$/.test(code) && selected.size > 0;

  const incoming = share.transfers.filter(t => t.direction === 'receive');
  const outgoing = share.transfers.filter(t => t.direction === 'send');
  const hasFinished = share.transfers.some(t => t.state !== 'active');

  const handleToggleReceiver = async (enabled: boolean) => {
    if (enabled) {
      if (!portValid) return;
      if (parsedPort !== port) onPortChange(parsedPort);
      await share.startReceiving(parsedPort);
    } else {
      const active = incoming.some(t => t.state === 'active');
      if (active && !window.confirm('Des jeux sont en cours de réception. Fermer la réception les annulera. Continuer ?')) return;
      await share.stopReceiving();
    }
  };

  const toggleGame = (gameId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  };

  const handleSend = () => {
    if (!canSend || !target) return;
    // Ordre de la liste affichée, pour un envoi prévisible.
    const gameIds = visibleGames.filter(g => selected.has(g.id)).map(g => g.id);
    const hidden = [...selected].filter(id => !gameIds.includes(id));
    share.send({ host: target.host, port: target.port, code, gameIds: [...gameIds, ...hidden] });
  };

  return (
    <div data-scroll-root className="animate-steam-in flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-4">
      <h1>Partage en réseau local</h1>

      {share.error && (
        <div className="panel flex items-start justify-between gap-3 px-4 py-3 text-[14px] text-danger">
          {share.error}
        </div>
      )}

      <div className="grid min-h-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* --- Réception --- */}
        <section className="panel flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[17px] font-bold">
                <Download size={18} strokeWidth={2.25} />
                Recevoir des jeux
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
                Ouvre un port sur ce PC pour qu'un autre PC du réseau local y dépose des jeux, directement dans le dossier
                de bibliothèque. Un jeu déjà présent n'est jamais écrasé. La réception se referme à la fermeture de DLSGM.
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle flex-shrink-0"
              aria-label="Ouvrir la réception"
              checked={receiving}
              disabled={share.isTogglingReceiver || (!receiving && !portValid)}
              onChange={e => handleToggleReceiver(e.target.checked)}
            />
          </div>

          <div className="field">
            <label htmlFor="lan-port">Port</label>
            <input
              id="lan-port"
              className="input w-[140px]"
              inputMode="numeric"
              value={portInput}
              disabled={receiving}
              onChange={e => setPortInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
            />
            {!portValid && <div className="mt-1 text-[12px] text-danger">Port entre 1024 et 65535.</div>}
          </div>

          {receiving && receiver && (
            <div className="rounded-md bg-bg-deep p-4">
              <div className="section-title">Code à saisir sur l'autre PC</div>
              <div className="mt-1 text-[40px] font-extrabold leading-none tracking-[0.2em] tabular-nums">{receiver.code}</div>
              <div className="mt-3 text-[13px] text-text-secondary">
                <span className="font-semibold">{receiver.deviceName}</span>
                {receiver.addresses.length > 0 ? (
                  <> — {receiver.addresses.map(a => `${a}:${receiver.port}`).join(', ')}</>
                ) : (
                  ' — aucune adresse réseau local détectée'
                )}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                Si Windows demande l'autorisation du pare-feu, autorise les réseaux privés. Le transfert n'est pas chiffré :
                à n'utiliser que sur un réseau de confiance.
              </p>
            </div>
          )}

          {!receiving && receiver?.stoppedReason && <div className="text-[13px] text-danger">{receiver.stoppedReason}</div>}

          {incoming.length > 0 && (
            <ul>
              {incoming.map(t => (
                <TransferRow key={t.key} transfer={t} gameName={gameNames.get(t.gameId) ?? t.gameId} />
              ))}
            </ul>
          )}
        </section>

        {/* --- Envoi --- */}
        <section className="panel flex min-h-0 flex-col gap-4 p-5">
          <div>
            <div className="flex items-center gap-2 text-[17px] font-bold">
              <Upload size={18} strokeWidth={2.25} />
              Envoyer des jeux
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
              Copie les jeux choisis (dossier, fiche et images) vers un PC dont la réception est ouverte. Ta note, tes tags
              et ton temps de jeu restent sur ce PC.
            </p>
          </div>

          <div className="field">
            <label htmlFor="lan-address">PC de destination</label>
            <div className="flex flex-wrap items-center gap-2">
              {share.peers.map(peer => {
                const value = `${peer.host}:${peer.port}`;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`tag cursor-pointer ${address === value ? 'tag-accent' : ''}`}
                    onClick={() => setAddress(value)}
                    title={value}
                  >
                    <Monitor size={13} strokeWidth={2.25} />
                    {peer.name}
                  </button>
                );
              })}
              <button type="button" className="btn btn-ghost" onClick={share.discover} disabled={share.isDiscovering}>
                <RefreshCw size={15} strokeWidth={2.25} className={share.isDiscovering ? 'animate-spin' : ''} />
                {share.isDiscovering ? 'Recherche...' : share.peers.length === 0 ? 'Aucun PC trouvé — relancer' : 'Relancer'}
              </button>
            </div>
            <input
              id="lan-address"
              className="input mt-2"
              placeholder="Adresse (ex: 192.168.1.20:47821)"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
            {address && !target && <div className="mt-1 text-[12px] text-danger">Adresse invalide.</div>}
          </div>

          <div className="field">
            <label htmlFor="lan-code">Code affiché sur l'autre PC</label>
            <input
              id="lan-code"
              className="input w-[160px] tracking-[0.2em] tabular-nums"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>

          <div className="field flex min-h-0 flex-col">
            <label htmlFor="lan-filter">
              Jeux à envoyer {selected.size > 0 && <span className="text-accent">({selected.size} sélectionné{selected.size > 1 ? 's' : ''})</span>}
            </label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                id="lan-filter"
                className="input pl-9"
                placeholder="Filtrer par nom ou ID"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
            <ul className="mt-2 max-h-[280px] overflow-y-auto rounded-md bg-bg-deep p-1">
              {visibleGames.length === 0 && <li className="px-3 py-2 text-[13px] text-text-muted">Aucun jeu.</li>}
              {visibleGames.map(game => (
                <li key={game.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-[14px] hover:bg-white/5">
                    <input type="checkbox" className="accent-accent" checked={selected.has(game.id)} onChange={() => toggleGame(game.id)} disabled={share.isSending} />
                    <span className="min-w-0 flex-1 truncate">{game.name}</span>
                    <span className="flex-shrink-0 text-[12px] text-text-muted">{game.id}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2">
            {share.isSending ? (
              <button type="button" className="btn" onClick={share.cancelSend}>
                <X size={16} strokeWidth={2.25} />
                Annuler l'envoi
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={handleSend} disabled={!canSend}>
                <Send size={16} strokeWidth={2.25} />
                Envoyer {selected.size > 0 ? `${selected.size} jeu${selected.size > 1 ? 'x' : ''}` : ''}
              </button>
            )}
            {selected.size > 0 && !share.isSending && (
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(new Set())}>
                Tout désélectionner
              </button>
            )}
          </div>

          {share.lastSendResult && (
            <div className="text-[13px] text-text-secondary">
              {share.lastSendResult.cancelled && 'Envoi annulé. '}
              {share.lastSendResult.sent.length} jeu{share.lastSendResult.sent.length > 1 ? 'x' : ''} envoyé
              {share.lastSendResult.sent.length > 1 ? 's' : ''}
              {share.lastSendResult.failed.length > 0 && (
                <span className="text-danger">, {share.lastSendResult.failed.length} en échec (détail ci-dessous)</span>
              )}
              .
            </div>
          )}

          {outgoing.length > 0 && (
            <ul>
              {outgoing.map(t => (
                <TransferRow key={t.key} transfer={t} gameName={gameNames.get(t.gameId) ?? t.gameId} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {hasFinished && (
        <div>
          <button type="button" className="btn btn-ghost" onClick={share.clearFinished}>
            Effacer les transferts terminés
          </button>
        </div>
      )}
    </div>
  );
}
