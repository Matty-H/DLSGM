import { useEffect, useState } from 'react';
import { KeyRound, Lock, VenetianMask } from 'lucide-react';
import type { AppLockKind, AppLockStatus } from '../../../../shared/ipc-types';
import { appLockSecretError } from '../../lib/appLock.js';
import { ipcErrorMessage } from '../../lib/gameTools.js';
import { t } from '../../lib/i18n.js';

/** Formulaire ouvert : activer, changer le code, désactiver, définir ou retirer le leurre. */
type Action = 'enable' | 'change' | 'disable' | 'decoy' | 'remove-decoy';

/**
 * Paramètres › Verrouillage (src/main/app-lock.ts) : code demandé au
 * démarrage, et leurre facultatif qui ouvre une bibliothèque séparée.
 * Appliqué tout de suite (pas de bouton « Enregistrer ») ; toute
 * modification redemande le code actuel.
 */
export default function AppLockSettings() {
  const [status, setStatus] = useState<AppLockStatus | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [kind, setKind] = useState<AppLockKind>('pin');
  const [current, setCurrent] = useState('');
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    window.electronAPI
      .getAppLock()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, kind: 'pin', decoy: false }));

  useEffect(() => {
    void refresh();
  }, []);

  const open = (next: Action | null) => {
    setAction(next);
    setKind(status?.kind ?? 'pin');
    setCurrent('');
    setSecret('');
    setConfirm('');
    setError(null);
    setNotice(null);
  };

  if (!status) return null;

  const needsCurrent = action !== null && action !== 'enable';
  const needsNew = action === 'enable' || action === 'change' || action === 'decoy';
  // Format du nouveau code : choisi pour le vrai code, imposé (celui du vrai) pour le leurre.
  const newKind = action === 'decoy' ? status.kind : kind;

  const submit = async () => {
    if (needsNew) {
      const problem = appLockSecretError(newKind, secret);
      if (problem) return setError(problem);
      if (secret !== confirm) return setError(t('Les deux saisies ne correspondent pas.'));
    }
    setBusy(true);
    setError(null);
    try {
      let message: string;
      if (action === 'enable' || action === 'change') {
        const { decoyRemoved } = await window.electronAPI.setAppLock({ current: needsCurrent ? current : undefined, kind, secret });
        message = action === 'enable' ? t('Verrouillage activé : le code sera demandé au prochain démarrage.') : t('Code changé.');
        if (decoyRemoved) message += ` ${t('Le leurre a été retiré (il doit avoir le même format que le code).')}`;
      } else if (action === 'disable') {
        await window.electronAPI.disableAppLock(current);
        message = t('Verrouillage désactivé.');
      } else if (action === 'decoy') {
        await window.electronAPI.setAppLockDecoy({ current, decoy: secret });
        message = t('Leurre enregistré.');
      } else {
        await window.electronAPI.setAppLockDecoy({ current, decoy: null });
        message = t('Leurre retiré. Sa bibliothèque reste sur le disque.');
      }
      open(null);
      setNotice(message);
      await refresh();
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const codeInput = (value: string, onChange: (value: string) => void, label: string, codeKind: AppLockKind, autoFocus = false) => (
    <label className="flex items-center justify-between gap-6 py-2">
      <span className="text-[14px]">{label}</span>
      <input
        type="password"
        inputMode={codeKind === 'pin' ? 'numeric' : undefined}
        autoComplete="new-password"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        onChange={event => onChange(codeKind === 'pin' ? event.target.value.replace(/\D/g, '') : event.target.value)}
        maxLength={codeKind === 'pin' ? 12 : 128}
        className="input w-[240px]"
      />
    </label>
  );

  const titles: Record<Action, string> = {
    enable: t('Activer le verrouillage'),
    change: t('Changer le code'),
    disable: t('Désactiver le verrouillage'),
    decoy: status.decoy ? t('Changer le leurre') : t('Définir un leurre'),
    'remove-decoy': t('Retirer le leurre')
  };

  return (
    <>
      <div className="mt-4 rounded-md bg-bg-deep px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
        {t("Un écran de confidentialité, pas un chiffrement : les fichiers de DLSGM et les jeux restent lisibles sur le disque par qui y a accès. Le code n'est jamais enregistré en clair. En cas d'oubli, supprimer app-lock.json dans le dossier de données de DLSGM retire le verrouillage.")}
      </div>

      <section className="my-4 rounded-md border border-divider px-4 pb-1 pt-3">
        <div className={`flex items-center justify-between gap-6 pb-3 ${status.enabled ? 'border-b border-divider' : ''}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[15px] font-semibold">
              <Lock size={17} strokeWidth={2.25} className="text-accent" />
              {t('Verrouiller DLSGM au démarrage')}
            </div>
            <div className="mt-1 text-[13px] leading-relaxed text-text-muted">
              {status.enabled
                ? status.kind === 'pin'
                  ? t('Activé : un code PIN est demandé à chaque démarrage.')
                  : t('Activé : un mot de passe est demandé à chaque démarrage.')
                : t('Demande un code PIN (chiffres) ou un mot de passe avant d’ouvrir la bibliothèque.')}
            </div>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            {status.enabled ? (
              <>
                <button type="button" className="btn" onClick={() => open('change')}>
                  <KeyRound size={15} strokeWidth={2.25} />
                  {t('Changer le code')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => open('disable')}>
                  {t('Désactiver')}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => open('enable')}>
                {t('Activer')}
              </button>
            )}
          </div>
        </div>

        {status.enabled && (
          <div className="flex items-center justify-between gap-6 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[14px] font-semibold">
                <VenetianMask size={16} strokeWidth={2.25} className="text-accent" />
                {t('Mot de passe leurre')}
              </div>
              <div className="mt-1 text-[13px] leading-relaxed text-text-muted">
                {t("Un second code qui ouvre une autre bibliothèque : un profil séparé, avec ses propres réglages, son dossier de jeux et ses fiches, sans rien du vrai. Démarre DLSGM avec ce code pour la remplir (par exemple avec un dossier de jeux tout public). Rien dans le profil leurre ne montre que le vrai existe.")}
              </div>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <button type="button" className="btn" onClick={() => open('decoy')}>
                {status.decoy ? t('Changer') : t('Définir')}
              </button>
              {status.decoy && (
                <button type="button" className="btn btn-ghost" onClick={() => open('remove-decoy')}>
                  {t('Retirer')}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {action && (
        <form
          className="panel mb-4 border border-divider px-4 py-3"
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <h3 className="mb-2 mt-0 text-[15px] font-bold">{titles[action]}</h3>
          {needsCurrent && codeInput(current, setCurrent, t('Code actuel'), status.kind, true)}
          {(action === 'enable' || action === 'change') && (
            <div className="flex items-center justify-between gap-6 py-2">
              <span className="text-[14px]">{t('Format')}</span>
              <div className="flex gap-2" role="radiogroup" aria-label={t('Format')}>
                {(['pin', 'password'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={kind === option}
                    className={`btn ${kind === option ? 'btn-primary' : ''}`}
                    onClick={() => {
                      setKind(option);
                      setSecret('');
                      setConfirm('');
                    }}
                  >
                    {option === 'pin' ? t('Code PIN') : t('Mot de passe')}
                  </button>
                ))}
              </div>
            </div>
          )}
          {needsNew && (
            <>
              {codeInput(secret, setSecret, action === 'decoy' ? t('Nouveau leurre') : t('Nouveau code'), newKind, action === 'enable')}
              {codeInput(confirm, setConfirm, t('Confirmer'), newKind)}
              <div className="pb-1 text-[12px] text-text-muted">
                {newKind === 'pin' ? t('4 à 12 chiffres.') : t('4 à 128 caractères.')}
                {action === 'change' && status.decoy && kind !== status.kind && ` ${t('Changer de format retire le leurre.')}`}
              </div>
            </>
          )}
          {error && <div className="py-1 text-[13px] text-danger">{error}</div>}
          <div className="flex justify-end gap-2 py-2">
            <button type="button" className="btn btn-ghost" onClick={() => open(null)} disabled={busy}>
              {t('Annuler')}
            </button>
            <button type="submit" className={`btn ${action === 'disable' || action === 'remove-decoy' ? '' : 'btn-primary'}`} disabled={busy}>
              {titles[action]}
            </button>
          </div>
        </form>
      )}
      {notice && <div className="mb-4 text-[13px] text-text-secondary">{notice}</div>}
    </>
  );
}
