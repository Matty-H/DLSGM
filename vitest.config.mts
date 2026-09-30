import { defineConfig } from 'vitest/config';

// Tests unitaires (npm test) : logique pure du renderer (src/renderer/src/lib)
// et modules du main, avec `electron` remplacé par un faux module dans
// chaque test qui en dépend (vi.mock). Aucun test ne lance Electron.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Les tests de fichiers créent chacun leur dossier temporaire.
    testTimeout: 20000
  }
});
