import os
import re

class GameEngineDetector:
    def __init__(self):
        # Signatures et extensions par moteur de jeu
        self.signatures = {
            # Godot Engine
            "godot": {
                "extensions": [".pck", ".res", ".scn", ".tscn", ".tres", ".godot"],
                "files": ["project.godot", "engine.cfg"]
            },
            # GameMaker Studio
            "gamemaker": {
                "extensions": [".win", ".yyz", ".yyp", ".gmz", ".gml", ".yy"],
                "files": ["options.ini", "datafiles"]
            },
            # Unity
            "unity": {
                "extensions": [".unity", ".prefab", ".asset", ".meta", ".bundle", ".unitypackage"],
                "files": ["ProjectSettings", "Assets", "Library", "UnityPlayer.dll"]
            },
            # Unreal Engine
            "unreal": {
                "extensions": [".uproject", ".uasset", ".umap", ".upk", ".udk"],
                "files": ["DefaultEngine.ini", "Config", "Content", "Binaries"]
            },
            # Electron
            "electron": {
                "extensions": [".asar"],
                "files": ["electron.exe", "electron", "resources.pak", "v8_context_snapshot.bin"]
            },
            # RPG Maker
            "rpgmaker": {
                "extensions": [".rgss2a", ".rgss3a", ".rvdata", ".rvdata2", ".rpgproject", ".lmu", ".ldb", ".rxdata"],
                "files": ["Game.exe", "RPG_RT.exe", "Game.ini", "RPG_RT.ini", "www", "js", "audio", "data"]
            },
            # Pixel Game Maker MV
            "pixelgamemaker": {
                "extensions": [".pgmmv", ".pgmmv-proj", ".pgmproject"],
                "files": ["PGMMV.exe", "PGMResource", "PGMPlayer.exe", "GameMain.json", "PGMMVConfig.json"]
            },
            # Ren'Py
            "renpy": {
                "extensions": [".rpy", ".rpyc", ".rpym", ".rpa"],
                "files": ["renpy", "game", "script.rpy", "options.rpy", "common"]
            }
        }
        # Fichiers de détection par moteur
        self.engine_detection_files = {}
        # La blacklist de noms à ignorer
        self.blacklist_keywords = ["reipatcher", "unitycrashhandler64"]
    
    def is_blacklisted(self, path):
        """Retourne True si le chemin du fichier ou du répertoire est blacklisté."""
        path_lower = path.lower()  # Applique le lower() sur le chemin complet
        return any(keyword in path_lower for keyword in self.blacklist_keywords)

    
    def scan_directory(self, directory_path):
        """Analyse un répertoire pour détecter les moteurs de jeu."""
        results = {engine: False for engine in self.signatures}
        self.engine_detection_files = {engine: [] for engine in self.signatures}

        try:
            all_items = os.listdir(directory_path)
        except Exception as e:
            print(f"Erreur: Impossible d'accéder au dossier {directory_path}: {e}")
            return results

        # Filtrage des fichiers et répertoires pour ignorer ceux qui sont blacklistés
        files_in_dir = [f.lower() for f in all_items if os.path.isfile(os.path.join(directory_path, f)) and not self.is_blacklisted(os.path.join(directory_path, f).lower()) and not f.startswith('.')]
        dirs_in_dir = [d.lower() for d in all_items if os.path.isdir(os.path.join(directory_path, d)) and not self.is_blacklisted(os.path.join(directory_path, d).lower()) and not d.startswith('.')]

        print(f"Fichiers dans le répertoire : {files_in_dir}")
        print(f"Dossiers dans le répertoire : {dirs_in_dir}")

        for engine, sig in self.signatures.items():
            for file in files_in_dir:
                ext = os.path.splitext(file)[1].lower()
                if ext in sig["extensions"]:
                    results[engine] = True
                    self.engine_detection_files[engine].append(os.path.join(directory_path, file))
                    break

            if not results[engine]:
                for item in sig["files"]:
                    if item.lower() in files_in_dir:
                        results[engine] = True
                        self.engine_detection_files[engine].append(os.path.join(directory_path, item.lower()))
                        break
                    elif item.lower() in dirs_in_dir:
                        results[engine] = True
                        self.engine_detection_files[engine].append(os.path.join(directory_path, item.lower()))
                        break

            if not results[engine]:
                # Cas spécifiques comme RPG Maker, Unity, Godot, etc.
                if engine == "rpgmaker" and "www" in dirs_in_dir:
                    www_subdir = os.path.join(directory_path, "www")
                    try:
                        www_contents = os.listdir(www_subdir)
                        if "js" in [d.lower() for d in www_contents] and "audio" in [d.lower() for d in www_contents]:
                            results[engine] = True
                            self.engine_detection_files[engine].append(www_subdir)
                    except:
                        pass

                if engine == "unity" and "assets" in dirs_in_dir and "library" in dirs_in_dir:
                    results[engine] = True
                    self.engine_detection_files[engine].append(os.path.join(directory_path, "assets"))
                    self.engine_detection_files[engine].append(os.path.join(directory_path, "library"))

                if engine == "godot" and ".import" in dirs_in_dir:
                    results[engine] = True
                    self.engine_detection_files[engine].append(os.path.join(directory_path, ".import"))

        if not any(results.values()):
            print("Aucun moteur détecté en surface, recherche en profondeur...")
            results, engine_files = self.recursive_scan(directory_path, current_depth=1, max_depth=5, results=results, engine_files=self.engine_detection_files)
            self.engine_detection_files = engine_files

        return results



    def recursive_scan(self, directory_path, current_depth, max_depth, results, engine_files):
        if current_depth > max_depth:
            return results, engine_files

        try:
            all_items = os.listdir(directory_path)
        except Exception as e:
            print(f"Erreur: Impossible d'accéder au dossier {directory_path}: {e}")
            return results, engine_files

        files_in_dir = [f.lower() for f in all_items if os.path.isfile(os.path.join(directory_path, f)) and not self.is_blacklisted(os.path.join(directory_path, f).lower())]
        dirs_in_dir = [d.lower() for d in all_items if os.path.isdir(os.path.join(directory_path, d)) and not self.is_blacklisted(os.path.join(directory_path, d).lower())]


        for engine, sig in self.signatures.items():
            if results[engine]:
                continue

            for file in files_in_dir:
                ext = os.path.splitext(file)[1].lower()
                if ext in sig["extensions"]:
                    print(f"{engine} détecté dans {directory_path} (extension trouvée: {ext})")
                    results[engine] = True
                    engine_files[engine].append(os.path.join(directory_path, file))
                    break

            if results[engine]:
                continue

            for item in sig["files"]:
                if item.lower() in files_in_dir:
                    print(f"{engine} détecté dans {directory_path} (élément trouvé: {item})")
                    results[engine] = True
                    engine_files[engine].append(os.path.join(directory_path, item.lower()))
                    break
                elif item.lower() in dirs_in_dir:
                    print(f"{engine} détecté dans {directory_path} (dossier trouvé: {item})")
                    results[engine] = True
                    engine_files[engine].append(os.path.join(directory_path, item.lower()))
                    break

            if not results[engine]:
                if engine == "rpgmaker" and "www" in dirs_in_dir:
                    www_subdir = os.path.join(directory_path, "www")
                    try:
                        www_contents = os.listdir(www_subdir)
                        if "js" in [d.lower() for d in www_contents] and "audio" in [d.lower() for d in www_contents]:
                            print(f"{engine} détecté dans {directory_path} (structure www/js/audio)")
                            results[engine] = True
                            engine_files[engine].append(www_subdir)
                    except:
                        pass

                if engine == "unity" and "assets" in dirs_in_dir and "library" in dirs_in_dir:
                    print(f"{engine} détecté dans {directory_path} (Assets + Library)")
                    results[engine] = True
                    engine_files[engine].append(os.path.join(directory_path, "assets"))
                    engine_files[engine].append(os.path.join(directory_path, "library"))

                if engine == "godot" and ".import" in dirs_in_dir:
                    print(f"{engine} détecté dans {directory_path} (.import détecté)")
                    results[engine] = True
                    engine_files[engine].append(os.path.join(directory_path, ".import"))

        for subdir in dirs_in_dir:
            if subdir.startswith('.'):
                continue
            subdir_path = os.path.join(directory_path, subdir)
            results, engine_files = self.recursive_scan(subdir_path, current_depth + 1, max_depth, results, engine_files)

        return results, engine_files
    
    def detect_build_type(self, directory_path):
        """Détection du type de build dans un répertoire."""
        build_types = {}
        
        try:
            all_items = os.listdir(directory_path)
        except Exception as e:
            print(f"Erreur: Impossible d'accéder au dossier {directory_path}: {e}")
            return build_types

        files_in_dir = [f.lower() for f in all_items if os.path.isfile(os.path.join(directory_path, f)) and not self.is_blacklisted(os.path.join(directory_path, f).lower())]
        dirs_in_dir = [d.lower() for d in all_items if os.path.isdir(os.path.join(directory_path, d)) and not self.is_blacklisted(os.path.join(directory_path, d).lower())]


        # === Étape 1: Récupérer les .exe présents ===
        exe_basenames = []
        for f in files_in_dir:
            if f.lower().endswith('.exe'):
                base_name = os.path.splitext(f)[0].lower()
                exe_basenames.append(base_name)

                if "Windows" not in build_types:
                    build_types["Windows"] = []
                build_types["Windows"].append(os.path.join(directory_path, f))

            # Vérification des exécutables Linux
            if ('x86_64' in f.lower() or 'linux' in f.lower()) and os.access(os.path.join(directory_path, f), os.X_OK):
                if "Linux" not in build_types:
                    build_types["Linux"] = []
                build_types["Linux"].append(os.path.join(directory_path, f))

        # Vérification des dossiers .app (macOS)
        for d in dirs_in_dir:
            if d.lower().endswith('.app'):
                if "MacOS" not in build_types:
                    build_types["MacOS"] = []
                build_types["MacOS"].append(os.path.join(directory_path, d))

        # Vérification spécifique Web
        if 'index.html' in [f.lower() for f in files_in_dir]:
            if "Web" not in build_types:
                build_types["Web"] = []
            build_types["Web"].append(os.path.join(directory_path, 'index.html'))

        if 'www' in [d.lower() for d in dirs_in_dir]:
            if "Web" not in build_types:
                build_types["Web"] = []
            build_types["Web"].append(os.path.join(directory_path, 'www'))

        if 'contents' in [d.lower() for d in dirs_in_dir]:
            if "MacOS" not in build_types:
                build_types["MacOS"] = []
            build_types["MacOS"].append(os.path.join(directory_path, 'contents'))

        # === Étape 2: Recursion, en filtrant les dossiers *_Data ===
        for subdir in dirs_in_dir:
            subdir_lower = subdir.lower()

            # Exclure les dossiers cachés
            if subdir_lower.startswith('.'):
                continue

            # Exclure les dossiers xxx_Data si xxx.exe est présent
            is_data_folder = subdir_lower.endswith('_data')
            if is_data_folder:
                base_name = subdir_lower[:-5]  # Retirer '_data'
                if base_name in exe_basenames:
                    # On ignore ce dossier car le .exe correspondant existe déjà
                    continue

            subdir_path = os.path.join(directory_path, subdir)
            sub_build_types = self.detect_build_type(subdir_path)

            # Fusion des résultats
            for platform, paths in sub_build_types.items():
                if platform not in build_types:
                    build_types[platform] = []
                build_types[platform].extend(paths)

        return build_types

    def print_results(self, results, build_types):
        moteurs_detectes = False

        print("\n=== MOTEURS DE JEU DÉTECTÉS ===")
        for engine, detected in results.items():
            if detected:
                print(f"DÉTECTÉ: {engine.upper()}")
                # Affichage des fichiers de détection
                for file_path in self.engine_detection_files[engine]:
                    print(f"  > {file_path}")
                moteurs_detectes = True

        if not moteurs_detectes:
            print("Aucun moteur de jeu détecté.")

        print("\n=== TYPES DE BUILD DÉTECTÉS ===")
        if build_types:
            for platform, file_paths in build_types.items():
                print(f"BUILD: {platform}")
                # Affichage des chemins pour chaque build
                for path in file_paths:
                    print(f"  > {path}")
        else:
            print("Aucun type de build détecté.")

# Utilisation simplifiée
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python game_engine_detector.py <chemin_du_dossier>")
        sys.exit(1)

    directory_path = sys.argv[1]

    detector = GameEngineDetector()
    print(f"Analyse du dossier: {directory_path}")

    results = detector.scan_directory(directory_path)
    build_types = detector.detect_build_type(directory_path)

    detector.print_results(results, build_types)