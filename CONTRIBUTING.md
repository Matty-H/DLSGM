# Contributing to DLSGM

Technical information to develop, test and release DLSGM. The user guide is in the [README](README.md).

## How to contribute: prompt requests

DLSGM works with **prompt requests**, not pull requests: code contributions are not merged as such. The most useful contribution is to **point out a problem or suggest an improvement** — a bug with the steps to reproduce it, a missing feature, a behavior that could be better.

Open a [pull request](https://github.com/Matty-H/DLSGM/pulls) or an [issue](https://github.com/Matty-H/DLSGM/issues) that describes:

- **What happens**, and what you expected instead (or what you would like to have).
- **How to reproduce it**: steps, game ID if relevant, screenshots or logs.
- **Why it matters** to you, if it is not obvious.

You are welcome to include code in your pull request — a fix, a prototype, a sketch of an approach. It is read as part of the description, to understand the problem and the idea, and may inspire the change that ends up in DLSGM; it is not merged directly.

**Translations are the exception:** a language file is merged as is. See [TRANSLATING.md](TRANSLATING.md) — no programming needed.

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

Tests run under Node without launching Electron. Every behavior change should come with a test in `tests/`, and the question "does this deserve a test?" should be asked for every change, fixes and refactors included.

### Upgrades from older versions

Users can jump from an old version straight to the latest one, skipping everything in between. The current code must therefore keep converting whatever an older version left behind (settings, cache, stores, folders, backup manifests):

- All of it lives in `src/main/migrations/`, one file per migration, run at startup before anything reads the data. Features only know the current format, so refactoring or deleting a feature never means carrying its old formats along.
- Old features and modules can be removed; **migrations cannot**, as long as a released version can still produce the data they convert. When you remove code that reads an old format, move that conversion into a new migration first.
- A migration is idempotent (it runs on every startup and detects whether anything is left to do), converts an old format straight to the current one, and never deletes the original data before it has succeeded.
- Each migration has a test in `tests/main/migrations/` that starts from data shaped like an older version's, and its legacy data is added to the end-to-end test (a whole old data folder, migrated, then read by the current code).

## Architecture

A three-process Electron app with a strict security boundary (`contextIsolation`, `sandbox`, no `nodeIntegration`).

| Folder | Role |
|---|---|
| `src/main/` | Main process: windows, IPC, disk and network access, DLsite fetching, in-game tools |
| `src/preload/` | The only bridge between the UI and the main process (`window.electronAPI`) |
| `src/shared/` | Shared IPC type contract, plus the pure language-file logic (`locales.ts`) used by both processes |
| `locales/` | Translations, one JSON file per language (see [TRANSLATING.md](TRANSLATING.md)) |
| `scripts/` | Translation key extraction and the `i18n:template` script |
| `src/renderer/` | React + TypeScript + Tailwind CSS UI, built with Vite (see [its README](src/renderer/README.md)) |
| `tests/` | Vitest unit tests |

Storage uses NeDB (one document per game or per setting). DLsite requests go through Chromium's network stack (`net.fetch`) so that the configured proxy is honored. The invariants to preserve are described in [CLAUDE.md](CLAUDE.md).

## Translations

The interface is available in French, English and Japanese, and translators can add languages without touching code ([TRANSLATING.md](TRANSLATING.md)). The French text is the translation key; each language is one file, `locales/<code>.json`, with a `ui` section (renderer) and a `main` section (main process), discovered automatically:

- **UI:** `t('Paramètres')` (`src/renderer/src/lib/i18n.ts`). Parameters use braces: `t('{n} œuvres', { n })`. The renderer bundles `locales/*.json` through Vite (`import.meta.glob`).
- **Main process** (dialogs, notification area menu, error messages shown in the UI): `tm('…')` (`src/main/i18n.ts`), which reads `locales/` from disk (`build.files` packages it).
- **Module-level labels** (evaluated before the language is known): declare them with `msg('…')` and display them with `tr(label)`.
- **Sentences containing elements** (a key, a link): `<Trans text={t('… {hotkey} …')} values={{ hotkey: <kbd>…</kbd> }} />`.

When you add or change a French text, add its English and Japanese translations to `locales/en.json` and `locales/ja.json` (`npm run i18n:template en` adds the missing keys, empty, and moves the unused ones to `"obsolete"`). `tests/renderer/i18n.test.ts` fails if English or Japanese misses a key, if any language file has a key the code doesn't use or different `{parameters}`, or if a file is invalid; it prints the completion of the partial languages. A missing text in a partial language falls back to English, then French.

## Releasing a version

The GitHub Actions CI (`.github/workflows/build.yml`) runs the tests, then builds Windows and macOS on every push to `main`. A `v*` tag also publishes a GitHub release with the installers, the auto-update files and a description made of a changelog (the subjects of the commits since the previous tag, so write them for users) followed by `.github/release-notes.md`.

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
