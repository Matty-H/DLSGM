import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: unknown[][] = [];
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (...args: unknown[]) => sent.push(args) } }]
  },
  nativeImage: { createFromDataURL: () => ({ isEmpty: () => false }) }
}));

import {
  DEFAULT_THEME, MAX_CUSTOM_THEMES, RANDOM_THEME, THEMES, TURBO_THEME, UI_BACKGROUND,
  contrastRatio, customToTheme, generateTurboTheme, isHexColor, newCustomThemeId, normalizeThemeSetting, onAccentColor, resolveTheme, sanitizeCustomThemes,
  type CustomTheme
} from '../../src/shared/themes';
import { applyThemeSetting, getActiveTheme, iconFromDataUrl, initTheme, rerollTheme } from '../../src/main/theme';

/** Générateur pseudo-aléatoire déterministe (Park-Miller). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

describe('palettes prédéfinies', () => {
  it('ont des ids uniques et des couleurs #rrggbb', () => {
    expect(new Set(THEMES.map(theme => theme.id)).size).toBe(THEMES.length);
    for (const theme of THEMES) {
      const colors = [theme.accent, theme.onAccent ?? '#ffffff', theme.logo.dls, theme.logo.gm, theme.icon.bg, theme.icon.dls, theme.icon.gm];
      expect(colors.every(isHexColor), theme.id).toBe(true);
    }
    expect(THEMES[0].id).toBe(DEFAULT_THEME);
  });

  it('ont Néon Tokyo, la palette officielle, par défaut', () => {
    const neon = resolveTheme(DEFAULT_THEME);
    expect(neon.id).toBe('neon');
    expect(neon.accent).toBe('#ff3ea5');
    expect(neon.onAccent).toBe('#ffffff');
  });

  it('gardent le bleu Steam d’avant les thèmes, texte blanc compris', () => {
    const steam = resolveTheme('steam');
    expect(steam.accent).toBe('#1a9fff');
    expect(steam.onAccent).toBe('#ffffff');
  });

  it('mettent un texte sombre sur un accent clair', () => {
    expect(onAccentColor('#ffc61a')).toBe('#0e141b');
    expect(resolveTheme('mustard').onAccent).toBe('#0e141b');
  });
});

describe('réglage `theme`', () => {
  it('absent (réglages d’avant les thèmes) ou inconnu : thème par défaut', () => {
    expect(normalizeThemeSetting(undefined)).toBe(DEFAULT_THEME);
    expect(normalizeThemeSetting('palette-supprimée')).toBe(DEFAULT_THEME);
    expect(resolveTheme(undefined).id).toBe(DEFAULT_THEME);
    expect(normalizeThemeSetting(RANDOM_THEME)).toBe(RANDOM_THEME);
    expect(normalizeThemeSetting(TURBO_THEME)).toBe(TURBO_THEME);
    expect(normalizeThemeSetting('sakura')).toBe('sakura');
  });

  it('aléatoire : une palette prédéfinie, jamais celle d’avant', () => {
    const random = seeded(7);
    for (let i = 0; i < 200; i++) {
      const theme = resolveTheme(RANDOM_THEME, random, 'sakura');
      expect(THEMES.some(preset => preset.id === theme.id)).toBe(true);
      expect(theme.id).not.toBe('sakura');
    }
    // Les bornes du tirage restent dans la liste.
    expect(THEMES.some(preset => preset.id === resolveTheme(RANDOM_THEME, () => 0.9999999).id)).toBe(true);
  });
});

describe('super random turbo 2000 remix', () => {
  it('génère des couleurs valides et lisibles, sur l’interface comme sur l’icône', () => {
    const random = seeded(42);
    for (let i = 0; i < 2000; i++) {
      const theme = generateTurboTheme(random);
      expect(theme.id).toBe(TURBO_THEME);
      expect([theme.accent, theme.onAccent, theme.logo.dls, theme.logo.gm, theme.icon.bg, theme.icon.dls, theme.icon.gm].every(isHexColor)).toBe(true);
      expect(contrastRatio(theme.accent, UI_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.logo.dls, UI_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.icon.dls, theme.icon.bg)).toBeGreaterThanOrEqual(2.5);
      expect(contrastRatio(theme.icon.gm, theme.icon.bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('change d’un tirage à l’autre', () => {
    const random = seeded(3);
    const accents = new Set(Array.from({ length: 20 }, () => generateTurboTheme(random).accent));
    expect(accents.size).toBeGreaterThan(15);
  });
});

describe('thème actif (main)', () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it('ne retire et ne diffuse le thème que si le réglage change', () => {
    initTheme('sakura');
    expect(getActiveTheme().id).toBe('sakura');
    applyThemeSetting('sakura');
    expect(sent).toHaveLength(0);
    applyThemeSetting('neon');
    expect(getActiveTheme().id).toBe('neon');
    expect(sent).toEqual([['theme-changed', getActiveTheme()]]);
  });

  it('« Relancer » en mode aléatoire change de palette', () => {
    initTheme(RANDOM_THEME);
    const before = getActiveTheme().id;
    expect(rerollTheme().id).not.toBe(before);
    expect(sent).toHaveLength(1);
  });

  it('n’accepte comme icône qu’un PNG en data URL de taille raisonnable', () => {
    expect(iconFromDataUrl('data:image/png;base64,iVBORw0KGgo=')).not.toBeNull();
    expect(iconFromDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(iconFromDataUrl('file:///C:/Windows/notepad.exe')).toBeNull();
    expect(iconFromDataUrl(42)).toBeNull();
    expect(iconFromDataUrl('data:image/png;base64,' + 'A'.repeat(2_000_001))).toBeNull();
  });
});

describe('palettes perso', () => {
  const dark: CustomTheme = { id: 'custom-abc123', name: 'Nuit', dls: '#101010', gm: '#202a60', bg: '#f0e0d0', rounded: true };

  it('réglages d’avant les palettes perso : aucune', () => {
    expect(sanitizeCustomThemes(undefined)).toEqual([]);
    expect(normalizeThemeSetting('custom-abc123')).toBe(DEFAULT_THEME);
  });

  it('ne gardent que des palettes valides, nommées, sans doublon ni excédent', () => {
    const list = sanitizeCustomThemes([
      { ...dark, name: '  Nuit   bleue ', dls: '#ABCDEF' },
      { ...dark, name: 'doublon' },
      { ...dark, id: 'custom-sansnom', name: '   ' },
      { ...dark, id: 'custom-badcolor', gm: 'red' },
      { ...dark, id: '../../etc', name: 'x' },
      { ...dark, id: 'custom-norounded', rounded: 'oui' },
      null
    ]);
    expect(list).toEqual([
      { ...dark, name: 'Nuit bleue', dls: '#abcdef' },
      { ...dark, id: 'custom-norounded', rounded: false }
    ]);
    const many = Array.from({ length: MAX_CUSTOM_THEMES + 5 }, (_, i) => ({ ...dark, id: `custom-n${i}xyz` }));
    expect(sanitizeCustomThemes(many)).toHaveLength(MAX_CUSTOM_THEMES);
    expect(newCustomThemeId(seeded(9))).toMatch(/^custom-[a-z0-9]{10}$/);
  });

  it('gardent leurs trois couleurs sur l’icône, éclaircies sur l’interface sombre', () => {
    const theme = customToTheme(dark);
    expect(theme.icon).toEqual({ bg: '#f0e0d0', dls: '#101010', gm: '#202a60', rounded: true });
    for (const color of [theme.accent, theme.logo.dls, theme.logo.gm]) expect(contrastRatio(color, UI_BACKGROUND)).toBeGreaterThanOrEqual(3);
    // Couleur déjà lisible : inchangée.
    expect(customToTheme({ ...dark, gm: '#ff3ea5' }).logo.gm).toBe('#ff3ea5');
  });

  it('se choisissent comme thème et entrent dans le tirage aléatoire', () => {
    expect(normalizeThemeSetting('custom-abc123', [dark])).toBe('custom-abc123');
    expect(resolveTheme('custom-abc123', Math.random, undefined, [dark]).icon.bg).toBe('#f0e0d0');
    const random = seeded(11);
    const drawn = new Set(Array.from({ length: 400 }, () => resolveTheme(RANDOM_THEME, random, undefined, [dark]).id));
    expect(drawn.has('custom-abc123')).toBe(true);
  });

  it('modifier la palette affichée la réapplique, la supprimer revient au défaut', () => {
    sent.length = 0;
    initTheme('custom-abc123', [dark]);
    expect(getActiveTheme().id).toBe('custom-abc123');
    applyThemeSetting('custom-abc123', [{ ...dark, bg: '#000000' }]);
    expect(getActiveTheme().icon.bg).toBe('#000000');
    expect(sent).toHaveLength(1);
    applyThemeSetting('custom-abc123', []);
    expect(getActiveTheme().id).toBe(DEFAULT_THEME);
    expect(sent).toHaveLength(2);
  });

  it('en mode aléatoire, une palette perso tirée puis modifiée reste affichée', () => {
    initTheme(RANDOM_THEME, [dark]);
    // Force le tirage sur la palette perso, puis la modifie.
    applyThemeSetting('custom-abc123', [dark]);
    applyThemeSetting(RANDOM_THEME, [dark]);
    const before = getActiveTheme().id;
    applyThemeSetting(RANDOM_THEME, [dark, { ...dark, id: 'custom-other1', name: 'Autre' }]);
    expect(getActiveTheme().id).toBe(before);
  });
});
