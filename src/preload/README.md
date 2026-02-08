# Préchargement (Preload)

Le script de préchargement sert de pont sécurisé entre le processus principal (Node.js) et le processus de rendu (Navigateur).

## `preload.js`

Ce fichier utilise `contextBridge` pour exposer de manière sélective des APIs sécurisées au processus de rendu via l'objet global `window.electronAPI`.

### APIs exposées

- **Système de fichiers** : `openFolder`, `openImageDialog`, `fsCopy`.
- **Données** : `saveCache`, `loadCache`, `saveSettings`, `loadSettings`.
- **Exécution** : `launchGame`, `runPythonScript`.
- **Utilitaires** : `getUserDataPath`, `pathJoin`, `openExternal`.

Cette couche de sécurité est cruciale car elle permet au rendu d'interagir avec le système sans avoir un accès direct et total aux modules Node.js comme `fs` ou `child_process`.
