# Processus de Rendu (Renderer)

Ce répertoire contient l'interface utilisateur et la logique côté client de l'application, en React + TypeScript + Tailwind CSS (build via Vite).

## Structure

- **`index.html`** : racine Vite, charge `src/main.tsx`.
- **`vite.config.mts`** / **`tsconfig.json`** : configuration du build (voir `package.json` pour les scripts `dev`/`build:renderer`).
- **`src/main.tsx`** : point d'entrée, monte `<App />`.
- **`src/App.tsx`** : composition racine — assemble les hooks et les composants, calcule la liste de jeux filtrée/triée.
- **`src/index.css`** : `@import "tailwindcss"` + tokens de design (`@theme`, couleurs/rayon/flou portés depuis l'ancienne charte visuelle) + animations personnalisées.
- **`src/components/`** : un dossier par composant (Header, AdvancedFilterPanel, GenreMultiSelect, SortSelect, GamesGrid, GameCard, CategoryBadge, RatingStars, GameInfoPanel (+ GameInfoDetails), Carousel, CustomTagsEditor, ManualEditForm, FetchFailedView, SettingsPanel, PanicOverlay).
- **`src/hooks/`** : état applicatif — `useSettings`, `useFilters`, `useGamesLibrary` (cache, scan, lancement, mutations), `usePanicButton`, `useKeyboardNavigation`.
- **`src/lib/`** : logique métier framework-agnostique (communication IPC via `window.electronAPI`), volontairement dépourvue de toute manipulation du DOM — `cacheManager.ts`, `dataFetcher.ts` (fetch DLsite + images, ne réécrit jamais une fiche valide par un échec), `gameScanner.ts` (scan + concurrence), `filterManager.ts` (prédicats de filtre/tri purs), `metadataManager.ts`, `osHandler.ts` (lancement de jeu, playtime), `settings.ts` (persistance), `timeFormatter.ts`, `constants.ts`.

## Pourquoi cette architecture

La logique dans `src/lib/` était auparavant mêlée à de la manipulation directe du DOM (anciens `uiManager.js`/`eventListeners.js`/`gameInfoHandler.js`, supprimés). Elle en a été extraite pour permettre la réécriture de la couche de présentation en composants React réels — notamment en vue d'une synchronisation avec Claude Design (`/design-sync`), qui nécessite une bibliothèque de composants buildable.

## Intégration Electron ↔ Vite

`src/main/main.ts` charge soit le serveur de développement Vite (`process.env.VITE_DEV_SERVER_URL`, positionné par `npm run dev`), soit le build de production (`src/renderer/dist/index.html`, généré par `npm run build:renderer`). Le processus main/preload ne dépend pas de Vite.

## Abstractions importantes

- **Cache mémoire de la liste de dossiers** (`useGamesLibrary`) : le dossier de jeux n'est relu qu'après un scan explicite, pas à chaque frappe de recherche.
- **Chemins d'image `atom://`** construits localement (pas d'aller-retour IPC par carte de jeu) à partir du `userDataPath` récupéré une seule fois.
- **Fallback image** : toutes les images utilisent `PLACEHOLDER_IMAGE` (SVG inline, `src/lib/constants.ts`) en cas d'erreur de chargement.
