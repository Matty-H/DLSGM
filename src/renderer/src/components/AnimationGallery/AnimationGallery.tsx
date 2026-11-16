import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, PackagePlus, Play, RotateCcw, X } from 'lucide-react';
import RatingStars from '../RatingStars/RatingStars';
import GamesGrid from '../GamesGrid/GamesGrid';

/**
 * Galerie de validation des animations (développement seulement : chargée par
 * SettingsScreen sous `import.meta.env.DEV`, absente du build, d'où les textes
 * en français, non traduits). Chaque tuile rejoue une animation de animations.css
 * avec les vraies classes de l'interface, sur de fausses jaquettes (jamais une
 * image de la bibliothèque) ; le verdict « Garder / Retirer » est gardé dans
 * le localStorage et résumé en bas, à copier.
 */

type Verdict = 'keep' | 'drop';

const STORAGE_KEY = 'dlsgm-animation-verdicts';

const COVERS = [
  'linear-gradient(135deg, #ff3ea5, #6a3df0)',
  'linear-gradient(135deg, #2de2e6, #1a5cff)',
  'linear-gradient(135deg, #ffb347, #ff3e6c)',
  'linear-gradient(135deg, #59bf40, #0b7a75)',
  'linear-gradient(135deg, #9d6bff, #2de2e6)',
  'linear-gradient(135deg, #ff6b6b, #ffd93d)',
  'linear-gradient(135deg, #4facfe, #9d6bff)',
  'linear-gradient(135deg, #f093fb, #f5576c)'
];

const rank = (index: number) => ({ '--anim-i': index }) as CSSProperties;

function FakeCover({ index, className = '', style }: { index: number; className?: string; style?: CSSProperties }) {
  return <div className={`capsule aspect-[4/3] ${className}`} style={{ backgroundImage: COVERS[index % COVERS.length], ...style }} />;
}

/** Cadre qui tient lieu de fenêtre de l'application. */
function Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`relative h-44 overflow-hidden rounded-md bg-bg-deep ${className}`}>{children}</div>;
}

function TabsDemo() {
  const [active, setActive] = useState(0);
  return (
    <div className="flex gap-1">
      {['Accueil', 'Bibliothèque', 'Souhaits'].map((label, index) => (
        <button key={label} type="button" onClick={() => setActive(index)} className={`pill-tab ${active === index ? 'is-active' : ''}`}>
          <Play size={14} strokeWidth={2.25} />
          {label}
        </button>
      ))}
    </div>
  );
}

function ImageDemo() {
  const [current, setCurrent] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      <Stage>
        {[0, 1, 2].map(index => (
          <div key={index} className={`anim-image-in h-full w-full ${current === index ? 'block' : 'hidden'}`} style={{ backgroundImage: COVERS[index] }} />
        ))}
      </Stage>
      <button type="button" className="btn self-start" onClick={() => setCurrent(index => (index + 1) % 3)}>
        Image suivante
      </button>
    </div>
  );
}

function StarsDemo() {
  const [value, setValue] = useState(3);
  return <RatingStars value={value} onChange={next => setValue(next === value ? 0 : next)} size={30} />;
}

function SectionDemo() {
  const [section, setSection] = useState(0);
  return (
    <div className="flex gap-3">
      <div className="flex flex-col gap-1">
        {['Bibliothèque', 'Affichage', 'Stockage'].map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setSection(index)}
            className={`rounded-sm px-3 py-1.5 text-left text-[13px] font-semibold ${section === index ? 'bg-focus text-on-focus' : 'text-text-secondary'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel flex-1 overflow-hidden p-3">
        <div key={section} className="anim-section-in flex flex-col gap-2">
          {[0, 1, 2].map(row => (
            <div key={row} className="flex items-center gap-3 border-b border-divider pb-2 last:border-0">
              <div className="h-3 flex-1 rounded-sm bg-surface-3" style={{ maxWidth: `${50 + ((section + row) % 3) * 20}%` }} />
              <input type="checkbox" className="toggle ml-auto" defaultChecked={(section + row) % 2 === 0} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SVG_COLORS = [['#ff3ea5', '#6a3df0'], ['#2de2e6', '#1a5cff'], ['#ffb347', '#ff3e6c'], ['#59bf40', '#0b7a75'], ['#9d6bff', '#2de2e6'], ['#ff6b6b', '#ffd93d'], ['#4facfe', '#9d6bff'], ['#f093fb', '#f5576c']];

/** Fausse jaquette en image (la vraie grille attend une URL). */
function fakeCoverSrc(gameId: string): string {
  const [from, to] = SVG_COLORS[Number(gameId.slice(2)) % SVG_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const EMPTY_SET = new Set<string>();
const noop = () => undefined;

/** La vraie grille (GamesGrid) : le jeu importé s'insère en deuxième place, comme dans un tri par nom. */
function NewGameDemo() {
  const [ids, setIds] = useState(['RJ000001', 'RJ000002', 'RJ000003', 'RJ000004', 'RJ000005']);
  const [fresh, setFresh] = useState(EMPTY_SET);
  const importOne = () => {
    const id = `RJ${String(ids.length + 1).padStart(6, '0')}`;
    setIds(current => [current[0], id, ...current.slice(1)]);
    setFresh(new Set([id]));
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="p-1">
        <GamesGrid
          games={ids.map(id => ({ id, data: { work_name: `Jeu ${Number(id.slice(2))}` } }))}
          runningGames={EMPTY_SET}
          focusedGameId={null}
          blurAdultContent={false}
          revealedGames={EMPTY_SET}
          newGameIds={fresh}
          getWorkImageSrc={fakeCoverSrc}
          onOpenInfo={noop}
          onReveal={noop}
          onFocusGame={noop}
        />
      </div>
      <button type="button" className="btn self-start" disabled={ids.length >= 9} onClick={importOne}>
        Importer un jeu
      </button>
    </div>
  );
}

function LibraryBackDemo() {
  const [open, setOpen] = useState(false);
  const [back, setBack] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Stage>
        <div className={`grid h-full grid-cols-4 gap-3 p-3 ${back && !open ? 'anim-cascade-replay' : ''}`}>
          {COVERS.map((_, index) => (
            <FakeCover key={index} index={index} style={{ '--anim-back-i': index } as CSSProperties} />
          ))}
        </div>
        {open && (
          <div className="anim-page-in absolute inset-0 bg-bg">
            <div className="h-20" style={{ backgroundImage: COVERS[1] }} />
            <div className="m-3 h-4 w-40 rounded-sm bg-surface-3" />
          </div>
        )}
      </Stage>
      <button
        type="button"
        className="btn self-start"
        onClick={() => {
          setBack(open);
          setOpen(!open);
        }}
      >
        {open ? 'Retour à la bibliothèque' : 'Ouvrir un jeu'}
      </button>
    </div>
  );
}

function ShakeDemo() {
  const [refusals, setRefusals] = useState(0);
  return (
    <div className="flex flex-col items-start gap-3">
      <div key={refusals} className={`flex w-[240px] gap-2 ${refusals > 0 ? 'anim-shake' : ''}`}>
        <input type="password" className="input min-w-0 flex-1 text-center tracking-[0.3em]" defaultValue="1234" />
        <button type="button" className="btn btn-primary" onClick={() => setRefusals(count => count + 1)}>
          OK
        </button>
      </div>
      <span className="text-[12px] text-text-muted">Clique sur OK : le code est refusé.</span>
    </div>
  );
}

interface Item {
  id: string;
  title: string;
  where: string;
  /** Ce qu'il faut faire pour la voir, si « Rejouer » ne suffit pas. */
  hint?: string;
  demo: () => ReactNode;
}

const ITEMS: Item[] = [
  {
    id: 'card-in',
    title: 'Jaquettes en cascade',
    where: 'Bibliothèque : à l’affichage de la grille',
    demo: () => (
      <div className="grid grid-cols-4 gap-3">
        {COVERS.map((_, index) => (
          <FakeCover key={index} index={index} className="anim-card-in" style={rank(index)} />
        ))}
      </div>
    )
  },
  {
    id: 'card-new',
    title: 'Jeu ajouté à la bibliothèque',
    where: 'Bibliothèque : les jaquettes voisines glissent pour faire place, puis celle du jeu importé ou reçu apparaît avec son halo',
    hint: 'Clique sur « Importer un jeu ».',
    demo: () => <NewGameDemo />
  },
  {
    id: 'library-back',
    title: 'Retour à la bibliothèque',
    where: 'Bibliothèque, à la fermeture de la page d’un jeu',
    hint: 'Ouvre un jeu, puis reviens.',
    demo: () => <LibraryBackDemo />
  },
  {
    id: 'page-in',
    title: 'Ouverture de la page d’un jeu',
    where: 'Page de jeu',
    demo: () => (
      <Stage>
        <div className="anim-page-in absolute inset-0 bg-bg">
          <div className="h-20" style={{ backgroundImage: COVERS[1] }} />
          <div className="flex items-center gap-3 p-3">
            <div className="h-4 w-40 rounded-sm bg-surface-3" />
            <div className="ml-auto h-8 w-24 rounded-md bg-play" />
          </div>
          <div className="mx-3 h-3 w-64 rounded-sm bg-surface-2" />
        </div>
      </Stage>
    )
  },
  {
    id: 'modal',
    title: 'Fenêtres de dialogue',
    where: 'Mot de passe d’archive, jeux d’une collection, déplacement de la bibliothèque, assistant de premier lancement, visionneuse de captures',
    demo: () => (
      <Stage>
        <div className="anim-backdrop absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="panel flex w-64 flex-col gap-3 p-4">
            <div className="text-[14px] font-bold">Mot de passe requis</div>
            <div className="h-8 rounded-sm bg-bg-deep" />
            <div className="flex justify-end gap-2">
              <span className="btn btn-ghost py-1.5 text-[12px]">Passer</span>
              <span className="btn btn-primary py-1.5 text-[12px]">Valider</span>
            </div>
          </div>
        </div>
      </Stage>
    )
  },
  {
    id: 'toast',
    title: 'Notification',
    where: 'Proposition de mettre les archives importées à la corbeille',
    demo: () => (
      <Stage>
        <div className="panel anim-toast-in absolute bottom-3 right-3 w-60 p-3 text-[12px] shadow-2xl">
          Mettre l’archive importée à la corbeille ?
          <div className="mt-2 h-[3px] bg-accent" />
        </div>
      </Stage>
    )
  },
  {
    id: 'tab-pop',
    title: 'Onglet qui devient actif',
    where: 'Barre du haut, catégories de la bibliothèque',
    hint: 'Clique sur un autre onglet.',
    demo: () => <TabsDemo />
  },
  {
    id: 'shine',
    title: 'Reflet sur la jaquette',
    where: 'Toutes les jaquettes, au survol ou au focus (clavier, manette)',
    hint: 'Survole une jaquette.',
    demo: () => (
      <div className="grid grid-cols-3 gap-4 p-2">
        {[0, 1, 2].map(index => (
          <FakeCover key={index} index={index + 2} />
        ))}
      </div>
    )
  },
  {
    id: 'play-breathe',
    title: 'Bouton Jouer qui respire',
    where: 'Page de jeu, bouton au repos (s’arrête au survol et au focus)',
    demo: () => (
      <button type="button" className="btn btn-play">
        <Play size={18} strokeWidth={0} fill="currentColor" />
        Jouer
      </button>
    )
  },
  {
    id: 'play-running',
    title: 'Onde du bouton « En cours »',
    where: 'Page de jeu, pendant que le jeu tourne',
    demo: () => (
      <button type="button" className="btn btn-play is-running">
        En cours
      </button>
    )
  },
  {
    id: 'progress',
    title: 'Reflet des barres de progression',
    where: 'Import d’archives, téléchargement d’une mise à jour (barres fines du bas)',
    demo: () => (
      <div className="flex flex-col gap-4 py-4">
        <div className="h-1 bg-bg-deep">
          <div className="anim-progress h-full bg-accent" style={{ width: '62%' }} />
        </div>
        <div className="h-[3px] bg-bg-deep">
          <div className="anim-progress h-full bg-accent" style={{ width: '35%' }} />
        </div>
      </div>
    )
  },
  {
    id: 'image-in',
    title: 'Fondu des images du bandeau',
    where: 'Page de jeu, quand on change d’image',
    hint: 'Clique sur « Image suivante ».',
    demo: () => <ImageDemo />
  },
  {
    id: 'star-pop',
    title: 'Étoiles de la note',
    where: 'Page de jeu, filtre de note',
    hint: 'Clique sur une étoile plus haute.',
    demo: () => <StarsDemo />
  },
  {
    id: 'stagger',
    title: 'Blocs en cascade',
    where: 'Accueil (étagères et leurs jaquettes), Statistiques et Partage (blocs), Paramètres (menu et lignes de la section)',
    demo: () => (
      <div className="anim-stagger grid grid-cols-5 gap-3">
        {['Œuvres', 'Temps de jeu', 'Taille', 'La plus jouée', 'Dernier ajout'].map((kicker, index) => (
          <div key={kicker} className="panel flex flex-col gap-3 p-3">
            <div className="section-title">{kicker}</div>
            <div className="text-[24px] font-extrabold leading-none">{[128, '412 h', '86 Go', '—', '—'][index]}</div>
          </div>
        ))}
      </div>
    )
  },
  {
    id: 'section-in',
    title: 'Changement de section',
    where: 'Paramètres',
    hint: 'Clique sur une autre section.',
    demo: () => <SectionDemo />
  },
  {
    id: 'bar-grow',
    title: 'Barres qui se remplissent',
    where: 'Statistiques (tags, catégories, cercles)',
    demo: () => (
      <div className="flex flex-col gap-2.5">
        {[92, 68, 41, 17].map(width => (
          <div key={width} className="relative h-2 overflow-hidden rounded-full bg-bg-deep">
            <div className="anim-bar-grow absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-accent-hover" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    )
  },
  {
    id: 'shake',
    title: 'Code refusé',
    where: 'Écran de verrouillage',
    hint: 'Clique sur OK.',
    demo: () => <ShakeDemo />
  },
  {
    id: 'drop-in',
    title: 'Zone de dépôt',
    where: 'Bibliothèque, quand on y glisse des archives',
    demo: () => (
      <Stage>
        <div className="anim-drop-in absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent bg-bg-deep/85 text-center">
          <PackagePlus size={32} strokeWidth={1.75} className="text-accent" />
          <p className="m-0 text-[13px] font-bold">Dépose les archives pour les importer</p>
        </div>
      </Stage>
    )
  },
  {
    id: 'live',
    title: 'Onde des pastilles d’activité',
    where: 'Badge « En cours » d’une jaquette, pastille de réception de l’onglet Partage',
    demo: () => (
      <div className="flex items-center gap-8 p-3">
        <span className="anim-live flex items-center gap-1 rounded-sm bg-play px-2 py-0.5 text-[11px] font-bold text-white">
          <Play size={10} strokeWidth={0} fill="currentColor" />
          En cours
        </span>
        <span className="anim-live h-2 w-2 rounded-full bg-play" />
      </div>
    )
  }
];

function loadVerdicts(): Record<string, Verdict> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Verdict>) : {};
  } catch {
    return {};
  }
}

export default function AnimationGallery({ onClose }: { onClose: () => void }) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(loadVerdicts);
  const [replays, setReplays] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(verdicts));
    } catch {
      // Stockage indisponible : les verdicts ne tiennent que le temps de la session.
    }
  }, [verdicts]);

  const judge = (id: string, verdict: Verdict) =>
    setVerdicts(current => {
      const next = { ...current };
      if (next[id] === verdict) delete next[id];
      else next[id] = verdict;
      return next;
    });

  const idsOf = (verdict: Verdict | undefined) => ITEMS.filter(item => verdicts[item.id] === verdict).map(item => item.id);
  const summary = [
    `Garder : ${idsOf('keep').join(', ') || '—'}`,
    `Retirer : ${idsOf('drop').join(', ') || '—'}`,
    `Pas encore jugées : ${idsOf(undefined).join(', ') || '—'}`
  ].join('\n');

  const copy = () => {
    navigator.clipboard
      .writeText(summary)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-bg px-6 pb-10 pt-5">
      <div className="mb-5 flex items-center gap-4">
        <div>
          <h1 className="m-0">Animations à valider</h1>
          <p className="m-0 text-[13px] text-text-muted">
            {ITEMS.length} animations, {idsOf('keep').length} gardées, {idsOf('drop').length} à retirer. Elles sont déjà en place dans l’application.
          </p>
        </div>
        <button type="button" className="btn ml-auto" onClick={onClose}>
          <X size={16} strokeWidth={2.25} />
          Fermer
        </button>
      </div>

      <div className="grid gap-4 min-[1100px]:grid-cols-2">
        {ITEMS.map((item, index) => {
          const verdict = verdicts[item.id];
          return (
            <section
              key={item.id}
              className={`panel flex flex-col gap-3 p-4 ${verdict === 'keep' ? 'ring-2 ring-play' : verdict === 'drop' ? 'opacity-60 ring-2 ring-danger' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold">
                    {index + 1}. {item.title} <code className="ml-1 text-[12px] font-normal text-text-muted">{item.id}</code>
                  </div>
                  <div className="text-[12px] text-text-muted">{item.where}</div>
                  {item.hint && <div className="text-[12px] text-accent-text">{item.hint}</div>}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost py-1.5 text-[12px]"
                  onClick={() => setReplays(current => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }))}
                >
                  <RotateCcw size={14} strokeWidth={2.25} />
                  Rejouer
                </button>
              </div>

              <div key={replays[item.id] ?? 0} className="min-h-[60px]">
                {item.demo()}
              </div>

              <div className="mt-auto flex gap-2">
                <button type="button" aria-pressed={verdict === 'keep'} className={`btn py-1.5 text-[12px] ${verdict === 'keep' ? 'bg-play text-white' : ''}`} onClick={() => judge(item.id, 'keep')}>
                  <Check size={14} strokeWidth={2.5} />
                  Garder
                </button>
                <button type="button" aria-pressed={verdict === 'drop'} className={`btn py-1.5 text-[12px] ${verdict === 'drop' ? 'bg-danger text-white' : ''}`} onClick={() => judge(item.id, 'drop')}>
                  <X size={14} strokeWidth={2.5} />
                  Retirer
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <div className="panel mt-5 flex flex-col gap-3 p-4">
        <div className="section-title">Bilan à me renvoyer</div>
        <textarea readOnly value={summary} className="input font-mono text-[12px]" rows={3} />
        <button type="button" className="btn btn-primary self-start" onClick={copy}>
          {copied ? 'Copié' : 'Copier le bilan'}
        </button>
      </div>
    </div>
  );
}
