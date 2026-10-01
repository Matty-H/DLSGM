import { describe, expect, it } from 'vitest';
import { activeMacroOf, formatMacroDuration, macroSummary } from '../../src/renderer/src/lib/macros';
import type { GameMacro } from '../../src/shared/ipc-types';

const macro = (id: string, steps: GameMacro['steps'], durationMs: number): GameMacro => ({ id, name: id, createdAt: '', loop: false, durationMs, steps });

describe('macros (renderer)', () => {
  it('durée et résumé (appuis seulement, pas les relâchements ni les déplacements)', () => {
    expect(formatMacroDuration(4200)).toBe('4,2 s');
    expect(formatMacroDuration(65_000)).toBe('1 min 05 s');
    expect(macroSummary(macro('a', [[0, 0, 65, 0, 0], [10, 1, 65, 0, 0], [20, 2, 0, 1, 1], [30, 4, 0, 2, 2], [40, 3, 0, 2, 2]], 1500))).toBe('2 actions · 1,5 s');
  });

  it('macro rejouée : la choisie, sinon la plus récente', () => {
    const a = macro('a', [], 0);
    const b = macro('b', [], 0);
    expect(activeMacroOf({ macros: [a, b], activeId: 'a' })).toBe(a);
    expect(activeMacroOf({ macros: [a, b], activeId: null })).toBe(b);
    expect(activeMacroOf({ macros: [a, b], activeId: 'disparue' })).toBe(b);
    expect(activeMacroOf(undefined)).toBeNull();
  });
});
