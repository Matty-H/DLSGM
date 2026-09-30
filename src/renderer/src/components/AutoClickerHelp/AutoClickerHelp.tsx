export interface AutoClickerHelpProps {
  hotkey: string;
}

/** Mode d'emploi de l'auto-clicker (overlay en jeu et Paramètres › Auto-clicker). */
export default function AutoClickerHelp({ hotkey }: AutoClickerHelpProps) {
  const key = <span className="kbd">{hotkey}</span>;
  return (
    <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-text-secondary">
      <li>
        Règle le clic dans <span className="font-semibold text-text">Paramètres › Auto-clicker</span> : intervalle, bouton,
        simple ou double clic, nombre de répétitions, et l'endroit (au curseur ou un point fixe) — puis Enregistrer.
      </li>
      <li>
        Coche « Activer l'auto-clicker », puis, en jeu (lancé depuis DLSGM), ouvre l'overlay avec{' '}
        <span className="kbd">Maj</span> + <span className="kbd">Tab</span> et coche « Ajouter l'auto-clicker à ce jeu » (retenu
        pour les parties suivantes). {key} n'agit que dans ces jeux, et les clics ne partent que vers le jeu : si une autre
        fenêtre passe au premier plan (Alt+Tab, bureau), l'auto-clicker se met en pause (pastille orange) au lieu de cliquer
        ailleurs.
      </li>
      <li>
        En jeu, place la souris où cliquer et appuie sur {key} pour démarrer ; {key} à nouveau pour arrêter. Le témoin en
        bas à gauche de l'écran montre l'état (vert en marche, orange en pause, rouge à l'arrêt) ; à l'arrêt, un clic dessus
        règle l'intervalle et le raccourci.
      </li>
      <li>
        Arrêt de sécurité : <span className="kbd">Alt</span> + <span className="kbd">Espace</span> (bouton panique), et à la
        fermeture du jeu.
      </li>
      <li className="text-text-muted">
        Si le jeu tourne en administrateur, Windows bloque les clics venant d'une application qui ne l'est pas : lance alors
        DLSGM en administrateur aussi. Certains jeux ignorent les clics simulés, ou les trop rapides : augmente
        l'intervalle (50–100 ms suffit en général).
      </li>
    </ol>
  );
}
