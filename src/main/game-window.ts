import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import { FOREGROUND_GUARD_CS, dirsCommand } from './auto-clicker';

/**
 * Position de la fenêtre du jeu en cours (Windows), pour poser l'overlay
 * dessus plutôt que sur tout l'écran. Electron ne sait pas lire la fenêtre
 * d'un autre processus : un worker PowerShell/C# (même modèle que
 * l'auto-clicker) relève toutes les 250 ms la zone client de la fenêtre au
 * premier plan quand elle appartient à un jeu lancé depuis DLSGM, et
 * l'écrit sur stdout quand elle change.
 *
 * La dernière position connue est gardée en mémoire et lue de façon
 * synchrone par Maj+Tab : rien entre un raccourci global et son effet ne
 * doit attendre (voir auto-clicker). Quand le jeu n'est plus au premier
 * plan, elle reste celle de sa dernière apparition.
 */

/** Rectangle en pixels physiques (coordonnées écran Windows). */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Plus petite fenêtre de jeu prise en compte (en deçà : écran entier). */
export const MIN_GAME_WINDOW = { width: 320, height: 240 };

/** `rect <x> <y> <largeur> <hauteur>` → rectangle, ou null pour toute autre ligne. */
export function parseRectLine(line: string): ScreenRect | null {
  const match = /^rect (-?\d+) (-?\d+) (\d+) (\d+)$/.exec(line.trim());
  if (!match) return null;
  const [x, y, width, height] = match.slice(1).map(Number);
  if (width < MIN_GAME_WINDOW.width || height < MIN_GAME_WINDOW.height) return null;
  return { x, y, width, height };
}

export const GAME_WINDOW_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
${FOREGROUND_GUARD_CS}
public static class DlsgmGameWindow {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }

  // Coordonnées physiques : sans cela, Windows les virtualise selon la mise à l'échelle.
  public static void DpiAware() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch {} // PER_MONITOR_AWARE_V2
    try { SetProcessDPIAware(); } catch {}
  }

  static volatile string last = "";

  // Liste des jeux changée : la prochaine position est réécrite même identique.
  public static void Reset() { last = ""; }

  // Fil créé en C# : un scriptblock PowerShell n'a pas de runspace sur un autre fil.
  public static void Start() {
    Thread thread = new Thread(Loop);
    thread.IsBackground = true;
    thread.Start();
  }

  static void Loop() {
    while (true) {
      try {
        if (DlsgmForeground.IsGame()) {
          IntPtr window = GetForegroundWindow();
          Rect rect;
          Point origin = new Point();
          if (!IsIconic(window) && GetClientRect(window, out rect) && ClientToScreen(window, ref origin)) {
            string line = "rect " + origin.X + " " + origin.Y + " " + (rect.Right - rect.Left) + " " + (rect.Bottom - rect.Top);
            if (line != last) {
              last = line;
              Console.Out.WriteLine(line);
              Console.Out.Flush();
            }
          }
        }
      } catch {}
      Thread.Sleep(250);
    }
  }
}
'@
[DlsgmGameWindow]::DpiAware()
[DlsgmGameWindow]::Start()
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null -or $line -eq 'exit') { break }
  if ($line.StartsWith('dirs ')) {
    $payload = $line.Substring(5)
    $dirs = if ($payload) { [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)).Split([char]10) } else { @() }
    [DlsgmForeground]::SetDirs([string[]]$dirs)
    [DlsgmGameWindow]::Reset()
  }
}
`;

export interface GameWindowTrackerOptions {
  scriptDir: string;
  /** La fenêtre du jeu a bougé ou changé de taille. */
  onChange?: (rect: ScreenRect) => void;
}

export class GameWindowTracker {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private rect: ScreenRect | null = null;

  constructor(private readonly options: GameWindowTrackerOptions) {}

  static readonly available = process.platform === 'win32';

  /** Dernière position connue de la fenêtre d'un jeu en cours (lecture synchrone). */
  current(): ScreenRect | null {
    return this.rect;
  }

  /** Dossiers des jeux en cours : lance le worker au premier, l'arrête au dernier. */
  setGameDirs(dirs: string[]): void {
    // Un jeu fermé ne doit pas laisser sa position : le worker renvoie celle du jeu au premier plan.
    this.rect = null;
    if (dirs.length === 0) {
      this.dispose();
      return;
    }
    if (!GameWindowTracker.available) return;
    if (!this.worker) this.spawn();
    this.worker?.stdin.write(`${dirsCommand(dirs)}\n`);
  }

  private spawn(): void {
    const scriptPath = path.join(this.options.scriptDir, 'game-window.ps1');
    try {
      fs.writeFileSync(scriptPath, GAME_WINDOW_SCRIPT, 'utf8');
    } catch (error) {
      console.error('Suivi de la fenêtre du jeu :', error);
      return;
    }
    const worker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true
    });
    this.worker = worker;
    let buffer = '';
    worker.stdout.setEncoding('utf8');
    worker.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const rect = parseRectLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (rect && this.worker === worker) {
          this.rect = rect;
          this.options.onChange?.(rect);
        }
      }
    });
    worker.stderr.on('data', () => undefined);
    worker.on('error', error => console.error('Suivi de la fenêtre du jeu :', error.message));
    worker.on('exit', () => {
      if (this.worker === worker) this.worker = null;
    });
  }

  dispose(): void {
    this.rect = null;
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      try {
        worker.stdin.write('exit\n');
        worker.stdin.end();
      } catch {
        // déjà arrêté
      }
      setTimeout(() => worker.kill(), 1000).unref();
    }
  }
}
