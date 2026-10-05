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
vi.mock('child_process', () => ({ spawn: () => fakeWorker, execFile: () => undefined }));

import { DEFAULT_SUPER_PANIC, SuperPanic, hideCommand, sanitizeSuperPanicSettings, superPanicTarget } from '../../src/main/super-panic';
import { superPanicTargetValid } from '../../src/renderer/src/lib/superPanic';

describe('sanitizeSuperPanicSettings', () => {
  it('désactivé par défaut, son coupé par défaut', () => {
    expect(sanitizeSuperPanicSettings(undefined)).toEqual(DEFAULT_SUPER_PANIC);
  });

  it("refuse Alt+Espace (panique simple) et Maj+Tab (overlay)", () => {
    expect(sanitizeSuperPanicSettings({ hotkey: 'Alt+Space' }).hotkey).toBe(DEFAULT_SUPER_PANIC.hotkey);
    expect(sanitizeSuperPanicSettings({ hotkey: 'shift+tab' }).hotkey).toBe(DEFAULT_SUPER_PANIC.hotkey);
    expect(sanitizeSuperPanicSettings({ hotkey: 'Pause', enabled: true, mute: false, target: ' https://x.org ' })).toEqual({
      enabled: true,
      hotkey: 'Pause',
      mute: false,
      target: 'https://x.org'
    });
  });
});

describe('superPanicTarget', () => {
  it('adresse web, chemin absolu, sinon rien', () => {
    expect(superPanicTarget('https://docs.example.com/a')).toEqual({ kind: 'url', value: 'https://docs.example.com/a' });
    expect(superPanicTarget('')).toBeNull();
    expect(superPanicTarget('notes.txt')).toBeNull();
    expect(superPanicTarget('javascript:alert(1)')).toBeNull();
    expect(superPanicTarget(process.platform === 'win32' ? 'C:\\Work\\Rapport.docx' : '/Users/me/Rapport.docx')?.kind).toBe('path');
  });

  it('le renderer applique la même règle', () => {
    expect(superPanicTargetValid('https://x.org')).toBe(true);
    expect(superPanicTargetValid('C:\\Work\\a.docx')).toBe(true);
    expect(superPanicTargetValid('/Applications/Notes.app')).toBe(true);
    expect(superPanicTargetValid('notes.txt')).toBe(false);
    expect(superPanicTargetValid('file:///etc/passwd')).toBe(false);
  });
});

describe('hideCommand', () => {
  it('exclut les PID de DLSGM, son en option', () => {
    expect(hideCommand(true, [1234])).toBe('hide 1 1234');
    expect(hideCommand(false, [])).toBe('hide 0 0');
    expect(hideCommand(true, [12, -1, 1.5, 34])).toBe('hide 1 12,34');
  });
});

describe('SuperPanic : bascule sans attente', () => {
  it("worker prêt : réduire puis restaurer partent pendant l'appel (raccourci global, aucun await)", () => {
    const dir = makeTempDir();
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const events: string[] = [];
    try {
      const panic = new SuperPanic(dir, {
        setPanic: active => events.push(`panic:${active}`),
        hideApp: () => events.push('hide-app'),
        showApp: () => events.push('show-app'),
        openTarget: target => events.push(`open:${target.value}`)
      });
      panic.configure({ ...DEFAULT_SUPER_PANIC, enabled: true, target: 'https://x.org' });
      fakeWorker.stdout.emit('data', 'ready\n');

      written.length = 0;
      panic.toggle();
      expect(written).toEqual([`hide 1 ${process.pid}\n`]);
      expect(events).toEqual(['panic:true', 'hide-app', 'open:https://x.org']);
      expect(panic.active).toBe(true);

      written.length = 0;
      events.length = 0;
      panic.toggle();
      expect(written).toEqual(['restore\n']);
      // DLSGM rendu avant les autres fenêtres : le jeu repasse devant lui.
      expect(events).toEqual(['show-app', 'panic:false']);

      // Option désactivée pendant la panique : le worker reste là pour restaurer.
      panic.toggle();
      panic.configure({ ...DEFAULT_SUPER_PANIC, enabled: false });
      written.length = 0;
      panic.toggle();
      expect(written).toEqual(['restore\n']);
    } finally {
      Object.defineProperty(process, 'platform', platform);
      removeTempDir(dir);
    }
  });
});
