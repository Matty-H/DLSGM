import { FolderOpen, Pencil, RotateCcw, TriangleAlert } from 'lucide-react';

export interface FetchFailedViewProps {
  gameId: string;
  error?: string;
  onRetry: () => void;
  onManualEdit: () => void;
  onOpenFolder: () => void;
}

export default function FetchFailedView({ gameId, error, onRetry, onManualEdit, onOpenFolder }: FetchFailedViewProps) {
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
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="btn btn-primary">
          <RotateCcw size={15} strokeWidth={2.25} />
          Réessayer
        </button>
        <button type="button" onClick={onManualEdit} className="btn">
          <Pencil size={15} strokeWidth={2.25} />
          Modifier manuellement
        </button>
        <button type="button" onClick={onOpenFolder} className="btn btn-ghost">
          <FolderOpen size={15} strokeWidth={2.25} />
          Ouvrir le dossier
        </button>
      </div>
    </div>
  );
}
