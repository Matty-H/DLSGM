import { useState } from 'react';
import { Check, Plus, Sparkles } from 'lucide-react';
import type { GameCollection } from '../../lib/collections.js';

export interface CollectionsEditorProps {
  collections: GameCollection[];
  /** IDs des collections du jeu. */
  selectedIds: string[];
  /** Collections où le jeu est seulement par leurs règles (non décochables ici). */
  ruleIds?: string[];
  onToggle: (collectionId: string) => void;
  /** Crée une collection et y ajoute le jeu ; false si le nom est vide ou déjà pris. */
  onCreate: (name: string) => boolean;
}

/** Appartenance d'un jeu aux collections : une pastille par collection (appuyer bascule), et création rapide. */
export default function CollectionsEditor({ collections, selectedIds, ruleIds = [], onToggle, onCreate }: CollectionsEditorProps) {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState(false);

  const handleCreate = () => {
    if (!newName.trim()) return;
    if (onCreate(newName)) {
      setNewName('');
      setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <div>
      {collections.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {collections.map(collection => {
            const byRules = ruleIds.includes(collection.id);
            const selected = selectedIds.includes(collection.id) || byRules;
            return (
              <button
                key={collection.id}
                type="button"
                onClick={() => onToggle(collection.id)}
                aria-pressed={selected}
                disabled={byRules}
                title={byRules ? 'Ajouté par les règles de la collection (Paramètres › Collections)' : undefined}
                className={`tag ${selected ? 'tag-accent' : ''}`}
              >
                {byRules ? <Sparkles size={12} strokeWidth={2.5} /> : selected && <Check size={12} strokeWidth={3} />}
                {collection.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => {
            setNewName(e.target.value);
            setError(false);
          }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Nouvelle collection…"
          aria-label="Nom de la nouvelle collection"
          className="input flex-1"
        />
        <button type="button" onClick={handleCreate} aria-label="Créer la collection" className="btn btn-icon">
          <Plus size={17} strokeWidth={2.5} />
        </button>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-danger">Une collection porte déjà ce nom.</p>}
    </div>
  );
}
