import { describe, expect, it } from 'vitest';
import { releaseLabel } from '../../src/renderer/src/lib/releaseInfo';

describe('releaseLabel', () => {
  it('version et DLC, ou rien', () => {
    expect(releaseLabel({ version: '1.2', dlc: true })).toBe('v1.2 · DLC inclus');
    expect(releaseLabel({ version: null, dlc: true })).toBe('DLC inclus');
    expect(releaseLabel({})).toBe('');
  });
});
