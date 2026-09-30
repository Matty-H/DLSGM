import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '' } }));

import { safeSegments, sanitizeMetadata, shareableMetadata } from '../../src/main/lan-share';
import type { GameMetadata } from '../../src/shared/ipc-types';

describe('safeSegments', () => {
  it('accepte un chemin relatif ordinaire', () => {
    expect(safeSegments('www/save/file1.rmmzsave')).toEqual(['www', 'save', 'file1.rmmzsave']);
    expect(safeSegments('データ/セーブ.dat')).toEqual(['データ', 'セーブ.dat']);
  });

  it.each(['../evil', 'a/../../b', '/abs', 'C:/x', 'a//b', 'con.txt', 'a/NUL', 'dossier./x', '', 42])(
    'refuse %s',
    value => {
      expect(safeSegments(value)).toBeNull();
    }
  );
});

const personal = {
  rating: 5,
  customTags: ['secret'],
  totalPlayTime: 3600,
  lastPlayed: '2026-01-01T00:00:00.000Z',
  playSessions: [{ start: '2026-01-01T00:00:00.000Z', duration: 3600 }],
  collections: ['c1'],
  completed: true,
  sandboxDisabled: true
};

const entry = {
  work_name: 'Jeu',
  age_category: 'R18',
  platform: 'maniax',
  page_count: null,
  circle: '猫3',
  genre: ['RPG'],
  options: ['JPN', 'TRI'],
  work_image: '//img.dlsite.jp/cover.jpg',
  sample_images: ['//img.dlsite.jp/1.jpg', 'manual'],
  ...personal
} as unknown as GameMetadata;

describe('shareableMetadata', () => {
  it("n'envoie jamais les données personnelles", () => {
    const shared = shareableMetadata(entry)!;
    for (const key of Object.keys(personal)) expect(shared).not.toHaveProperty(key);
    expect(shared).toMatchObject({ work_name: 'Jeu', circle: '猫3', options: ['JPN', 'TRI'] });
  });

  it("n'envoie pas une fiche en échec", () => {
    expect(shareableMetadata({ ...entry, fetchFailed: true })).toBeNull();
  });
});

describe('sanitizeMetadata', () => {
  it('ignore les données personnelles reçues et neutralise les URL hors DLsite', () => {
    const received = sanitizeMetadata({
      ...entry,
      work_image: 'https://evil.example/cover.jpg',
      sample_images: ['https://evil.example/1.jpg', '//img.dlsite.jp/2.jpg'],
      age_category: 'NOPE'
    })!;
    for (const key of Object.keys(personal)) expect(received).not.toHaveProperty(key);
    expect(received.work_image).toBeNull();
    // Position des échantillons conservée : l'URL refusée devient 'manual'.
    expect(received.sample_images).toEqual(['manual', '//img.dlsite.jp/2.jpg']);
    expect(received.age_category).toBe('ALL_AGES');
  });

  it('rejette une fiche sans nom ou en échec', () => {
    expect(sanitizeMetadata({ circle: 'x' })).toBeNull();
    expect(sanitizeMetadata({ work_name: 'x', fetchFailed: true })).toBeNull();
    expect(sanitizeMetadata(null)).toBeNull();
  });
});
