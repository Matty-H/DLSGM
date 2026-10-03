import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AutoClickerSettings, AutoClickerStatus, ClickerButton } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Auto-clicker façon OP Auto Clicker (Windows) : clics (simples ou doubles)
 * à intervalle régulier, au curseur ou sur un point fixe, jusqu'à l'arrêt ou
 * après N clics, démarré / arrêté par un raccourci global (F6 par défaut).
 *
 * Garde-fou contre les effets de bord : un clic n'est envoyé que si la
 * fenêtre au premier plan appartient à un processus dont l'exécutable est
 * dans le dossier d'un jeu en cours (`setGameDirs`). Sinon (Alt+Tab, bureau,
 * autre application), l'auto-clicker se met en pause au lieu de cliquer ailleurs.
 *
 * Les clics sont envoyés par un petit worker PowerShell (Add-Type d'une
 * classe C# : mouse_event/SetCursorPos de user32), lancé une fois et piloté
 * par stdin — pas de module natif à recompiler par plateforme. La boucle
 * tourne dans un thread du worker : l'arrêt ne dépend pas de la réactivité
 * de l'interface.
 *
 * Limite : Windows (UIPI) bloque les clics envoyés à une fenêtre lancée en
 * administrateur par un processus qui ne l'est pas.
 */

export const MIN_INTERVAL_MS = 10;
export const MAX_INTERVAL_MS = 24 * 3600 * 1000;

// mouse_event : drapeaux appui / relâchement par bouton.
const BUTTON_FLAGS: Record<ClickerButton, [down: number, up: number]> = {
  left: [0x0002, 0x0004],
  right: [0x0008, 0x0010],
  middle: [0x0020, 0x0040]
};

export const DEFAULT_AUTO_CLICKER: AutoClickerSettings = {
  enabled: false,
  hotkey: 'F6',
  intervalMs: 100,
  button: 'left',
  double: false,
  repeat: 0,
  position: null
};

const intOr = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

/** Réglages venus du renderer / des paramètres, ramenés dans les bornes. */
export function sanitizeClickerSettings(value: Partial<AutoClickerSettings> | undefined): AutoClickerSettings {
  const v = value ?? {};
  const position =
    v.position && typeof v.position.x === 'number' && typeof v.position.y === 'number' && Number.isFinite(v.position.x) && Number.isFinite(v.position.y)
      ? { x: Math.round(v.position.x), y: Math.round(v.position.y) }
      : null;
  return {
    enabled: Boolean(v.enabled),
    hotkey: typeof v.hotkey === 'string' && v.hotkey.trim() ? v.hotkey.trim() : DEFAULT_AUTO_CLICKER.hotkey,
    intervalMs: intOr(v.intervalMs, DEFAULT_AUTO_CLICKER.intervalMs, MIN_INTERVAL_MS, MAX_INTERVAL_MS),
    button: v.button === 'right' || v.button === 'middle' ? v.button : 'left',
    double: Boolean(v.double),
    repeat: intOr(v.repeat, 0, 0, 1_000_000),
    position
  };
}

/** `dirs <base64>` : dossiers des jeux en cours (UTF-8, un par ligne, chacun terminé par un séparateur). */
export function dirsCommand(dirs: string[]): string {
  const normalized = dirs.map(dir => (dir.endsWith(path.sep) ? dir : dir + path.sep));
  return `dirs ${Buffer.from(normalized.join('\n'), 'utf8').toString('base64')}`;
}

/**
 * Ligne de commande envoyée au worker :
 * `start <run> <intervalle> <appui> <relâchement> <clics par coup> <répétitions> <fixe 0|1> <x> <y>`.
 * `point` : position fixe déjà convertie en pixels physiques.
 */
export function startCommand(run: number, settings: AutoClickerSettings, point: { x: number; y: number } | null): string {
  const [down, up] = BUTTON_FLAGS[settings.button];
  return ['start', run, settings.intervalMs, down, up, settings.double ? 2 : 1, settings.repeat, point ? 1 : 0, point?.x ?? 0, point?.y ?? 0].join(' ');
}

/**
 * Classe C# commune aux workers (auto-clicker, détecteur de rythme) : la
 * fenêtre au premier plan appartient-elle à un exécutable situé dans le
 * dossier d'un jeu en cours ? (`dirs`, voir dirsCommand.)
 */
export const FOREGROUND_GUARD_CS = String.raw`
public static class DlsgmForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref uint size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

  static volatile string[] gameDirs = new string[0];

  public static void SetDirs(string[] dirs) { gameDirs = dirs; }

  public static bool IsGame() {
    string[] dirs = gameDirs;
    if (dirs.Length == 0) return false;
    IntPtr window = GetForegroundWindow();
    if (window == IntPtr.Zero) return false;
    uint pid;
    GetWindowThreadProcessId(window, out pid);
    IntPtr process = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (process == IntPtr.Zero) return false;
    try {
      StringBuilder name = new StringBuilder(1024);
      uint size = 1024;
      if (!QueryFullProcessImageName(process, 0, name, ref size)) return false;
      string image = name.ToString();
      foreach (string dir in dirs) {
        if (image.StartsWith(dir, StringComparison.OrdinalIgnoreCase)) return true;
      }
      return false;
    } finally {
      CloseHandle(process);
    }
  }
}
`;

/**
 * Classe C# commune aux workers : coordonnées en pixels physiques. Sans
 * cela, Windows virtualise celles d'un processus non « DPI aware » selon la
 * mise à l'échelle (SetCursorPos, captures d'écran, position des fenêtres
 * décalées, voire sur un autre écran quand les écrans n'ont pas la même
 * échelle), alors que DLSGM leur envoie des pixels physiques
 * (screen.dipToScreenPoint).
 */
export const DPI_AWARE_CS = String.raw`
public static class DlsgmDpi {
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  public static void Enable() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch {} // PER_MONITOR_AWARE_V2
    try { SetProcessDPIAware(); } catch {}
  }
}
`;

export const WORKER_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
${FOREGROUND_GUARD_CS}
${DPI_AWARE_CS}
public static class DlsgmClicker {
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("winmm.dll")] static extern uint timeBeginPeriod(uint period);
  [DllImport("winmm.dll")] static extern uint timeEndPeriod(uint period);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern bool SetProcessInformation(IntPtr process, int infoClass, ref PowerThrottlingState info, uint size);

  [StructLayout(LayoutKind.Sequential)]
  struct PowerThrottlingState { public uint Version; public uint ControlMask; public uint StateMask; }

  // Windows 11 ralentit (EcoQoS) les processus d'arrière-plan sans fenêtre :
  // le worker s'en exclut (vitesse d'exécution et résolution des minuteries).
  public static void DisableThrottling() {
    PowerThrottlingState state = new PowerThrottlingState();
    state.Version = 1;
    state.ControlMask = 0x1 | 0x4; // EXECUTION_SPEED | IGNORE_TIMER_RESOLUTION
    state.StateMask = 0;
    try { SetProcessInformation(GetCurrentProcess(), 4, ref state, (uint)Marshal.SizeOf(state)); } catch { }
  }

  static readonly ManualResetEvent stopSignal = new ManualResetEvent(false);
  static Thread worker;

  static void Emit(string line) {
    Console.Out.WriteLine(line);
    Console.Out.Flush();
  }

  public static void Start(int run, int interval, uint down, uint up, int perTick, int repeat, bool fixedPos, int x, int y) {
    Stop();
    stopSignal.Reset();
    worker = new Thread(() => {
      timeBeginPeriod(1);
      bool paused = false;
      bool clicked = false;
      Emit("started " + run);
      try {
        int n = 0;
        while (repeat <= 0 || n < repeat) {
          bool inGame = DlsgmForeground.IsGame();
          if (inGame == paused) {
            paused = !inGame;
            Emit((paused ? "paused " : "resumed ") + run);
          }
          if (paused) {
            if (stopSignal.WaitOne(Math.Min(interval, 200))) break;
            continue;
          }
          if (fixedPos) SetCursorPos(x, y);
          for (int i = 0; i < perTick; i++) {
            mouse_event(down, 0, 0, 0, UIntPtr.Zero);
            mouse_event(up, 0, 0, 0, UIntPtr.Zero);
          }
          if (!clicked) {
            clicked = true;
            Emit("click " + run);
          }
          n++;
          if (stopSignal.WaitOne(interval)) break;
        }
      } finally {
        timeEndPeriod(1);
        Emit("stopped " + run);
      }
    });
    worker.IsBackground = true;
    worker.Priority = ThreadPriority.AboveNormal;
    worker.Start();
  }

  public static void Stop() {
    stopSignal.Set();
    if (worker != null) { worker.Join(5000); worker = null; }
  }
}
'@
[DlsgmDpi]::Enable()
[DlsgmClicker]::DisableThrottling()
try { [Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'AboveNormal' } catch { }
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { [DlsgmClicker]::Stop(); break }
  $p = $line.Split(' ')
  if ($p[0] -eq 'start') {
    [DlsgmClicker]::Start([int]$p[1], [int]$p[2], [uint32]$p[3], [uint32]$p[4], [int]$p[5], [int]$p[6], $p[7] -eq '1', [int]$p[8], [int]$p[9])
  } elseif ($p[0] -eq 'stop') {
    [DlsgmClicker]::Stop()
  } elseif ($p[0] -eq 'dirs') {
    $text = ''
    if ($p.Length -gt 1) { $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[1])) }
    [DlsgmForeground]::SetDirs([string[]]@($text.Split([char]10) | Where-Object { $_ -ne '' }))
  } elseif ($p[0] -eq 'probe') {
    [Console]::Out.WriteLine('probe ' + [DlsgmForeground]::IsGame())
    [Console]::Out.Flush()
  }
}
`;

export interface AutoClickerOptions {
  /** Dossier où écrire le script du worker (userData). */
  scriptDir: string;
  /** Journal des démarrages / arrêts et de leurs délais (diagnostic), null = aucun. */
  logPath?: string | null;
  /** Pixels physiques d'un point en coordonnées Electron (screen.dipToScreenPoint). */
  toScreenPoint: (point: { x: number; y: number }) => { x: number; y: number };
  onStatus: (status: AutoClickerStatus) => void;
}

export class AutoClicker {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private run = 0;
  private status: AutoClickerStatus = {
    available: process.platform === 'win32',
    running: false,
    paused: false,
    inGame: false,
    hotkeyActive: false,
    error: null,
    lastStartLatencyMs: null,
    lastStopLatencyMs: null
  };
  private gameDirs: string[] = [];
  // Instants des demandes en cours, pour mesurer les délais.
  private startRequestedAt = 0;
  private stopRequestedAt = 0;
  private spawnedAt = 0;
  // Worker prêt : démarrer ne demande alors aucune attente (voir start).
  private isReady = false;

  constructor(private readonly options: AutoClickerOptions) {}

  getStatus(): AutoClickerStatus {
    return { ...this.status };
  }

  setHotkeyActive(active: boolean): void {
    if (this.status.hotkeyActive !== active) this.update({ hotkeyActive: active });
  }

  setInGame(inGame: boolean): void {
    if (this.status.inGame !== inGame) this.update({ inGame });
  }

  private log(message: string): void {
    const logPath = this.options.logPath;
    if (!logPath) return;
    try {
      // Journal court : repart de zéro au-delà de 200 Ko.
      if (fs.existsSync(logPath) && fs.statSync(logPath).size > 200_000) fs.writeFileSync(logPath, '');
      fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
    } catch {
      // diagnostic seulement
    }
  }

  private update(patch: Partial<AutoClickerStatus>): void {
    this.status = { ...this.status, ...patch };
    this.options.onStatus(this.getStatus());
  }

  /** Lance le worker (compilation C# : une à deux secondes la première fois). */
  warmUp(): Promise<void> {
    if (!this.status.available) return Promise.reject(new Error(tm("L'auto-clicker n'est disponible que sous Windows.")));
    if (this.ready) return this.ready;
    const scriptPath = path.join(this.options.scriptDir, 'auto-clicker.ps1');
    fs.writeFileSync(scriptPath, WORKER_SCRIPT, 'utf8');
    this.spawnedAt = Date.now();
    this.log('worker: lancement');
    const worker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true
    });
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      let buffer = '';
      let stderr = '';
      worker.stdout.setEncoding('utf8');
      worker.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line === 'ready') {
            this.log(`worker: prêt en ${Date.now() - this.spawnedAt} ms`);
            if (this.worker === worker) this.isReady = true;
            resolve();
          }
          const event = /^(started|click|stopped|paused|resumed) (\d+)$/.exec(line);
          // Un ancien tour qui s'arrête (redémarrage) ne doit pas toucher au nouveau.
          if (event && Number(event[2]) === this.run) this.onWorkerEvent(event[1]);
        }
      });
      worker.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      worker.on('error', error => {
        reject(error);
        if (this.worker === worker) this.reset(tm("Démarrage de l'auto-clicker impossible : {error}", { error: error.message }));
      });
      worker.on('exit', code => {
        const message = stderr.trim() || tm("le worker s'est arrêté (code {code})", { code: String(code) });
        reject(new Error(message));
        // Un worker remplacé (dispose puis relance) ne touche pas au nouveau.
        if (this.worker === worker) this.reset(tm('Auto-clicker arrêté : {error}', { error: message }));
      });
    });
    return this.ready;
  }

  private onWorkerEvent(kind: string): void {
    const now = Date.now();
    switch (kind) {
      case 'started':
        this.log(`démarrage: worker parti ${now - this.startRequestedAt} ms après l'appui`);
        break;
      case 'click':
        this.log(`démarrage: premier clic ${now - this.startRequestedAt} ms après l'appui`);
        this.update({ lastStartLatencyMs: now - this.startRequestedAt });
        break;
      case 'paused':
      case 'resumed':
        this.log(`${kind === 'paused' ? 'pause' : 'reprise'} (jeu ${kind === 'paused' ? 'plus' : 'de nouveau'} au premier plan)`);
        this.update({ paused: kind === 'paused' });
        break;
      case 'stopped': {
        const stopLatency = this.stopRequestedAt ? now - this.stopRequestedAt : null;
        this.log(stopLatency !== null ? `arrêt effectif ${stopLatency} ms après l'appui` : 'arrêt (nombre de clics atteint)');
        this.stopRequestedAt = 0;
        this.update({ running: false, paused: false, ...(stopLatency !== null && { lastStopLatencyMs: stopLatency }) });
        break;
      }
    }
  }

  private reset(error: string | null): void {
    this.worker = null;
    this.ready = null;
    this.isReady = false;
    this.update({ running: false, paused: false, error });
  }

  /**
   * `requestedAt` : instant de l'appui (raccourci ou bouton), pour mesurer le
   * délai jusqu'au premier clic.
   *
   * Worker prêt : la commande part **de façon synchrone**, sans aucun await.
   * Appelé depuis un raccourci global, une suite d'await n'est exécutée par
   * Electron qu'au prochain réveil de sa boucle d'événements — mesuré de
   * 0,4 à 3,9 s, application au repos.
   */
  start(settings: AutoClickerSettings, requestedAt = Date.now()): Promise<void> {
    this.startRequestedAt = requestedAt;
    if (this.isReady) {
      this.sendStart(settings);
      return Promise.resolve();
    }
    // Pas encore prêt : le « ready » du worker (événement de flux) relance la suite.
    return this.warmUp().then(() => {
      this.log(`démarrage: worker préparé à la demande (${Date.now() - requestedAt} ms)`);
      this.sendStart(settings);
    });
  }

  private sendStart(settings: AutoClickerSettings): void {
    const point = settings.position ? this.options.toScreenPoint(settings.position) : null;
    this.run++;
    this.worker?.stdin.write(`${startCommand(this.run, settings, point)}\n`);
    this.update({ running: true, paused: false, error: null });
  }

  stop(requestedAt = Date.now()): void {
    if (!this.status.running) return;
    this.stopRequestedAt = requestedAt;
    this.worker?.stdin.write('stop\n');
    this.update({ running: false, paused: false });
  }

  /** Dossiers des jeux en cours : seuls leurs exécutables au premier plan reçoivent des clics. */
  setGameDirs(dirs: string[]): void {
    this.gameDirs = dirs;
    if (this.worker) this.worker.stdin.write(`${dirsCommand(dirs)}\n`);
  }

  /** Synchrone quand le worker est prêt (voir start). */
  toggle(settings: AutoClickerSettings, requestedAt = Date.now()): Promise<void> {
    if (this.status.running) {
      this.stop(requestedAt);
      return Promise.resolve();
    }
    return this.start(settings, requestedAt);
  }

  /** Arrêt du worker (quitter l'application, désactivation). */
  dispose(): void {
    const worker = this.worker;
    this.worker = null;
    this.ready = null;
    this.isReady = false;
    if (worker) {
      worker.stdin.end();
      setTimeout(() => worker.kill(), 1000).unref();
    }
    if (this.status.running) this.update({ running: false, paused: false });
  }
}
