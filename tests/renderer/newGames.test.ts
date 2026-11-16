import { describe, expect, it } from 'vitest';
import { detectNewGames, MAX_NEW_AT_ONCE } from '../../src/renderer/src/lib/newGames.js';

const ids = (count: number, from = 1) => Array.from({ length: count }, (_, i) => `RJ${String(from + i).padStart(6, '0')}`);

describe('detectNewGames', () => {
  it('le premier contenu de la bibliothèque sert de référence : rien de nouveau', () => {
    const { known, added } = detectNewGames(null, ['RJ000001', 'RJ000002']);
    expect(added).toEqual([]);
    expect([...known]).toEqual(['RJ000001', 'RJ000002']);
  });

  it('une bibliothèque vide au départ : le premier jeu importé est nouveau', () => {
    const first = detectNewGames(null, []);
    expect(detectNewGames(first.known, ['RJ000001']).added).toEqual(['RJ000001']);
  });

  it('seuls les jeux absents juste avant sont nouveaux', () => {
    const first = detectNewGames(null, ['RJ000001']);
    const second = detectNewGames(first.known, ['RJ000001', 'RJ000002', 'RJ000003']);
    expect(second.added).toEqual(['RJ000002', 'RJ000003']);
    expect(detectNewGames(second.known, ['RJ000001', 'RJ000002', 'RJ000003']).added).toEqual([]);
  });

  // Régression : un jeu supprimé puis réimporté (sa fiche reste dans le cache)
  // entrait sans l'animation d'ajout, parce qu'il avait « déjà été vu ».
  it('un jeu supprimé puis réimporté est de nouveau nouveau', () => {
    const first = detectNewGames(null, ['RJ000001', 'RJ000002']);
    const without = detectNewGames(first.known, ['RJ000001']);
    expect(without.added).toEqual([]);
    expect(detectNewGames(without.known, ['RJ000001', 'RJ000002']).added).toEqual(['RJ000002']);
  });

  it('trop d’arrivées d’un coup : une autre bibliothèque s’affiche, rien n’est signalé', () => {
    const first = detectNewGames(null, ['RJ000001']);
    const many = detectNewGames(first.known, ['RJ000001', ...ids(MAX_NEW_AT_ONCE + 1, 100)]);
    expect(many.added).toEqual([]);
    expect(many.known.size).toBe(MAX_NEW_AT_ONCE + 2);
    expect(detectNewGames(first.known, ['RJ000001', ...ids(MAX_NEW_AT_ONCE, 100)]).added).toHaveLength(MAX_NEW_AT_ONCE);
  });

  it('ne modifie pas l’ensemble reçu', () => {
    const known = new Set(['RJ000001']);
    detectNewGames(known, ['RJ000002']);
    expect([...known]).toEqual(['RJ000001']);
  });
});
