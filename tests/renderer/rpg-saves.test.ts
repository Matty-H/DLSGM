import { describe, expect, it } from 'vitest';
import { countChanges, parseVariableInput, visibleEntries } from '../../src/renderer/src/lib/rpgSaves';
import type { RpgSaveData } from '../../src/shared/ipc-types';

const data: RpgSaveData = {
  file: 'file1.rpgsave',
  gold: 10,
  items: [
    { id: 1, name: 'Potion', value: 2 },
    { id: 2, name: '', value: 0 },
    { id: 3, name: '', value: 4 }
  ],
  weapons: [],
  armors: [],
  variables: [
    { id: 1, name: 'Chapitre', value: 'Ch.1' },
    { id: 2, name: '', value: 0 }
  ],
  switches: [
    { id: 1, name: 'Porte', value: false },
    { id: 2, name: '', value: false }
  ]
};

describe('rpg save editor', () => {
  it('hides unnamed entries unless owned or changed, and applies edits', () => {
    const rows = visibleEntries(data, 'items', { items: { '2': 5 } }, { search: '', namedOnly: true });
    expect(rows.map(r => [r.id, r.value, r.changed])).toEqual([[1, 2, false], [2, 5, true], [3, 4, false]]);
    expect(visibleEntries(data, 'switches', {}, { search: '', namedOnly: true }).map(r => r.id)).toEqual([1]);
    expect(visibleEntries(data, 'switches', {}, { search: '', namedOnly: false }).map(r => r.id)).toEqual([1, 2]);
  });

  it('searches by name or exact id', () => {
    expect(visibleEntries(data, 'items', {}, { search: 'pot', namedOnly: false }).map(r => r.id)).toEqual([1]);
    expect(visibleEntries(data, 'items', {}, { search: '3', namedOnly: false }).map(r => r.id)).toEqual([3]);
  });

  it('keeps text variables as text and numeric ones as numbers', () => {
    expect(parseVariableInput('42', 0)).toBe(42);
    expect(parseVariableInput('42', 'Ch.1')).toBe('42');
    expect(parseVariableInput('abc', 0)).toBe('abc');
    expect(parseVariableInput('', null)).toBe(0);
  });

  it('counts changes', () => {
    expect(countChanges({})).toBe(0);
    expect(countChanges({ gold: 1, items: { '1': 2, '2': 3 }, switches: { '1': true } })).toBe(4);
  });
});
