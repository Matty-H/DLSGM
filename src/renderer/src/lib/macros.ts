import type { GameMacro, GameMacros, MacroRecorderSettings, MacroRecorderStatus } from '../../../shared/ipc-types';

export type { GameMacro, GameMacros, MacroRecorderSettings, MacroRecorderStatus };

/** Durée en secondes, une décimale sous la minute (« 4,2 s », « 1 min 05 s »). */
export function formatMacroDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 60) return `${seconds.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(Math.round(seconds % 60)).padStart(2, '0')} s`;
}

/** Résumé d'une macro : actions (appuis de touche ou de bouton) et durée d'un tour. */
export function macroSummary(macro: GameMacro): string {
  const actions = macro.steps.filter(([, kind]) => kind === 0 || kind === 2).length;
  return `${actions} action${actions > 1 ? 's' : ''} · ${formatMacroDuration(macro.durationMs)}`;
}

/** Macro jouée par le raccourci : la macro active, sinon la plus récente. */
export function activeMacroOf(data: GameMacros | undefined): GameMacro | null {
  if (!data || data.macros.length === 0) return null;
  return data.macros.find(m => m.id === data.activeId) ?? data.macros[data.macros.length - 1];
}
