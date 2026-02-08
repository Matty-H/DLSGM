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

- **Node.js** (v14 ou supérieur recommandé)
- **Python 3** avec `pip`

### Dépendances

Installez les dépendances Node.js :
```bash
npm install
```

Installez les dépendances Python nécessaires au script de récupération :
```bash
pip install dlsite-async
```

### Lancement

Pour démarrer l'application en mode développement :
```bash
npm start
```

## Structure du Projet

L'application est structurée comme suit :

- `src/main/` : Processus principal Electron (gestion des fenêtres, système de fichiers, IPC).
- `src/renderer/` : Interface utilisateur (HTML/CSS/JS) et logique de rendu.
- `src/preload/` : Pont sécurisé entre le processus principal et le rendu.
- `src/python/` : Scripts utilitaires pour le traitement des données et la détection de moteurs.

## Licence

[![License: CC BY-NC-SA 4.0](https://licensebuttons.net/l/by-nc-sa/4.0/80x15.png)](http://creativecommons.org/licenses/by-nc-sa/4.0/)
Ce projet est sous licence Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.
