import { Fragment, type ReactNode } from 'react';

/**
 * Phrase traduite contenant des éléments (touche, lien…) : `text` est la
 * traduction sans paramètres (« … {hotkey} … »), chaque `{nom}` est remplacé par
 * `values[nom]`. L'ordre des éléments suit donc celui de la langue affichée.
 */
export default function Trans({ text, values }: { text: string; values: Record<string, ReactNode> }) {
  const parts = text.split(/\{(\w+)\}/g);
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <Fragment key={i}>{part in values ? values[part] : `{${part}}`}</Fragment> : part))}
    </>
  );
}
