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
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center rounded border border-border bg-surface-hover px-2 py-0.5 text-xs text-white"
          >
            {tag}
            <button onClick={() => onRemoveTag(tag)} className="ml-1.5 text-text-secondary hover:text-accent">
              x
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          placeholder="Ajouter un tag..."
          className="flex-1 rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-white"
        />
        <button onClick={handleAdd} className="flex h-8 w-8 items-center justify-center rounded bg-primary font-bold text-white">
          +
        </button>
      </div>
    </div>
  );
}
