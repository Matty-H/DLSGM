import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../../src/shared/ipc-types';
import { guardExecutablePaths, PickedPaths } from '../../src/main/trusted-paths';

const settings = (fields: Partial<AppSettings> & { target?: string }): AppSettings => ({
  localeEmulatorPath: fields.localeEmulatorPath ?? '',
  textractorPath: fields.textractorPath ?? '',
  superPanic: { enabled: true, hotkey: 'Ctrl+Shift+Space', target: fields.target ?? '', mute: true }
}) as AppSettings;

describe('guardExecutablePaths', () => {
  const previous = settings({ localeEmulatorPath: 'C:\\LE', textractorPath: 'C:\\Textractor', target: 'C:\\Work\\a.docx' });

  it('garde les anciens chemins quand la page en envoie de nouveaux, non choisis', () => {
    const guarded = guardExecutablePaths(settings({ localeEmulatorPath: 'D:\\evil', textractorPath: 'D:\\evil', target: 'D:\\evil\\run.exe' }), previous, new PickedPaths());
    expect(guarded.localeEmulatorPath).toBe('C:\\LE');
    expect(guarded.textractorPath).toBe('C:\\Textractor');
    expect(guarded.superPanic.target).toBe('C:\\Work\\a.docx');
  });

  it('accepte un chemin choisi dans une boîte de dialogue de main', () => {
    const picked = new PickedPaths();
    picked.add('D:\\LE');
    picked.add('D:\\Work\\b.xlsx');
    const guarded = guardExecutablePaths(settings({ localeEmulatorPath: 'D:\\LE', textractorPath: 'C:\\Textractor', target: 'D:\\Work\\b.xlsx' }), previous, picked);
    expect(guarded.localeEmulatorPath).toBe('D:\\LE');
    expect(guarded.superPanic.target).toBe('D:\\Work\\b.xlsx');
  });

  it('accepte de vider un chemin, et une adresse web tapée pour la fenêtre de travail', () => {
    const guarded = guardExecutablePaths(settings({ target: 'https://example.com/doc' }), previous, new PickedPaths());
    expect(guarded.localeEmulatorPath).toBe('');
    expect(guarded.textractorPath).toBe('');
    expect(guarded.superPanic.target).toBe('https://example.com/doc');
  });

  it('une adresse web n’est pas acceptée comme dossier de programme', () => {
    const guarded = guardExecutablePaths(settings({ textractorPath: 'https://example.com' }), previous, new PickedPaths());
    expect(guarded.textractorPath).toBe('C:\\Textractor');
  });
});
