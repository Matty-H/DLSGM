# Processus Principal (Main Process)

Ce répertoire contient la logique "backend" de l'application Electron, s'exécutant dans le processus principal de Node.js.

## Fichiers clés

### `main.js`
Le point d'entrée de l'application. Il est responsable de :
- La création et la gestion de la fenêtre principale (`BrowserWindow`).
- L'enregistrement du protocole personnalisé `atom://` pour charger des images locales en toute sécurité.
- La gestion du "Mode Panique" via des raccourcis globaux.
- L'initialisation des gestionnaires IPC.

### `ipc-handlers.js`
Centralise toutes les communications entre le processus de rendu et le système d'exploitation. Fonctions principales :
- **Scan de fichiers** : Recherche les dossiers correspondant aux IDs DLSite.
- **Lancement de jeu** : Recherche récursivement l'exécutable le plus probable (en évitant les désinstallateurs) et lance le processus.
- **Gestion du cache** : Sauvegarde et chargement du fichier `cache.json`.
- **Opérations système** : Ouverture de dossiers, sélection d'images via dialogue système, etc.

### `store.js`
Une abstraction simple pour la persistance des données (paramètres, cache) dans le dossier `userData` de l'utilisateur.

## Abstractions

- **Gestion des exécutables** : La logique de lancement utilise un algorithme qui privilégie le fichier `.exe` le plus volumineux dans les 3 premiers niveaux de sous-dossiers pour maximiser les chances de trouver le bon lanceur.
- **Sécurité** : Utilisation de `contextIsolation` et du protocole `atom://` pour éviter d'exposer le système de fichiers directement au rendu.
