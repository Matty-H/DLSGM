import { describe, expect, it } from 'vitest';
import { isAdultBlurred } from '../../src/renderer/src/lib/adultContent';

describe('isAdultBlurred', () => {
  it('floute une œuvre R18 quand le flou est actif et qu\'elle n\'a pas été révélée', () => {
    expect(isAdultBlurred('R18', true, false)).toBe(true);
  });

  it('ne floute ni une œuvre révélée, ni avec le flou désactivé, ni une œuvre non R18', () => {
    expect(isAdultBlurred('R18', true, true)).toBe(false);
    expect(isAdultBlurred('R18', false, false)).toBe(false);
    expect(isAdultBlurred('R15', true, false)).toBe(false);
    expect(isAdultBlurred('ALL_AGES', true, false)).toBe(false);
    expect(isAdultBlurred(undefined, true, false)).toBe(false);
  });
});
