import { describe, expect, it } from 'vitest';
import { isPlayableHere } from '../../src/renderer/src/lib/platforms';

describe('isPlayableHere', () => {
  it('jouable si une version pour cette machine est dans le dossier', () => {
    expect(isPlayableHere(['windows', 'mac'], 'mac')).toBe(true);
    expect(isPlayableHere(['windows'], 'mac')).toBe(false);
    expect(isPlayableHere([], 'mac')).toBe(false);
    expect(isPlayableHere(['android'], null)).toBe(false);
  });

  it("ne masque rien tant que la détection n'a pas répondu", () => {
    expect(isPlayableHere(undefined, 'mac')).toBe(true);
  });
});
