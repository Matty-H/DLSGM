---
name: lan-peer
description: Coordinate with another Claude Code session of DLSGM running on another machine of the local network (e.g. Windows ↔ macOS) through a small HTTP message relay, to test for real what one machine can't (LAN sharing, cross-OS file names, discovery, firewalls). Use when the user asks to talk to / test with the instance on another PC or Mac, or to resume such a session.
---

# Double session LAN (lan-peer)

Deux sessions Claude Code, une par machine, chacune dans son clone du repo, se parlent par un relais HTTP sur le réseau local. L'humain ne sert qu'à lancer le relais, à cliquer dans l'UI quand c'est indispensable et à réveiller un pair endormi.

Scripts dans `.claude/skills/lan-peer/scripts/` (Node seul, mêmes commandes sous Windows et macOS). L'état de session (URL, token, curseur de lecture) est dans `.claude/lan-peer-session.json`, **ignoré par git** : ne jamais committer le token.

## 1. Mise en place

**Hôte** (la machine qui fait tourner le relais, en général celle où l'utilisateur a lancé la demande) :

1. `node .claude/skills/lan-peer/scripts/relay.js init <mon-nom>` : écrit la session et affiche l'URL et la commande `join` pour le pair.
2. **Le relais ouvre un port en écoute (47900) : c'est l'humain qui le lance**, le mode auto le refuse à Claude. Donner la commande exacte :
   - Windows : `! cmd //c start "DLSGM relay" node .claude/skills/lan-peer/scripts/relay.js` ouvre une fenêtre séparée. Le `!` passe par Git Bash, pas PowerShell, et un job `&`/`nohup` lancé par `!` meurt avec le shell.
   - macOS : dans un terminal séparé, `node .claude/skills/lan-peer/scripts/relay.js`.
   - Pare-feu Windows : autoriser node.exe. Vérifier le profil réseau avec `Get-NetConnectionProfile` : sur un réseau « Public », la règle doit couvrir Public.
3. `node .claude/skills/lan-peer/scripts/msg.js ping` doit afficher `relais OK` et `sans token : 401`.

**Pair** : donner à l'utilisateur un message à coller dans l'autre session (modèle au §4). Le pair fait `git pull` pour avoir ce skill, puis `msg.js join <url> <token> <nom>` et `msg.js ping`.

## 2. Boucle de communication (les deux côtés)

- Envoyer : `node .../msg.js post "texte"` ou `post @fichier.txt` pour un texte long, sans aucun souci de guillemets.
- **Attendre : toujours `node .../msg.js wait` en arrière-plan** (`run_in_background: true`), puis terminer son tour. La fin de la commande réveille la session. Une attente au premier plan, ou un « j'attends » en fin de tour sans tâche de fond, endort la session pour de bon : c'est arrivé au pair macOS, qui a raté une phase entière.
- `wait` s'arrête seul après 28 min (paramétrable) : la relancer. Le curseur `lastSeen` avance tout seul, mes propres messages ne réveillent pas l'attente.
- `read` montre les non-lus sans attendre. `put <fichier>` / `get <nom> <dest>` échangent des fichiers (sommes SHA-256, logs, scripts).
- Si l'autre se tait plus d'une attente complète, il dort : demander à l'utilisateur de lui dire « lis le relais ». Après deux ou trois attentes vides sans aucune nouvelle humaine, arrêter de relancer et faire le point.

## 3. Méthode de test

- **Exécuter le vrai code sans l'UI** plutôt que de demander des clics : `npx tsc -p tsconfig.main.json`, puis `npx electron .claude/skills/lan-peer/scripts/lan-send.js <host> 47821 <code> <ID…>` (découverte et envoi réels, bibliothèque lue en lecture seule) ou `lan-receive.js > recv.log 2>&1` (vraie réception dans un dossier de test). La réception ouvre un port : demander l'accord de l'utilisateur d'abord. Toujours rediriger la sortie d'Electron vers un fichier, car à travers un pipe (`grep`) elle reste bufferisée et le code à 6 chiffres n'apparaît pas. Le processus ne quitte pas seul : le tuer à la fin.
- **Cas limites** : `node lan-probe.js send … <scénario>` parle le protocole brut (NFC, NFD, doublon NFC/NFD, nom réservé, fichier plus gros qu'annoncé, 50 Mo de débit). Utiliser des ID factices `RJ999999xx` : chacun crée un vrai dossier de jeu chez le receveur, et un scan DLSGM y laissera une fiche `fetchFailed`, jamais purgée. Demander au pair si son profil DLSGM est jetable.
- **Le pair vérifie sur disque, pas seulement dans l'UI** : `find … | LC_ALL=C sort`, noms en hexadécimal (`xxd -p` / `od -An -tx1`) pour la forme Unicode, SHA-256 de chaque fichier comparé à ceux de l'envoyeur (`put` d'un fichier `sha256sum`).
- **Mesurer le lien avant d'accuser le code** : `lan-probe.js send … big` et `ping`. Le Mac en Wi-Fi plafonnait à 0,15–0,7 Mo/s avec 10 % de pertes, DLSGM n'y était pour rien. Une découverte UDP vide une fois sur un Wi-Fi qui perd des paquets n'est pas un bug, la refaire 3 fois.
- Tester les deux sens : chaque OS révèle des problèmes différents (APFS confond NFC et NFD, NTFS les garde distincts ; `.DS_Store`/`._*` n'existent que côté Mac).
- Le pair relit le code en lecture seule et ne modifie ni ne committe rien : les correctifs se font d'un seul côté, avec un test de régression qui échoue sans eux (cf. `tests/main/lan-share-transfer.test.ts`).

## 4. Modèle de message pour le pair

```
Une autre session Claude Code (<OS>, même projet DLSGM) coordonne avec toi des tests réels sur le réseau local.
1. git pull, puis : node .claude/skills/lan-peer/scripts/msg.js join <url> <token> <nom-du-pair> && node .claude/skills/lan-peer/scripts/msg.js ping
2. Lis .claude/skills/lan-peer/SKILL.md (§2 et §3) et applique-le, surtout : attendre avec `msg.js wait` EN ARRIÈRE-PLAN puis terminer ton tour.
3. Poste un premier message : OS/arch, `git log -1 --oneline`, résultat de `npm run check`, IPv4 LAN, DLSGM lancé ou non, profil DLSGM réel ou jetable.
4. Suis ensuite les instructions de l'autre session. Réponds avec les sorties brutes en marquant ce qui est mesuré, lu ou supposé. Ne modifie pas le code et ne committe rien sans qu'on te le demande. Signale tout ce qui demande un humain (clic dans l'UI, dialogue du pare-feu).
```

## 5. Fin de session

Prévenir le pair (fermer sa réception LAN, arrêter `npm run dev`, arrêter son attente), tuer les `lan-receive.js` encore actifs et laisser l'utilisateur fermer la fenêtre du relais. Les messages et fichiers du relais restent dans `<tmp>/dlsgm-lan-relay/` : les supprimer si on ne reprend pas.
