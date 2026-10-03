import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { elevatedStartCommand, MAX_LAUNCH_ARGUMENTS_LENGTH, parseLaunchArguments } from '../../src/main/launch-args';
import { sandboxedCommand } from '../../src/main/sandboxie';
import { runWithLocaleEmulator } from '../../src/main/locale-emulator';

describe('parseLaunchArguments', () => {
  it.each([
    ['-dx11', ['-dx11']],
    ['  -screen-fullscreen 0   -force-d3d11 ', ['-screen-fullscreen', '0', '-force-d3d11']],
    ['-path "C:\\Mes jeux\\data" -x', ['-path', 'C:\\Mes jeux\\data', '-x']],
    ['--name="a b"', ['--name=a b']],
    ['-msg \\"hi\\"', ['-msg', '"hi"']],
    ['""', ['']],
    ['', []]
  ])('%s', (text, expected) => {
    expect(parseLaunchArguments(text)).toEqual(expected);
  });

  it("ignore ce qui n'est pas une ligne raisonnable", () => {
    expect(parseLaunchArguments(undefined)).toEqual([]);
    expect(parseLaunchArguments(42)).toEqual([]);
    expect(parseLaunchArguments('-a\n-b')).toEqual([]);
    expect(parseLaunchArguments('x'.repeat(MAX_LAUNCH_ARGUMENTS_LENGTH + 1))).toEqual([]);
  });
});

describe('arguments dans chaque mode de lancement', () => {
  it('Sandboxie : après l’exécutable', () => {
    expect(sandboxedCommand('C:\\Sandboxie', 'DLSGMRJ01234567', 'D:\\Jeux\\RJ01234567\\Game.exe', ['-dx11']).args)
      .toEqual(['/box:DLSGMRJ01234567', '/wait', 'D:\\Jeux\\RJ01234567\\Game.exe', '-dx11']);
  });

  it('Locale Emulator : `LEProc.exe <exe> <args>`', async () => {
    const calls: string[][] = [];
    const spawn = ((_command: string, args: string[]) => {
      calls.push(args);
      const child = new EventEmitter();
      setTimeout(() => child.emit('exit', 0), 5);
      return child;
    }) as never;
    let polls = 0;
    await runWithLocaleEmulator({
      leProc: 'C:\\LE\\LEProc.exe',
      executablePath: 'D:\\Jeux\\RJ01234567\\Game.exe',
      args: ['-dx11', 'a b'],
      gameDir: 'D:\\Jeux\\RJ01234567',
      spawn,
      listProcesses: async () => new Map(polls++ === 0 ? [[1, 'D:\\Jeux\\RJ01234567\\Game.exe']] : []),
      pollMs: 5
    });
    expect(calls).toEqual([['D:\\Jeux\\RJ01234567\\Game.exe', '-dx11', 'a b']]);
  });

  it('administrateur : Start-Process avec des chaînes littérales, arguments à espaces entre guillemets', () => {
    expect(elevatedStartCommand("D:\\Jeux\\L'Été\\Game.exe", "D:\\Jeux\\L'Été", ['-dx11', 'a b'])).toBe(
      "Start-Process -FilePath 'D:\\Jeux\\L''Été\\Game.exe' -WorkingDirectory 'D:\\Jeux\\L''Été' -ArgumentList @('-dx11', '\"a b\"') -Verb RunAs"
    );
    expect(elevatedStartCommand('C:\\g.exe', 'C:\\', [])).toBe("Start-Process -FilePath 'C:\\g.exe' -WorkingDirectory 'C:\\' -Verb RunAs");
  });
});
