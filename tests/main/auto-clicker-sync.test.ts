import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { makeTempDir, removeTempDir } from '../helpers';

// Faux worker PowerShell : stdin enregistré, stdout piloté par le test.
const written: string[] = [];
const fakeWorker = Object.assign(new EventEmitter(), {
  stdin: { write: (text: string) => written.push(text), end: () => undefined },
  stdout: Object.assign(new EventEmitter(), { setEncoding: () => undefined }),
  stderr: new EventEmitter(),
  kill: () => undefined
});
vi.mock('child_process', () => ({ spawn: () => fakeWorker }));

import { AutoClicker, DEFAULT_AUTO_CLICKER } from '../../src/main/auto-clicker';

describe('AutoClicker : démarrage sans attente', () => {
  it("worker prêt : la commande part pendant l'appel, sans await (sinon Electron la retarde depuis un raccourci global)", async () => {
    const dir = makeTempDir();
    // L'auto-clicker n'est disponible que sous Windows ; la CI peut tourner ailleurs.
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      const clicker = new AutoClicker({ scriptDir: dir, toScreenPoint: p => p, onStatus: () => undefined });
      const warm = clicker.warmUp();
      fakeWorker.stdout.emit('data', 'ready\n');
      await warm;

      written.length = 0;
      void clicker.toggle(DEFAULT_AUTO_CLICKER);
      // Vérifié tout de suite, avant toute microtâche.
      expect(written.some(line => line.startsWith('start '))).toBe(true);
      expect(clicker.getStatus().running).toBe(true);

      written.length = 0;
      void clicker.toggle(DEFAULT_AUTO_CLICKER);
      expect(written).toEqual(['stop\n']);
    } finally {
      Object.defineProperty(process, 'platform', platform);
      removeTempDir(dir);
    }
  });
});
