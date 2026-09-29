import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelLanSend,
  discoverLanPeers,
  getLanReceiverStatus,
  onLanReceiverStatus,
  onLanTransferProgress,
  sendGamesOverLan,
  startLanReceiver,
  stopLanReceiver,
  upsertTransfer,
  type LanPeer,
  type LanReceiverStatus,
  type LanSendRequest,
  type LanSendResult,
  type LanTransferProgress
} from '../lib/lanShare.js';
import { ipcErrorMessage } from '../lib/gameTools.js';

/**
 * État de l'échange de jeux en réseau local. Monté au niveau de l'App (et
 * non de l'écran Partage) : la réception continue pendant qu'on navigue
 * ailleurs, et chaque jeu reçu doit déclencher un rescan de la bibliothèque.
 */
export function useLanShare({ onGameReceived }: { onGameReceived: (gameId: string) => void }) {
  const [receiver, setReceiver] = useState<LanReceiverStatus | null>(null);
  const [transfers, setTransfers] = useState<LanTransferProgress[]>([]);
  const [peers, setPeers] = useState<LanPeer[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isTogglingReceiver, setIsTogglingReceiver] = useState(false);
  const [lastSendResult, setLastSendResult] = useState<LanSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onGameReceivedRef = useRef(onGameReceived);
  onGameReceivedRef.current = onGameReceived;

  useEffect(() => {
    getLanReceiverStatus().then(setReceiver).catch(() => undefined);
    const offProgress = onLanTransferProgress(progress => {
      setTransfers(prev => upsertTransfer(prev, progress));
      if (progress.direction === 'receive' && progress.state === 'done') onGameReceivedRef.current(progress.gameId);
    });
    const offStatus = onLanReceiverStatus(setReceiver);
    return () => {
      offProgress();
      offStatus();
    };
  }, []);

  const startReceiving = useCallback(async (port: number) => {
    setError(null);
    setIsTogglingReceiver(true);
    try {
      setReceiver(await startLanReceiver(port));
    } catch (e) {
      setError(ipcErrorMessage(e));
    } finally {
      setIsTogglingReceiver(false);
    }
  }, []);

  const stopReceiving = useCallback(async () => {
    setError(null);
    setIsTogglingReceiver(true);
    try {
      setReceiver(await stopLanReceiver());
    } catch (e) {
      setError(ipcErrorMessage(e));
    } finally {
      setIsTogglingReceiver(false);
    }
  }, []);

  const discover = useCallback(async () => {
    setIsDiscovering(true);
    try {
      setPeers(await discoverLanPeers());
    } catch (e) {
      setError(ipcErrorMessage(e));
    } finally {
      setIsDiscovering(false);
    }
  }, []);

  const send = useCallback(async (request: LanSendRequest) => {
    setError(null);
    setLastSendResult(null);
    setIsSending(true);
    try {
      setLastSendResult(await sendGamesOverLan(request));
    } catch (e) {
      setError(ipcErrorMessage(e));
    } finally {
      setIsSending(false);
    }
  }, []);

  const cancelSend = useCallback(() => {
    cancelLanSend().catch(() => undefined);
  }, []);

  /** Retire de la liste les transferts terminés (réussis, échoués ou annulés). */
  const clearFinished = useCallback(() => {
    setTransfers(prev => prev.filter(t => t.state === 'active'));
  }, []);

  return {
    receiver,
    transfers,
    peers,
    isDiscovering,
    isSending,
    isTogglingReceiver,
    lastSendResult,
    error,
    startReceiving,
    stopReceiving,
    discover,
    send,
    cancelSend,
    clearFinished
  };
}

export type LanShareState = ReturnType<typeof useLanShare>;
