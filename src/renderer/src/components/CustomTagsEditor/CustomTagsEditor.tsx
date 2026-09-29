import { useState } from 'react';
import { Plus, X } from 'lucide-react';

export interface CustomTagsEditorProps {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}

export default function CustomTagsEditor({ tags, onAddTag, onRemoveTag }: CustomTagsEditorProps) {
  const [newTag, setNewTag] = useState('');

  const handleAdd = () => {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAddTag(trimmed);
    }
    setNewTag('');
  };

  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <span key={tag} className="tag pr-1.5">
              {tag}
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                aria-label={`Retirer ${tag}`}
                className="rounded-sm p-0.5 text-text-muted hover:bg-white/10 hover:text-text"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Ajouter un tag…"
          className="input flex-1"
        />
        <button type="button" onClick={handleAdd} aria-label="Ajouter le tag" className="btn btn-icon">
          <Plus size={17} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
