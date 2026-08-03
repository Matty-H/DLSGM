export interface FetchFailedViewProps {
  gameId: string;
  error?: string;
  onClose: () => void;
  onRetry: () => void;
  onManualEdit: () => void;
  onOpenFolder: () => void;
}

export default function FetchFailedView({ gameId, error, onClose, onRetry, onManualEdit, onOpenFolder }: FetchFailedViewProps) {
  return (
    <div>
      <div className="relative mb-4">
        <button
          onClick={onClose}
          className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-danger font-bold text-white shadow-lg hover:bg-danger-hover"
        >
          ✖
        </button>
        <h3 className="text-xl font-semibold">{gameId}</h3>
        <p className="my-2.5 font-bold text-accent">⚠️ Échec de la récupération des données.</p>
        <p>
          <strong>Erreur :</strong> {error || 'Inconnue'}
        </p>
        <div className="mt-2 flex gap-2">
          <button onClick={onRetry} className="rounded bg-primary px-4 py-2 text-white">
            Réessayer
          </button>
          <button onClick={onManualEdit} className="rounded border border-border bg-surface-hover px-4 py-2 text-white">
            Modifier manuellement
          </button>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button onClick={onOpenFolder} className="rounded-md bg-[#0040ff] px-4 py-2.5 text-sm font-semibold text-white">
          Ouvrir le dossier
        </button>
      </div>
    </div>
  );
}
