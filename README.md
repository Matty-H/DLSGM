# DLSITE Game (&Stuff) Manager

Gestionnaire de jeux et de médias spécialisé pour DLSite, développé avec Electron. Ce projet permet d'organiser votre bibliothèque locale, de récupérer automatiquement les métadonnées et images depuis DLSite, et de lancer vos jeux facilement.

## Fonctionnalités

- 🗂 **Gestion de bibliothèque** : Scanne vos dossiers locaux pour identifier les jeux par leur ID DLSite (ex: RJ123456).
- 🌐 **Récupération automatique** : Récupère les noms, cercles, catégories, genres, dates de sortie et images directement depuis DLSite.
- 🚀 **Lanceur de jeux** : Identifie l'exécutable principal et lance le jeu en un clic.
- 🔍 **Filtrage avancé** : Recherche par nom et filtres par catégorie ou genre.
- ✍️ **Édition manuelle** : Modifiez toutes les métadonnées et changez l'image de couverture si nécessaire.
- 📈 **Suivi du temps de jeu** : Enregistre le temps passé sur chaque titre.
- 🛡 **Mode Panique** : Touche de raccourci pour masquer rapidement l'application.

## Installation

### Prérequis

- **Node.js** (v18 ou supérieur recommandé)

### Dépendances

Installez les dépendances Node.js :
```bash
npm install
```

### Lancement

Pour démarrer l'application en mode développement :
```bash
npm start
```

## Téléchargement et mises à jour

Les builds Windows et Mac sont générées automatiquement et publiées sur la page [Releases](https://github.com/Matty-H/DLSGM/releases) à chaque tag `vX.Y.Z`.

- **Windows (installeur NSIS)** : se met à jour automatiquement au démarrage.
- **Windows (portable)** : aucune mise à jour automatique — un `.exe` autonome sans dossier d'installation ne peut pas s'auto-remplacer ; retéléchargez la nouvelle version manuellement.
- **macOS (`.dmg`/`.zip`)** : se met à jour automatiquement au démarrage une fois l'app installée dans `/Applications`.

### Processus de release (mainteneurs)

```bash
# 1. Bump de version dans package.json, puis commit
git tag vX.Y.Z
git push origin vX.Y.Z
# La CI build les deux plateformes et publie la release automatiquement.
```

## Structure du Projet

L'application est structurée comme suit :

- `src/main/` : Processus principal Electron (gestion des fenêtres, système de fichiers, IPC, récupération des métadonnées DLsite).
- `src/renderer/` : Interface utilisateur (React/TypeScript) et logique de rendu.
- `src/preload/` : Pont sécurisé entre le processus principal et le rendu.
- `src/shared/` : Contrat de types partagé entre main, preload et renderer.

## Licence

[![License: CC BY-NC-SA 4.0](https://licensebuttons.net/l/by-nc-sa/4.0/80x15.png)](http://creativecommons.org/licenses/by-nc-sa/4.0/)
Ce projet est sous licence Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.
