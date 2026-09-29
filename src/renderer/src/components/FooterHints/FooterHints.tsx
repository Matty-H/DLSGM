import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Circle, Square, Triangle, X, type LucideIcon } from 'lucide-react';
import { PS_CIRCLE, PS_CROSS, PS_SQUARE, PS_TRIANGLE } from '../../lib/gamepadLayout.js';

// Les flèches Unicode et les symboles PlayStation sont mal rendus par la
// police (trop petits, voire absents) : on les remplace par des icônes.
const ARROW_ICONS: Record<string, LucideIcon> = {
  '←': ArrowLeft,
  '↑': ArrowUp,
  '↓': ArrowDown,
  '→': ArrowRight,
  [PS_CROSS]: X,
  [PS_CIRCLE]: Circle,
  [PS_SQUARE]: Square,
  [PS_TRIANGLE]: Triangle
};

export interface FooterHint {
  keys: string[];
  label: string;
}

export interface FooterHintsProps {
  hints: FooterHint[];
}

/**
 * Barre d'aide du bas, comme les indications de boutons de manette de
 * SteamOS — ici avec les raccourcis clavier du contexte courant.
 */
export default function FooterHints({ hints }: FooterHintsProps) {
  return (
    <footer className="flex flex-shrink-0 items-center justify-end gap-6 border-t border-divider bg-bg-deep/80 px-6 py-2 backdrop-blur-md">
      {hints.map(({ keys, label }) => (
        <span key={label} className="flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
          <span className="flex gap-1">
            {keys.map(key => {
              const Icon = ARROW_ICONS[key];
              return (
                <span key={key} className="kbd" aria-label={key}>
                  {Icon ? <Icon size={12} strokeWidth={3} /> : key}
                </span>
              );
            })}
          </span>
          {label}
        </span>
      ))}
    </footer>
  );
}
