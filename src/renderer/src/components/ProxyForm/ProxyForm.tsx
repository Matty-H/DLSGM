import type { ProxyForm as ProxyFormValue, ProxyType } from '../../lib/proxyForm.js';
import { msg, t, tr } from '../../lib/i18n.js';

export interface ProxyFormProps {
  value: ProxyFormValue;
  onChange: (value: ProxyFormValue) => void;
  /** Type de l'adresse enregistrée : https / socks4 restent proposés pour ne pas la changer en douce. */
  storedType: ProxyType;
}

const TYPE_LABELS: Record<ProxyType, string> = {
  '': msg('Aucun'),
  http: 'HTTP',
  socks5: 'SOCKS5',
  https: 'HTTPS',
  socks4: 'SOCKS4'
};

/** Proxy DLsite en champs séparés (type, hôte, port, identifiant, mot de passe). */
export default function ProxyForm({ value, onChange, storedType }: ProxyFormProps) {
  const types: ProxyType[] = ['', 'http', 'socks5'];
  if ((storedType === 'https' || storedType === 'socks4') && !types.includes(storedType)) types.push(storedType);
  const set = (patch: Partial<ProxyFormValue>) => onChange({ ...value, ...patch });
  const disabled = value.type === '';
  const credentialsDisabled = disabled || value.type === 'socks4';

  return (
    <div className="flex flex-col gap-2">
      <div className="seg self-start" role="group" aria-label={t('Type de proxy')}>
        {types.map(type => (
          <button key={type || 'none'} type="button" aria-pressed={value.type === type} onClick={() => set({ type })} className="seg-opt">
            {tr(TYPE_LABELS[type])}
          </button>
        ))}
      </div>
      {!disabled && (
        <>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t('Hôte (ex: jp.proxy.exemple ou 1.2.3.4)')}
              aria-label={t('Hôte du proxy')}
              spellCheck={false}
              value={value.host}
              onChange={e => set({ host: e.target.value })}
            />
            <input
              className="input w-[100px]"
              placeholder={t('Port')}
              aria-label={t('Port du proxy')}
              inputMode="numeric"
              value={value.port}
              onChange={e => set({ port: e.target.value.replace(/\D/g, '').slice(0, 5) })}
            />
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t('Identifiant (facultatif)')}
              aria-label={t('Identifiant du proxy')}
              autoComplete="off"
              spellCheck={false}
              disabled={credentialsDisabled}
              value={value.username}
              onChange={e => set({ username: e.target.value })}
            />
            <input
              className="input flex-1"
              type="password"
              placeholder={value.hasStoredPassword ? t('Enregistré (vide = inchangé)') : t('Mot de passe (facultatif)')}
              aria-label={t('Mot de passe du proxy')}
              autoComplete="new-password"
              disabled={credentialsDisabled}
              value={value.password}
              onChange={e => set({ password: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
