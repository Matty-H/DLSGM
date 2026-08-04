import { X } from 'lucide-react';

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
        <button onClick={onClose} aria-label="Fermer" className="btn btn-ghost btn-icon absolute right-0 top-0">
          <X size={14} strokeWidth={1.5} />
        </button>
        <h3 className="pr-9">{gameId}</h3>
        <p className="my-2.5 font-semibold text-accent-700">⚠️ Échec de la récupération des données.</p>
        <p>
          <strong>Erreur :</strong> {error || 'Inconnue'}
        </p>
        <div className="mt-2 flex gap-2">
          <button onClick={onRetry} className="btn btn-primary">
            Réessayer
          </button>
          <button onClick={onManualEdit} className="btn btn-secondary">
            Modifier manuellement
          </button>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button onClick={onOpenFolder} className="btn btn-secondary">
          Ouvrir le dossier
        </button>
      </div>
    </div>
  );
}
