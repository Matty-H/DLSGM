import { describe, expect, it } from 'vitest';
import { themeChoices, themeLabel } from '../../src/renderer/src/lib/themes';
import { RANDOM_THEME, THEMES, TURBO_THEME } from '../../src/shared/themes';

describe('choix du thème (paramètres)', () => {
  it('propose chaque palette puis les deux modes aléatoires, tous nommés', () => {
    expect(themeChoices()).toEqual([...THEMES.map(theme => theme.id), RANDOM_THEME, TURBO_THEME]);
    // Une palette ajoutée sans nom afficherait son id brut.
    for (const id of themeChoices()) expect(themeLabel(id), id).not.toBe(id);
  });
});
