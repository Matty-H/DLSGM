import { describe, expect, it } from 'vitest';
import { collectLibraryCircles, dlsiteWorkUrl, splitFeed } from '../../src/renderer/src/lib/followedCircles';
import type { CircleWork } from '../../src/shared/ipc-types';

const work = (id: string, kind: CircleWork['kind'], isNew: boolean): CircleWork =>
  ({ id, title: id, kind, isNew, category: null, expected: null, firstSeen: '', makerId: 'RG1', circle: 'C', site: 'maniax' });

describe('followed circles (renderer)', () => {
  it('lists each library circle once, with its DLsite section', () => {
    const circles = collectLibraryCircles([
      { data: { maker_id: 'RG2', platform: 'home', circle: 'B' } },
      { data: { maker_id: 'RG1', circle: 'A' } },
      { data: { maker_id: 'RG2', circle: 'B' } },
      { data: { circle: 'sans id' } }
    ]);
    expect(circles).toEqual([{ makerId: 'RG1', site: 'maniax', name: 'A' }, { makerId: 'RG2', site: 'home', name: 'B' }]);
  });

  it('splits new releases from announces and hides games already in the library', () => {
    const feed = [work('RJ01', 'sale', true), work('RJ02', 'sale', false), work('RJ03', 'announce', false), work('RJ04', 'sale', true)];
    const { releases, announces } = splitFeed(feed, new Set(['RJ04']));
    expect(releases.map(w => w.id)).toEqual(['RJ01']);
    expect(announces.map(w => w.id)).toEqual(['RJ03']);
  });

  it('links announces to their announce page', () => {
    expect(dlsiteWorkUrl(work('RJ03', 'announce', false))).toBe('https://www.dlsite.com/maniax/announce/=/product_id/RJ03.html');
  });
});
