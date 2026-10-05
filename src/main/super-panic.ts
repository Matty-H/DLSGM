import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { SuperPanicSettings } from '../shared/ipc-types';

/**
 * Super bouton panique : un raccourci global (distinct d'Alt+Espace) qui
 * réduit toutes les fenêtres visibles — jeu compris —, coupe le son, met
 * DLSGM en mode panique et ouvre la « fenêtre de travail » choisie (appli,
 * document ou adresse web). Un second appui restaure exactement les fenêtres
 * réduites (dans leur ordre d'empilement) et le son, s'il n'était pas déjà
 * coupé. Les fenêtres sont réduites, jamais cachées : si DLSGM plantait
 * entre-temps, elles resteraient dans la barre des tâches.
 *
 * Windows : worker PowerShell/C# préchauffé (EnumWindows, ShowWindowAsync,
 * IAudioEndpointVolume), piloté par stdin, comme l'auto-clicker — rien n'est
 * attendu entre le raccourci et la commande. macOS : AppleScript (« System
 * Events » : autorisation d'automatisation demandée au premier usage).
 */

export const DEFAULT_SUPER_PANIC: SuperPanicSettings = { enabled: false, hotkey: 'Ctrl+Shift+Space', target: '', mute: true };

/** Raccourcis que le super bouton ne peut pas prendre (panique simple, overlay). */
const FORBIDDEN_HOTKEYS = ['alt+space', 'shift+tab'];

export function sanitizeSuperPanicSettings(value: Partial<SuperPanicSettings> | undefined): SuperPanicSettings {
  const v = value ?? {};
  const hotkey = typeof v.hotkey === 'string' ? v.hotkey.trim().slice(0, 40) : '';
  return {
    enabled: v.enabled === true,
    hotkey: hotkey && !FORBIDDEN_HOTKEYS.includes(hotkey.toLowerCase()) ? hotkey : DEFAULT_SUPER_PANIC.hotkey,
    target: typeof v.target === 'string' ? v.target.trim().slice(0, 2000) : '',
    mute: v.mute !== false
  };
}

/** Fenêtre de travail : adresse web (ouverte dans le navigateur), chemin absolu (appli ou document), ou rien. */
export function superPanicTarget(target: string): { kind: 'url' | 'path'; value: string } | null {
  const value = target.trim();
  if (!value) return null;
  if (/^https?:\/\/\S+$/i.test(value)) return { kind: 'url', value };
  if (path.isAbsolute(value)) return { kind: 'path', value };
  return null;
}

export const SUPER_PANIC_WORKER_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class DlsgmMMDeviceEnumerator {}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface DlsgmIMMDeviceEnumerator {
  int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out DlsgmIMMDevice device);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface DlsgmIMMDevice {
  [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object endpoint);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface DlsgmIAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr notify);
  int UnregisterControlChangeNotify(IntPtr notify);
  int GetChannelCount(out uint count);
  int SetMasterVolumeLevel(float level, ref Guid context);
  int SetMasterVolumeLevelScalar(float level, ref Guid context);
  int GetMasterVolumeLevel(out float level);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
  int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
  int GetChannelVolumeLevel(uint channel, out float level);
  int GetChannelVolumeLevelScalar(uint channel, out float level);
  [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
  [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

public static class DlsgmPanic {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr hwnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hwnd, int cmd);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);

  const uint GW_OWNER = 4;
  const int GWL_EXSTYLE = -20;
  const int WS_EX_TOOLWINDOW = 0x80;
  const int WS_EX_NOACTIVATE = 0x08000000;
  const int DWMWA_CLOAKED = 14;
  const int SW_MINIMIZE = 6;
  const int SW_RESTORE = 9;
  static readonly string[] ShellClasses = { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd" };

  // Fenêtres réduites par le dernier « hide », dans l'ordre d'empilement (dessus d'abord).
  static readonly List<IntPtr> minimized = new List<IntPtr>();
  static bool unmuteOnRestore = false;

  /** Fenêtres d'application visibles, non réduites, hors processus exclus (DLSGM). */
  public static List<IntPtr> Candidates(uint[] exclude) {
    var found = new List<IntPtr>();
    EnumWindows((hwnd, lParam) => {
      if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
      if (GetWindow(hwnd, GW_OWNER) != IntPtr.Zero) return true;
      int ex = GetWindowLong(hwnd, GWL_EXSTYLE);
      if ((ex & WS_EX_TOOLWINDOW) != 0 || (ex & WS_EX_NOACTIVATE) != 0) return true;
      if (GetWindowTextLength(hwnd) == 0) return true;
      int cloaked;
      if (DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return true;
      var name = new StringBuilder(64);
      GetClassName(hwnd, name, name.Capacity);
      if (Array.IndexOf(ShellClasses, name.ToString()) >= 0) return true;
      uint pid;
      GetWindowThreadProcessId(hwnd, out pid);
      if (Array.IndexOf(exclude, pid) >= 0) return true;
      found.Add(hwnd);
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static int Hide(uint[] exclude, bool mute) {
    var found = Candidates(exclude);
    // Asynchrone : une fenêtre figée ne bloque pas les autres.
    foreach (var hwnd in found) ShowWindowAsync(hwnd, SW_MINIMIZE);
    foreach (var hwnd in found) if (!minimized.Contains(hwnd)) minimized.Add(hwnd);
    if (mute) {
      try {
        bool wasMuted = GetMute();
        if (!wasMuted) { SetMute(true); unmuteOnRestore = true; }
      } catch {}
    }
    return found.Count;
  }

  public static int Restore() {
    int restored = 0;
    // Du bas vers le haut : la fenêtre qui était devant revient devant.
    for (int i = minimized.Count - 1; i >= 0; i--) {
      IntPtr hwnd = minimized[i];
      if (IsWindow(hwnd) && IsIconic(hwnd)) { ShowWindowAsync(hwnd, SW_RESTORE); restored++; }
    }
    minimized.Clear();
    if (unmuteOnRestore) {
      unmuteOnRestore = false;
      try { SetMute(false); } catch {}
    }
    return restored;
  }

  static DlsgmIAudioEndpointVolume Endpoint() {
    var enumerator = (DlsgmIMMDeviceEnumerator)(new DlsgmMMDeviceEnumerator());
    DlsgmIMMDevice device;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    Guid iid = typeof(DlsgmIAudioEndpointVolume).GUID;
    object endpoint;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpoint));
    return (DlsgmIAudioEndpointVolume)endpoint;
  }

  public static bool GetMute() {
    bool muted;
    Marshal.ThrowExceptionForHR(Endpoint().GetMute(out muted));
    return muted;
  }

  public static void SetMute(bool mute) {
    Guid context = Guid.Empty;
    Marshal.ThrowExceptionForHR(Endpoint().SetMute(mute, ref context));
  }
}
'@
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $p = $line.Split(' ')
  try {
    if ($p[0] -eq 'hide') {
      $exclude = [uint32[]]@($p[2].Split(',') | Where-Object { $_ } | ForEach-Object { [uint32]$_ })
      $n = [DlsgmPanic]::Hide($exclude, $p[1] -eq '1')
      [Console]::Out.WriteLine('hidden ' + $n)
    } elseif ($p[0] -eq 'restore') {
      $n = [DlsgmPanic]::Restore()
      [Console]::Out.WriteLine('restored ' + $n)
    } elseif ($p[0] -eq 'count') {
      $exclude = [uint32[]]@($p[1].Split(',') | Where-Object { $_ } | ForEach-Object { [uint32]$_ })
      [Console]::Out.WriteLine('count ' + [DlsgmPanic]::Candidates($exclude).Count)
    } elseif ($p[0] -eq 'mute?') {
      [Console]::Out.WriteLine('mute ' + [DlsgmPanic]::GetMute())
    }
  } catch {
    [Console]::Out.WriteLine('err ' + $_.Exception.Message.Replace([char]10, ' '))
  }
  [Console]::Out.Flush()
}
`;

/** Ligne de commande « hide » du worker : `hide <mute 0|1> <pids exclus séparés par des virgules>`. */
export function hideCommand(mute: boolean, excludePids: number[]): string {
  const pids = excludePids.filter(pid => Number.isInteger(pid) && pid > 0);
  return `hide ${mute ? 1 : 0} ${pids.join(',') || '0'}`;
}

// AppleScript (macOS) : applications visibles cachées, sauf le Finder et DLSGM (caché à part).
const MAC_HIDE_SCRIPT = `tell application "System Events"
  set hiddenApps to {}
  repeat with p in (every process whose visible is true and background only is false)
    set appName to name of p
    if appName is not "Finder" and unix id of p is not __PID__ then
      set visible of p to false
      set end of hiddenApps to appName
    end if
  end repeat
end tell
set AppleScript's text item delimiters to linefeed
return hiddenApps as text`;

export interface SuperPanicHooks {
  /** Met DLSGM en mode panique (outils en jeu coupés, page anodine) ou l'en sort. */
  setPanic: (active: boolean) => void;
  /** Réduit / restaure les fenêtres de DLSGM. */
  hideApp: () => void;
  showApp: () => void;
  /** Ouvre la fenêtre de travail (navigateur ou application par défaut). */
  openTarget: (target: { kind: 'url' | 'path'; value: string }) => void;
}

export class SuperPanic {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private isReady = false;
  private config: SuperPanicSettings = DEFAULT_SUPER_PANIC;
  private macHidden: string[] = [];
  private macUnmute = false;
  active = false;

  constructor(private readonly scriptDir: string, private readonly hooks: SuperPanicHooks) {}

  configure(config: SuperPanicSettings): void {
    this.config = config;
    if (config.enabled) this.warmUp();
    else if (!this.active) this.dispose();
  }

  warmUp(): void {
    if (process.platform !== 'win32' || this.worker) return;
    const scriptPath = path.join(this.scriptDir, 'super-panic.ps1');
    fs.writeFileSync(scriptPath, SUPER_PANIC_WORKER_SCRIPT, 'utf8');
    const worker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true });
    this.worker = worker;
    let buffer = '';
    worker.stdout.setEncoding('utf8');
    worker.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line === 'ready' && this.worker === worker) this.isReady = true;
        else if (line.startsWith('err')) console.error('Super panique :', line);
      }
    });
    worker.stderr.on('data', (chunk: Buffer) => console.error('Super panique :', chunk.toString().trim()));
    worker.on('error', error => console.error('Super panique :', error));
    worker.on('exit', () => {
      if (this.worker !== worker) return;
      this.worker = null;
      this.isReady = false;
    });
  }

  /**
   * Raccourci global : tout part de façon synchrone (commande écrite au
   * worker dans l'appel, voir AutoClicker.start) — jamais d'await ici.
   */
  toggle(): void {
    if (this.active) this.restore();
    else this.engage();
  }

  private send(command: string): void {
    if (this.worker && this.isReady) {
      this.worker.stdin.write(`${command}\n`);
      return;
    }
    // Worker pas prêt (premier appui juste après l'activation) : il reçoit la
    // commande dès son démarrage (stdin mis en tampon par Node).
    this.warmUp();
    this.worker?.stdin.write(`${command}\n`);
  }

  private engage(): void {
    this.active = true;
    this.hooks.setPanic(true);
    if (process.platform === 'win32') {
      this.send(hideCommand(this.config.mute, [process.pid]));
    } else if (process.platform === 'darwin') {
      this.macHide();
    }
    this.hooks.hideApp();
    const target = superPanicTarget(this.config.target);
    if (target) this.hooks.openTarget(target);
  }

  private restore(): void {
    this.active = false;
    // DLSGM d'abord : les fenêtres restaurées ensuite (le jeu) repassent devant lui.
    this.hooks.showApp();
    if (process.platform === 'win32') this.send('restore');
    else if (process.platform === 'darwin') this.macRestore();
    this.hooks.setPanic(false);
  }

  private macHide(): void {
    execFile('osascript', ['-e', MAC_HIDE_SCRIPT.replace('__PID__', String(process.pid))], (error, stdout) => {
      if (error) console.error('Super panique (macOS) :', error.message);
      else this.macHidden = stdout.split('\n').map(name => name.trim()).filter(Boolean);
    });
    if (this.config.mute) {
      execFile('osascript', ['-e', 'output muted of (get volume settings)'], (error, stdout) => {
        if (error || stdout.trim() === 'true') return;
        this.macUnmute = true;
        execFile('osascript', ['-e', 'set volume with output muted'], () => undefined);
      });
    }
  }

  private macRestore(): void {
    const names = this.macHidden;
    this.macHidden = [];
    if (names.length > 0) {
      const list = names.map(name => `"${name.replace(/["\\]/g, '')}"`).join(', ');
      const script = `tell application "System Events"\n  repeat with appName in {${list}}\n    try\n      set visible of process appName to true\n    end try\n  end repeat\nend tell`;
      execFile('osascript', ['-e', script], error => error && console.error('Super panique (macOS) :', error.message));
    }
    if (this.macUnmute) {
      this.macUnmute = false;
      execFile('osascript', ['-e', 'set volume without output muted'], () => undefined);
    }
  }

  dispose(): void {
    const worker = this.worker;
    this.worker = null;
    this.isReady = false;
    if (worker) {
      worker.stdin.end();
      setTimeout(() => worker.kill(), 1000).unref();
    }
  }
}
