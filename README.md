# DLSGM — DLsite Game (& Stuff) Manager

Application de bureau (Electron) pour organiser une bibliothèque locale d'œuvres DLsite. DLSGM détecte les jeux à partir de leur identifiant DLsite (`RJ123456`, `VJ01234567`…), récupère leurs métadonnées et images, les conserve en cache local et permet de parcourir, filtrer et lancer la bibliothèque depuis une interface unique, utilisable à la souris, au clavier ou à la manette.

[Télécharger la dernière version](https://github.com/Matty-H/DLSGM/releases/latest)

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Organisation de la bibliothèque](#organisation-de-la-bibliothèque)
- [Données et confidentialité](#données-et-confidentialité)
- [Développement](#développement)
- [Publication d'une version](#publication-dune-version)
- [Architecture](#architecture)
- [Licence](#licence)

---

## Fonctionnalités

### Bibliothèque

- Détection automatique des jeux dans le dossier de destination ; assistant de renommage pour les dossiers mal nommés (`[RJ01234567] Titre v1.2`).
- Récupération des métadonnées depuis DLsite : titre, cercle, auteurs, genres, type d'œuvre, date de sortie, description, couverture et images d'exemple. Le japonais fait foi ; l'anglais est récupéré pour l'affichage et la recherche.
- Cache local persistant : une fiche récupérée n'est jamais écrasée par un échec ultérieur, ni supprimée si le jeu disparaît (utile pour les œuvres retirées de DLsite).
- Recherche, filtres avancés (genres, type, cercle, auteur, série), tri (dont par taille sur disque).
- Collections manuelles ou à règles, étagères sur l'écran d'accueil, collections automatiques (« À finir », « Jamais lancés », « Finis »).
- Notes, tags personnels, édition manuelle des fiches, liste de souhaits.
- Statistiques : temps de jeu par semaine, taille de la collection, espace disque par lecteur.

### Lancement et suivi

- Lancement en un clic, choix de l'exécutable, suivi du temps de jeu et des sessions.
- Sauvegardes : copie automatique des emplacements de sauvegarde détectés à la fermeture du jeu, restauration réversible.
- Options par jeu (Windows) : lancement en environnement isolé via Sandboxie-Plus, en locale japonaise via Locale Emulator, avec extraction de texte via Textractor.
- Installation et désinstallation de correctifs (BepInEx + XUnity.AutoTranslator pour les jeux Unity Mono, archives de patch personnelles) avec restauration exacte des fichiers remplacés.

### Import et partage

- Import d'archives `.zip`, `.rar` (y compris multi-volumes et SFX) et `.7z`, avec gestion des noms Shift-JIS, des archives imbriquées et des mots de passe usuels.
- Partage de jeux en réseau local entre deux instances de DLSGM, protégé par un code à usage unique et vérifié par SHA-256.

### Outils en jeu (Windows)

- Overlay superposé au jeu (Maj+Tab) sans lui retirer le focus.
- Captures d'écran de la fenêtre du jeu (Ctrl+F8) avec galerie.
- Traduction à l'écran : OCR Windows puis dictionnaire hors ligne (sens de chaque mot et kanji, avec furigana), modèle local compatible OpenAI, DeepL ou Google.
- Auto-clicker, détecteur de rythme (déclenchement sur changement de pixels) et enregistreur de macros, activés jeu par jeu et limités à la fenêtre du jeu.
- Extraction des ressources chiffrées des jeux RPG Maker MV/MZ.
- Dossier de travail par jeu, hors du dossier du jeu, pour les notes et extractions.

### Divers

- Bouton panique (Alt+Espace) qui masque immédiatement l'application.
- Réduction dans la zone de notification.
- Proxy DLsite (HTTP/SOCKS5, avec authentification) pour les œuvres restreintes par région.
- Recherche de mise à jour au démarrage ou à la demande, installation sur accord.

---

## Installation

Les versions compilées sont publiées sur la page [Releases](https://github.com/Matty-H/DLSGM/releases).

| Plateforme | Fichier | Mises à jour |
|---|---|---|
| Windows | `DLSGM-<version>-Windows-Installeur.exe` | Proposées puis installées depuis DLSGM |
| Windows | `DLSGM-<version>-Windows-Portable.exe` (sans installation) | Signalées par un pop-up, à retélécharger |
| macOS | `DLSGM-<version>-macOS-arm64.dmg` | Proposées puis installées depuis DLSGM, une fois l'application placée dans `/Applications` |

Les fichiers `.blockmap`, `latest*.yml` et `-maj-auto.zip` d'une release servent aux mises à jour automatiques et n'ont pas à être téléchargés.

La recherche de mise à jour au démarrage se désactive dans Paramètres › Mises à jour, où une vérification manuelle est aussi possible. Rien n'est téléchargé sans accord.

La plupart des outils en jeu (overlay, OCR, auto-clicker, Sandboxie, Locale Emulator, Textractor) ne sont disponibles que sous Windows. La traduction OCR du japonais nécessite le module OCR japonais de Windows (`Language.OCR~~~ja-JP`).

---

## Organisation de la bibliothèque

Chaque jeu doit se trouver dans un dossier nommé exactement d'après son identifiant DLsite, directement sous le dossier de destination choisi dans les paramètres :

```
Jeux/
├── RJ01234567/
│   └── Game.exe
├── RJ123456/
│   └── ...
└── VJ01000000/
```

Un identifiant valide correspond à deux lettres majuscules suivies de 6 à 9 chiffres. Les dossiers qui contiennent un identifiant sans être nommés exactement ainsi sont proposés au renommage.

---

## Données et confidentialité

- Toutes les données (cache, images, paramètres, sauvegardes) restent sur la machine, dans le dossier de données utilisateur d'Electron.
- Les seules requêtes réseau automatiques visent DLsite (métadonnées et images) et le serveur de mises à jour GitHub.
- La traduction via DeepL ou Google envoie le texte reconnu (jamais l'image) au service choisi ; le dictionnaire hors ligne et le modèle local ne transmettent rien.
- Les mots de passe de proxy et les clés d'API sont chiffrés avec `safeStorage` (DPAPI sous Windows).
- Le partage en réseau local transite en HTTP non chiffré : à réserver à un réseau de confiance.

---

## Développement

### Prérequis

- Node.js 20 ou supérieur
- npm

### Commandes

```bash
npm install            # dépendances (active aussi le hook pre-commit)
npm run dev            # mode développement avec rechargement à chaud
npm start              # build complet puis lancement d'Electron
npm test               # tests unitaires (Vitest)
npm run typecheck      # vérification des types
npm run check          # typecheck + tests (hook pre-commit et CI)
npm run build          # build et empaquetage via electron-builder
```

Les tests s'exécutent sous Node sans lancer Electron. Toute modification de comportement doit s'accompagner d'un test dans `tests/`.

---

## Publication d'une version

La CI GitHub Actions (`.github/workflows/build.yml`) exécute les tests puis compile Windows et macOS à chaque push sur `main`. Un tag `v*` publie en plus une release GitHub avec les installeurs et les fichiers de mise à jour automatique.

```bash
# 1. Mettre à jour "version" dans package.json, puis commit
git tag vX.Y.Z           # doit correspondre exactement à la version de package.json
git push origin main vX.Y.Z
```

---

## Architecture

Application Electron en trois processus avec une frontière de sécurité stricte (`contextIsolation`, `sandbox`, pas de `nodeIntegration`).

| Dossier | Rôle |
|---|---|
| `src/main/` | Processus principal : fenêtres, IPC, accès disque et réseau, récupération DLsite, outils en jeu |
| `src/preload/` | Pont unique entre l'interface et le processus principal (`window.electronAPI`) |
| `src/shared/` | Contrat de types IPC partagé, sans code exécuté |
| `src/renderer/` | Interface React + TypeScript + Tailwind CSS, compilée avec Vite (voir [son README](src/renderer/README.md)) |
| `tests/` | Tests unitaires Vitest |

Le stockage repose sur NeDB (une entrée par jeu ou par paramètre) et les requêtes DLsite passent par la pile réseau de Chromium (`net.fetch`) afin de respecter le proxy configuré.

---

## Licence

Ce projet est distribué sous licence [Creative Commons Attribution - Pas d'Utilisation Commerciale - Partage dans les Mêmes Conditions 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr).

DLSGM n'est ni affilié à DLsite ni approuvé par DLsite.
