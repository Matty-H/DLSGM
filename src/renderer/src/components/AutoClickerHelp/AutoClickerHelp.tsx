import { t } from '../../lib/i18n.js';
import Trans from '../Trans/Trans';

export interface AutoClickerHelpProps {
  hotkey: string;
}

/** Mode d'emploi de l'auto-clicker (overlay en jeu et Paramètres › Auto-clicker). */
export default function AutoClickerHelp({ hotkey }: AutoClickerHelpProps) {
  const key = <span className="kbd">{hotkey}</span>;
  return (
    <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-text-secondary">
      <li>
        <Trans
          text={t("Règle le clic dans {where} : intervalle, bouton, simple ou double clic, nombre de répétitions, et l'endroit (au curseur ou un point fixe) — puis Enregistrer.")}
          values={{ where: <span className="font-semibold text-text">{t('Paramètres › Outils en jeu')}</span> }}
        />
      </li>
      <li>
        <Trans
          text={t("Coche « Activer l'auto-clicker », puis, en jeu (lancé depuis DLSGM), ouvre l'overlay avec {shift} + {tab} et coche « Ajouter l'auto-clicker à ce jeu » (retenu pour les parties suivantes). {key} n'agit que dans ces jeux, et les clics ne partent que vers le jeu : si une autre fenêtre passe au premier plan (Alt+Tab, bureau), l'auto-clicker se met en pause (pastille orange) au lieu de cliquer ailleurs.")}
          values={{ shift: <span className="kbd">{t('Maj')}</span>, tab: <span className="kbd">Tab</span>, key }}
        />
      </li>
      <li>
        <Trans
          text={t("En jeu, place la souris où cliquer et appuie sur {key} pour démarrer ; {key} à nouveau pour arrêter. Le témoin en bas à gauche de la fenêtre du jeu montre l'état (vert en marche, orange en pause, rouge à l'arrêt) ; à l'arrêt, un clic dessus règle l'intervalle et le raccourci.")}
          values={{ key }}
        />
      </li>
      <li>
        <Trans
          text={t('Arrêt de sécurité : {alt} + {space} (bouton panique), et à la fermeture du jeu.')}
          values={{ alt: <span className="kbd">Alt</span>, space: <span className="kbd">{t('Espace')}</span> }}
        />
      </li>
      <li className="text-text-muted">
        {t("Si le jeu tourne en administrateur, Windows bloque les clics venant d'une application qui ne l'est pas : lance alors DLSGM en administrateur aussi. Certains jeux ignorent les clics simulés, ou les trop rapides : augmente l'intervalle (50–100 ms suffit en général).")}
      </li>
    </ol>
  );
}
