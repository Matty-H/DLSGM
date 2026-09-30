import { describe, expect, it } from 'vitest';
import { boxNameFor, sandboxedPathFor } from '../../src/main/sandboxie';

describe('boxNameFor', () => {
  it('préfixe l’ID (Sandboxie : lettres et chiffres uniquement)', () => {
    expect(boxNameFor('RJ01234567')).toBe('DLSGMRJ01234567');
  });
});

// Chemins Windows : n'a de sens (et ne passe) que sous Windows.
describe.runIf(process.platform === 'win32')('sandboxedPathFor', () => {
  const root = 'C:\\Sandbox\\bob\\DLSGMRJ1';
  const home = 'C:\\Users\\bob';

  it('redirige le profil utilisateur vers user\\current', () => {
    expect(sandboxedPathFor(root, home, 'C:\\Users\\bob\\AppData\\LocalLow\\Co\\Game')).toBe(
      'C:\\Sandbox\\bob\\DLSGMRJ1\\user\\current\\AppData\\LocalLow\\Co\\Game'
    );
  });

  it('redirige les autres chemins vers drive\\<lettre>', () => {
    expect(sandboxedPathFor(root, home, 'D:\\Games\\x')).toBe('C:\\Sandbox\\bob\\DLSGMRJ1\\drive\\D\\Games\\x');
  });
});
