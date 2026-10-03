# Contributing to DLSGM

Technical information to develop, test and release DLSGM. The user guide is in the [README](README.md).

## Requirements

- Node.js 20 or later (CI uses Node 26)
- npm

## Commands

```bash
npm install            # dependencies (also enables the pre-commit hook)
npm run dev            # development mode with hot reload
npm start              # full build, then launch Electron
npm test               # unit tests (Vitest)
npm run typecheck      # type checking
npm run check          # typecheck + tests (pre-commit hook and CI)
npm run build          # build and package with electron-builder
```

Tests run under Node without launching Electron. Every behavior change should come with a test in `tests/`.

## Architecture

A three-process Electron app with a strict security boundary (`contextIsolation`, `sandbox`, no `nodeIntegration`).

| Folder | Role |
|---|---|
| `src/main/` | Main process: windows, IPC, disk and network access, DLsite fetching, in-game tools |
| `src/preload/` | The only bridge between the UI and the main process (`window.electronAPI`) |
| `src/shared/` | Shared IPC type contract, no runtime code |
| `src/renderer/` | React + TypeScript + Tailwind CSS UI, built with Vite (see [its README](src/renderer/README.md)) |
| `tests/` | Vitest unit tests |

Storage uses NeDB (one document per game or per setting). DLsite requests go through Chromium's network stack (`net.fetch`) so that the configured proxy is honored. The invariants to preserve are described in [CLAUDE.md](CLAUDE.md).

## Translations

The interface is available in French, English and Japanese. The French text is the translation key:

- **UI:** `t('Paramètres')` (`src/renderer/src/lib/i18n.ts`), with the English and Japanese versions in `src/renderer/src/lib/i18n/messages/*.ts`. Parameters use braces: `t('{n} œuvres', { n })`.
- **Main process** (dialogs, notification area menu, error messages shown in the UI): `tm('…')` (`src/main/i18n.ts`), translations in `src/main/messages.ts`.
- **Module-level labels** (evaluated before the language is known): declare them with `msg('…')` and display them with `tr(label)`.
- **Sentences containing elements** (a key, a link): `<Trans text={t('… {hotkey} …')} values={{ hotkey: <kbd>…</kbd> }} />`.

`tests/renderer/i18n.test.ts` fails if a key is missing its English or Japanese translation, if a translation is never used, or if the `{parameters}` differ between languages.

## Releasing a version

The GitHub Actions CI (`.github/workflows/build.yml`) runs the tests, then builds Windows and macOS on every push to `main`. A `v*` tag also publishes a GitHub release with the installers, the auto-update files and the description from `.github/release-notes.md`.

```bash
# 1. Update "version" in package.json, then commit
git tag vX.Y.Z           # must match the package.json version exactly
git push origin main vX.Y.Z
```

Deleting a release does not delete its tag: delete the tag too (`git push origin --delete vX.Y.Z`), otherwise the auto-updater still sees it.

## Data and privacy

- Data (cache, images, settings, backups) stays in Electron's user data folder.
- Automatic network requests: DLsite (metadata and images) and GitHub (updates).
- Translation through DeepL or Google: only the recognized text (never the image) is sent; the offline dictionary and the local model send nothing.
- Proxy passwords and API keys are encrypted with `safeStorage` (DPAPI on Windows).
- Local network sharing uses unencrypted HTTP.
