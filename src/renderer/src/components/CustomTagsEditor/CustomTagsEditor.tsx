import { useState } from 'react';

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
        <div className="mb-2 flex flex-wrap gap-2">
          {tags.map(tag => (
            <span key={tag} className="tag tag-neutral">
              {tag}
              <button onClick={() => onRemoveTag(tag)} className="ml-1.5 text-text-secondary hover:text-accent">
                x
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
          placeholder="Ajouter un tag..."
          className="input flex-1"
        />
        <button onClick={handleAdd} className="btn btn-secondary btn-icon">
          +
        </button>
      </div>
    </div>
  );
}
