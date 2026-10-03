import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DPI_AWARE_CS, FOREGROUND_GUARD_CS, dirsCommand } from './auto-clicker';
import type { GameMacro, MacroRecorderSettings, MacroRecorderStatus, MacroStep } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Enregistreur de macros (Windows), dans la lignée de l'auto-clicker :
 * enregistre les clics et les touches faits dans le jeu, avec leurs délais,
 * puis les rejoue (une fois ou en boucle) par raccourci.
 *
 * Mêmes règles que l'auto-clicker : worker PowerShell (Add-Type C#) piloté
 * par stdin, opt-in par jeu, rien d'enregistré ni d'envoyé tant que le jeu
 * n'est pas au premier plan (la lecture se met en pause et relâche ce
 * qu'elle tenait), arrêt par Alt+Espace, aucune attente asynchrone entre
 * un raccourci global et la commande envoyée au worker.
 *
 * - Enregistrement : hooks bas niveau clavier et souris (WH_KEYBOARD_LL /
 *   WH_MOUSE_LL) dans un thread à boucle de messages. Les événements injectés
 *   (auto-clicker, lecture d'une macro) sont ignorés, ainsi que les touches
 *   des raccourcis de DLSGM. Les positions de la souris sont relatives à la
 *   zone client de la fenêtre au premier plan (le jeu) : la macro marche
 *   encore si la fenêtre a bougé. Les déplacements ne sont gardés que bouton
 *   enfoncé (glisser), au plus un toutes les 15 ms.
 * - Lecture : un thread rejoue les étapes à leur instant (minuterie 1 ms),
 *   avec keybd_event (code de balayage compris, pour les jeux DirectInput)
 *   et mouse_event / SetCursorPos.
 */

export const DEFAULT_MACRO_RECORDER: MacroRecorderSettings = { enabled: false, recordHotkey: 'F8', playHotkey: 'F9' };

/** Étapes gardées au plus par macro, et macros par jeu. */
export const MAX_MACRO_STEPS = 5000;
export const MAX_MACROS_PER_GAME = 30;
/** Durée maximale d'une macro (1 h). */
const MAX_MACRO_MS = 3600_000;

export function sanitizeMacroSettings(value: Partial<MacroRecorderSettings> | undefined): MacroRecorderSettings {
  const v = value ?? {};
  const key = (k: unknown, fallback: string) => (typeof k === 'string' && k.trim() ? k.trim() : fallback);
  return {
    enabled: Boolean(v.enabled),
    recordHotkey: key(v.recordHotkey, DEFAULT_MACRO_RECORDER.recordHotkey),
    playHotkey: key(v.playHotkey, DEFAULT_MACRO_RECORDER.playHotkey)
  };
}

const isInt = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/** Étape valide : [t, type 0-4, code, a, b] (voir MacroStep). */
function isStep(step: unknown): step is MacroStep {
  if (!Array.isArray(step) || step.length !== 5) return false;
  const [t, kind, code, a, b] = step;
  if (!isInt(t, 0, MAX_MACRO_MS) || !isInt(kind, 0, 4)) return false;
  if (kind <= 1) return isInt(code, 1, 255) && isInt(a, 0, 0xffff) && isInt(b, 0, 1);
  return isInt(code, 0, 2) && isInt(a, -100_000, 100_000) && isInt(b, -100_000, 100_000);
}

/** Macros venues du renderer ou de la base, ramenées à des valeurs sûres. */
export function sanitizeMacros(raw: unknown): GameMacro[] {
  if (!Array.isArray(raw)) return [];
  const out: GameMacro[] = [];
  for (const m of raw.slice(0, MAX_MACROS_PER_GAME)) {
    if (!m || typeof m !== 'object') continue;
    const macro = m as Partial<GameMacro>;
    if (typeof macro.id !== 'string' || !/^[\w-]{1,64}$/.test(macro.id)) continue;
    const steps = Array.isArray(macro.steps) ? macro.steps.filter(isStep).slice(0, MAX_MACRO_STEPS) : [];
    steps.sort((x, y) => x[0] - y[0]);
    const last = steps.length > 0 ? steps[steps.length - 1][0] : 0;
    out.push({
      id: macro.id,
      name: typeof macro.name === 'string' && macro.name.trim() ? macro.name.trim().slice(0, 80) : 'Macro',
      createdAt: typeof macro.createdAt === 'string' ? macro.createdAt : new Date(0).toISOString(),
      loop: Boolean(macro.loop),
      durationMs: isInt(macro.durationMs, last, MAX_MACRO_MS) ? macro.durationMs : last,
      steps
    });
  }
  return out;
}

/**
 * Touches d'un raccourci (ex: `Ctrl+F8`) en codes virtuels : ignorées à
 * l'enregistrement (sinon la macro rejouerait le raccourci qui l'arrête).
 */
export function acceleratorVks(accelerator: string): number[] {
  const vks: number[] = [];
  for (const part of accelerator.split('+').map(p => p.trim().toLowerCase())) {
    const fn = /^f(\d{1,2})$/.exec(part);
    if (fn && Number(fn[1]) >= 1 && Number(fn[1]) <= 24) vks.push(0x6f + Number(fn[1]));
    else if (/^[a-z0-9]$/.test(part)) vks.push(part.toUpperCase().charCodeAt(0));
    else if (part === 'ctrl' || part === 'control' || part === 'commandorcontrol' || part === 'cmdorctrl') vks.push(0x11, 0xa2, 0xa3);
    else if (part === 'shift') vks.push(0x10, 0xa0, 0xa1);
    else if (part === 'alt' || part === 'option') vks.push(0x12, 0xa4, 0xa5);
    else if (part === 'pause') vks.push(0x13);
    else if (part === 'scrolllock') vks.push(0x91);
    else if (part === 'space') vks.push(0x20);
  }
  return [...new Set(vks)];
}

/**
 * Enregistrement brut → étapes : temps ramenés au premier événement, durée
 * jusqu'à l'arrêt (le temps d'attente avant de reboucler), et un relâchement
 * ajouté à la fin pour tout ce qui était encore enfoncé (une macro ne doit
 * jamais laisser une touche tenue).
 */
export function finishRecording(raw: MacroStep[], stoppedAt: number): { steps: MacroStep[]; durationMs: number } {
  const events = raw.filter(isStep).slice(0, MAX_MACRO_STEPS - 16);
  if (events.length === 0) return { steps: [], durationMs: 0 };
  const start = events[0][0];
  const steps: MacroStep[] = events.map(([t, ...rest]) => [t - start, ...rest] as MacroStep);
  const last = steps[steps.length - 1][0];
  const keys = new Map<number, MacroStep>();
  const buttons = new Map<number, MacroStep>();
  for (const step of steps) {
    const [, kind, code] = step;
    if (kind === 0) keys.set(code, step);
    else if (kind === 1) keys.delete(code);
    else if (kind === 2) buttons.set(code, step);
    else if (kind === 3) buttons.delete(code);
  }
  for (const [code, [, , , scan, ext]] of keys) steps.push([last, 1, code, scan, ext]);
  for (const [code, [, , , x, y]] of buttons) steps.push([last, 3, code, x, y]);
  return { steps, durationMs: Math.max(last, Math.min(MAX_MACRO_MS, stoppedAt - start)) };
}

/** `play <run> <boucle 0|1> <durée> <t,type,code,a,b,...>` */
export function playCommand(run: number, macro: GameMacro): string {
  return ['play', run, macro.loop ? 1 : 0, macro.durationMs, macro.steps.flat().join(',') || '-'].join(' ');
}

/** `record <run> <codes ignorés,...> <injectés acceptés 0|1>` */
export function recordCommand(run: number, ignoreVks: number[], acceptInjected = false): string {
  return ['record', run, ignoreVks.join(',') || '-', acceptInjected ? 1 : 0].join(' ');
}

export const MACRO_WORKER_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
${FOREGROUND_GUARD_CS}
${DPI_AWARE_CS}
public static class DlsgmMacro {
  delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr window, uint min, uint max);
  [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref POINT point);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("winmm.dll")] static extern uint timeBeginPeriod(uint period);
  [DllImport("winmm.dll")] static extern uint timeEndPeriod(uint period);

  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public POINT pt; }
  [StructLayout(LayoutKind.Sequential)] struct KBD { public uint vk; public uint scan; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSE { public POINT pt; public uint data; public uint flags; public uint time; public IntPtr extra; }

  static readonly uint[] DOWN = { 0x0002, 0x0008, 0x0020 };
  static readonly uint[] UP = { 0x0004, 0x0010, 0x0040 };
  static readonly object outLock = new object();

  static void Emit(string line) {
    lock (outLock) { Console.Out.WriteLine(line); Console.Out.Flush(); }
  }

  // Jeu au premier plan, relu toutes les 30 ms (pas dans les hooks : ils doivent répondre vite).
  static volatile bool inGame;
  public static void Watch() {
    Thread t = new Thread(() => { while (true) { inGame = DlsgmForeground.IsGame(); Thread.Sleep(30); } });
    t.IsBackground = true;
    t.Start();
  }

  static bool Origin(out int x, out int y) {
    POINT p = new POINT();
    IntPtr w = GetForegroundWindow();
    bool ok = w != IntPtr.Zero && ClientToScreen(w, ref p);
    x = p.X; y = p.Y;
    return ok;
  }

  // --- Enregistrement -------------------------------------------------------
  static HookProc keyProc = KeyHook;
  static HookProc mouseProc = MouseHook;
  static Thread hookThread;
  static uint hookThreadId;
  static readonly ManualResetEvent hooksReady = new ManualResetEvent(false);
  static volatile bool recording;
  static bool acceptInjected;
  static int recRun;
  static int[] ignored = new int[0];
  static readonly bool[] keyDown = new bool[256];
  static int buttonsDown;
  static long lastMove;
  static Stopwatch clock = new Stopwatch();

  public static void Record(int run, int[] ignore, bool injected) {
    StopAll();
    recRun = run; ignored = ignore; acceptInjected = injected;
    Array.Clear(keyDown, 0, keyDown.Length);
    buttonsDown = 0; lastMove = -1000;
    hooksReady.Reset();
    clock = Stopwatch.StartNew();
    recording = true;
    hookThread = new Thread(() => {
      hookThreadId = GetCurrentThreadId();
      IntPtr module = GetModuleHandle(null);
      IntPtr kh = SetWindowsHookEx(13, keyProc, module, 0);
      IntPtr mh = SetWindowsHookEx(14, mouseProc, module, 0);
      hooksReady.Set();
      Emit((kh == IntPtr.Zero || mh == IntPtr.Zero ? "hookfailed " : "recording ") + run);
      MSG msg;
      while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) { }
      if (kh != IntPtr.Zero) UnhookWindowsHookEx(kh);
      if (mh != IntPtr.Zero) UnhookWindowsHookEx(mh);
    });
    hookThread.IsBackground = true;
    hookThread.Start();
  }

  static void StopRecord() {
    if (hookThread == null) return;
    recording = false;
    hooksReady.WaitOne(3000);
    PostThreadMessage(hookThreadId, 0x0012, IntPtr.Zero, IntPtr.Zero); // WM_QUIT
    hookThread.Join(3000);
    hookThread = null;
    Emit("recorded " + recRun + " " + clock.ElapsedMilliseconds);
  }

  static IntPtr KeyHook(int code, IntPtr wParam, IntPtr lParam) {
    if (code >= 0 && recording) {
      KBD k = (KBD)Marshal.PtrToStructure(lParam, typeof(KBD));
      int msg = (int)wParam;
      int vk = (int)k.vk;
      if (vk > 0 && vk < 256 && ((k.flags & 0x10) == 0 || acceptInjected) && Array.IndexOf(ignored, vk) < 0) {
        bool down = msg == 0x100 || msg == 0x104;
        int ext = (int)(k.flags & 1);
        if (down) {
          // Répétition automatique d'une touche tenue : un seul appui.
          if (!keyDown[vk] && inGame) {
            keyDown[vk] = true;
            Emit("ev " + recRun + " " + clock.ElapsedMilliseconds + " 0 " + vk + " " + k.scan + " " + ext);
          }
        } else if (keyDown[vk]) {
          keyDown[vk] = false;
          Emit("ev " + recRun + " " + clock.ElapsedMilliseconds + " 1 " + vk + " " + k.scan + " " + ext);
        }
      }
    }
    return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
  }

  static IntPtr MouseHook(int code, IntPtr wParam, IntPtr lParam) {
    if (code >= 0 && recording) {
      MOUSE m = (MOUSE)Marshal.PtrToStructure(lParam, typeof(MOUSE));
      if ((m.flags & 0x1) == 0 || acceptInjected) {
        int msg = (int)wParam;
        int button = -1; bool down = false;
        switch (msg) {
          case 0x201: button = 0; down = true; break;
          case 0x202: button = 0; break;
          case 0x204: button = 1; down = true; break;
          case 0x205: button = 1; break;
          case 0x207: button = 2; down = true; break;
          case 0x208: button = 2; break;
        }
        int ox, oy;
        Origin(out ox, out oy);
        int x = m.pt.X - ox, y = m.pt.Y - oy;
        long t = clock.ElapsedMilliseconds;
        if (button >= 0) {
          int bit = 1 << button;
          if (down) {
            if (inGame) {
              buttonsDown |= bit;
              Emit("ev " + recRun + " " + t + " 2 " + button + " " + x + " " + y);
            }
          } else if ((buttonsDown & bit) != 0) {
            buttonsDown &= ~bit;
            Emit("ev " + recRun + " " + t + " 3 " + button + " " + x + " " + y);
          }
        } else if (msg == 0x200 && buttonsDown != 0 && t - lastMove >= 15) {
          lastMove = t;
          Emit("ev " + recRun + " " + t + " 4 0 " + x + " " + y);
        }
      }
    }
    return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
  }

  // --- Lecture ---------------------------------------------------------------
  static Thread player;
  static readonly ManualResetEvent stopSignal = new ManualResetEvent(false);
  static readonly int[] heldScan = new int[256];
  static readonly bool[] held = new bool[256];
  static int heldButtons;

  static void Send(int[] s, int i) {
    int kind = s[i + 1], c = s[i + 2], a = s[i + 3], b = s[i + 4];
    if (kind <= 1) {
      keybd_event((byte)c, (byte)a, (uint)(b == 1 ? 1 : 0) | (uint)(kind == 1 ? 2 : 0), UIntPtr.Zero);
      held[c] = kind == 0; heldScan[c] = a | (b << 16);
      return;
    }
    int ox, oy;
    Origin(out ox, out oy);
    SetCursorPos(ox + a, oy + b);
    if (kind == 2) { mouse_event(DOWN[c], 0, 0, 0, UIntPtr.Zero); heldButtons |= 1 << c; }
    else if (kind == 3) { mouse_event(UP[c], 0, 0, 0, UIntPtr.Zero); heldButtons &= ~(1 << c); }
  }

  static void ReleaseAll() {
    for (int vk = 0; vk < 256; vk++) {
      if (!held[vk]) continue;
      held[vk] = false;
      keybd_event((byte)vk, (byte)(heldScan[vk] & 0xffff), (uint)((heldScan[vk] >> 16) == 1 ? 1 : 0) | 2, UIntPtr.Zero);
    }
    for (int c = 0; c < 3; c++) if ((heldButtons & (1 << c)) != 0) mouse_event(UP[c], 0, 0, 0, UIntPtr.Zero);
    heldButtons = 0;
  }

  // Attend l'instant 'target' (ms de la boucle en cours), en pause tant que le jeu n'est pas au premier plan.
  // Rend false si la lecture est arrêtée.
  static bool WaitUntil(Stopwatch sw, ref long pausedMs, long target, int run, ref bool paused) {
    while (true) {
      if (!inGame) {
        if (!paused) { paused = true; ReleaseAll(); Emit("paused " + run); }
        long since = sw.ElapsedMilliseconds;
        if (stopSignal.WaitOne(50)) return false;
        pausedMs += sw.ElapsedMilliseconds - since;
        continue;
      }
      if (paused) { paused = false; Emit("resumed " + run); }
      long wait = target - (sw.ElapsedMilliseconds - pausedMs);
      if (wait <= 0) return true;
      if (stopSignal.WaitOne((int)Math.Min(wait, 30))) return false;
    }
  }

  public static void Play(int run, bool loop, int duration, int[] steps) {
    StopAll();
    stopSignal.Reset();
    player = new Thread(() => {
      timeBeginPeriod(1);
      Emit("playing " + run);
      bool paused = false;
      int loops = 0;
      try {
        do {
          Stopwatch sw = Stopwatch.StartNew();
          long pausedMs = 0;
          for (int i = 0; i + 4 < steps.Length; i += 5) {
            if (!WaitUntil(sw, ref pausedMs, steps[i], run, ref paused)) return;
            Send(steps, i);
          }
          if (!WaitUntil(sw, ref pausedMs, Math.Max(duration, 1), run, ref paused)) return;
          loops++;
          Emit("loop " + run + " " + loops);
        } while (loop && steps.Length > 0);
      } finally {
        ReleaseAll();
        timeEndPeriod(1);
        Emit("stopped " + run);
      }
    });
    player.IsBackground = true;
    player.Priority = ThreadPriority.AboveNormal;
    player.Start();
  }

  public static void StopAll() {
    StopRecord();
    stopSignal.Set();
    if (player != null) { player.Join(3000); player = null; }
  }
}
'@
[DlsgmDpi]::Enable()
[DlsgmMacro]::Watch()
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
function Ints($text) {
  if ($text -eq '-' -or [string]::IsNullOrEmpty($text)) { return [int[]]@() }
  return [int[]]($text.Split(',') | ForEach-Object { [int]$_ })
}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { [DlsgmMacro]::StopAll(); break }
  $p = $line.Split(' ')
  if ($p[0] -eq 'record') {
    [DlsgmMacro]::Record([int]$p[1], (Ints $p[2]), $p[3] -eq '1')
  } elseif ($p[0] -eq 'play') {
    [DlsgmMacro]::Play([int]$p[1], $p[2] -eq '1', [int]$p[3], (Ints $p[4]))
  } elseif ($p[0] -eq 'stop') {
    [DlsgmMacro]::StopAll()
  } elseif ($p[0] -eq 'dirs') {
    $text = ''
    if ($p.Length -gt 1) { $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[1])) }
    [DlsgmForeground]::SetDirs([string[]]@($text.Split([char]10) | Where-Object { $_ -ne '' }))
  }
}
`;

export interface MacroRecorderOptions {
  /** Dossier où écrire le script du worker (userData). */
  scriptDir: string;
  onStatus: (status: MacroRecorderStatus) => void;
  /** Fin d'un enregistrement non vide : étapes prêtes à être rangées dans les macros du jeu. */
  onRecorded: (steps: MacroStep[], durationMs: number) => void;
}

export class MacroRecorder {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private isReady = false;
  private run = 0;
  private recorded: MacroStep[] = [];
  // Enregistrement interrompu par Alt+Espace : jeté (il finirait par Alt+Espace).
  private discard = false;
  private status: MacroRecorderStatus = {
    available: process.platform === 'win32',
    recording: false,
    playing: false,
    paused: false,
    inGame: false,
    hotkeysActive: false,
    stepCount: 0,
    loops: 0,
    playingMacroId: null,
    error: null
  };

  constructor(private readonly options: MacroRecorderOptions) {}

  getStatus(): MacroRecorderStatus {
    return { ...this.status };
  }

  private update(patch: Partial<MacroRecorderStatus>): void {
    this.status = { ...this.status, ...patch };
    this.options.onStatus(this.getStatus());
  }

  setInGame(inGame: boolean): void {
    if (this.status.inGame !== inGame) this.update({ inGame });
  }

  setHotkeysActive(active: boolean): void {
    if (this.status.hotkeysActive !== active) this.update({ hotkeysActive: active });
  }

  warmUp(): Promise<void> {
    if (!this.status.available) return Promise.reject(new Error(tm("L'enregistreur de macros n'est disponible que sous Windows.")));
    if (this.ready) return this.ready;
    const scriptPath = path.join(this.options.scriptDir, 'macro-recorder.ps1');
    fs.writeFileSync(scriptPath, MACRO_WORKER_SCRIPT, 'utf8');
    const worker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true });
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
            if (this.worker === worker) this.isReady = true;
            resolve();
            continue;
          }
          this.onWorkerLine(line);
        }
      });
      worker.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      worker.on('error', error => {
        reject(error);
        if (this.worker === worker) this.reset(tm('Enregistreur de macros indisponible : {error}', { error: error.message }));
      });
      worker.on('exit', code => {
        const message = stderr.trim() || tm("le worker s'est arrêté (code {code})", { code: String(code) });
        reject(new Error(message));
        if (this.worker === worker) this.reset(tm('Enregistreur de macros arrêté : {error}', { error: message }));
      });
    });
    return this.ready;
  }

  /** Ligne reçue du worker. */
  private onWorkerLine(line: string): void {
    const parts = line.split(' ');
    const run = Number(parts[1]);
    // Un ancien tour (enregistrement ou lecture remplacé) ne touche pas au nouveau.
    if (run !== this.run) return;
    switch (parts[0]) {
      case 'recording':
        this.update({ recording: true, error: null });
        break;
      case 'hookfailed':
        this.update({ recording: false, error: tm("Windows a refusé l'enregistrement (hooks clavier / souris).") });
        break;
      case 'ev': {
        const step = parts.slice(2, 7).map(Number) as MacroStep;
        if (this.recorded.length < MAX_MACRO_STEPS) this.recorded.push(step);
        if (this.recorded.length % 5 === 1 || this.recorded.length < 5) this.update({ stepCount: this.recorded.length });
        break;
      }
      case 'recorded': {
        const { steps, durationMs } = finishRecording(this.recorded, Number(parts[2]));
        this.recorded = [];
        const discarded = this.discard;
        this.discard = false;
        this.update({ recording: false, stepCount: discarded ? 0 : steps.length });
        if (steps.length > 0 && !discarded) this.options.onRecorded(steps, durationMs);
        break;
      }
      case 'playing':
        this.update({ playing: true, paused: false, loops: 0, error: null });
        break;
      case 'paused':
      case 'resumed':
        this.update({ paused: parts[0] === 'paused' });
        break;
      case 'loop':
        this.update({ loops: Number(parts[2]) });
        break;
      case 'stopped':
        this.update({ playing: false, paused: false, playingMacroId: null });
        break;
    }
  }

  /** Pour les tests : comme une ligne reçue du worker. */
  handleLine(line: string): void {
    this.onWorkerLine(line);
  }

  private reset(error: string | null): void {
    this.worker = null;
    this.ready = null;
    this.isReady = false;
    this.update({ recording: false, playing: false, paused: false, playingMacroId: null, error });
  }

  private send(command: string): void {
    this.worker?.stdin.write(`${command}\n`);
  }

  /**
   * Démarre / arrête l'enregistrement. Synchrone quand le worker est prêt
   * (appelé depuis un raccourci global : voir AutoClicker.start).
   */
  toggleRecord(ignoreVks: number[], acceptInjected = false): Promise<void> {
    if (this.status.recording) {
      this.send('stop');
      // L'état final arrive avec « recorded » (étapes) ; affiché arrêté tout de suite.
      this.update({ recording: false });
      return Promise.resolve();
    }
    const go = () => {
      this.run++;
      this.recorded = [];
      this.discard = false;
      this.send(recordCommand(this.run, ignoreVks, acceptInjected));
      this.update({ recording: true, playing: false, paused: false, stepCount: 0, playingMacroId: null, error: null });
    };
    if (this.isReady) {
      go();
      return Promise.resolve();
    }
    return this.warmUp().then(go);
  }

  /** Lance / arrête la lecture de `macro`. Synchrone quand le worker est prêt. */
  togglePlay(macro: GameMacro | null): Promise<void> {
    if (this.status.playing || this.status.recording) {
      this.stop();
      return Promise.resolve();
    }
    if (!macro || macro.steps.length === 0) {
      this.update({ error: tm('Aucune macro à rejouer pour ce jeu : enregistre-en une d’abord.') });
      return Promise.resolve();
    }
    const go = () => {
      this.run++;
      this.send(playCommand(this.run, macro));
      this.update({ playing: true, paused: false, loops: 0, playingMacroId: macro.id, error: null });
    };
    if (this.isReady) {
      go();
      return Promise.resolve();
    }
    return this.warmUp().then(go);
  }

  /** Arrête enregistrement et lecture (Alt+Espace, fin du jeu) ; `discard` jette l'enregistrement en cours. */
  stop(discard = false): void {
    if (!this.status.recording && !this.status.playing) return;
    if (this.status.recording && discard) this.discard = true;
    this.send('stop');
    this.update({ recording: false, playing: false, paused: false, playingMacroId: null });
  }

  setGameDirs(dirs: string[]): void {
    if (this.worker) this.send(dirsCommand(dirs));
  }

  dispose(): void {
    const worker = this.worker;
    this.worker = null;
    this.ready = null;
    this.isReady = false;
    if (worker) {
      worker.stdin.end();
      setTimeout(() => worker.kill(), 1000).unref();
    }
    if (this.status.recording || this.status.playing) this.update({ recording: false, playing: false, paused: false, playingMacroId: null });
  }
}
