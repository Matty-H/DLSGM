import { describe, expect, it } from 'vitest';
import { ocrLanguageInstalled } from '../../src/renderer/src/lib/ocr';

describe('langue OCR installée', () => {
  it('même langue de base suffit, mais le chinois distingue son écriture', () => {
    // Langues réellement annoncées par Windows sur la machine de test.
    expect(ocrLanguageInstalled(['en-US', 'fr-FR'], 'en-US')).toBe(true);
    expect(ocrLanguageInstalled(['en-US', 'fr-FR'], 'ja')).toBe(false);
    expect(ocrLanguageInstalled(['ja-JP'], 'ja')).toBe(true);
    expect(ocrLanguageInstalled(['zh-Hans-CN'], 'zh-Hans')).toBe(true);
    expect(ocrLanguageInstalled(['zh-Hans-CN'], 'zh-Hant')).toBe(false);
  });
});
