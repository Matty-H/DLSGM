import { describe, expect, it } from 'vitest';
import { Pia, type Runner } from '../../src/main/pia';

/** Faux piactl : garde un état (région, connexion) et journalise les commandes. */
function fakePiactl(initial: { region: string; state: string }, options: { connectFails?: boolean } = {}) {
  const state = { ...initial };
  const log: string[] = [];
  const runner: Runner = async args => {
    log.push(args.join(' '));
    const [command, arg, value] = args;
    if (command === 'get' && arg === 'region') return state.region;
    if (command === 'get' && arg === 'connectionstate') return state.state;
    if (command === 'get' && arg === 'regions') return 'auto jp-tokyo jp-streaming-optimized netherlands';
    if (command === 'set' && arg === 'region') {
      state.region = value;
      return '';
    }
    if (command === 'connect') {
      if (options.connectFails) throw new Error('Daemon inactive');
      state.state = 'Connected';
      return '';
    }
    if (command === 'disconnect') {
      state.state = 'Disconnected';
      return '';
    }
    throw new Error(`commande inattendue : ${args.join(' ')}`);
  };
  return { runner, state, log };
}

const fast = { poll: 1, settle: 0, connectTimeout: 50 };

describe('Pia', () => {
  it("connecte à la région demandée puis remet l'état d'avant (déconnecté, autre région)", async () => {
    const pia = fakePiactl({ region: 'netherlands', state: 'Disconnected' });
    const client = new Pia(pia.runner, fast);
    await client.begin('jp-tokyo');
    expect(pia.state).toEqual({ region: 'jp-tokyo', state: 'Connected' });
    await client.end();
    expect(pia.state).toEqual({ region: 'netherlands', state: 'Disconnected' });
    expect(client.active).toBe(false);
  });

  it("reste connecté à la fin si l'utilisateur l'était déjà, sur sa région", async () => {
    const pia = fakePiactl({ region: 'netherlands', state: 'Connected' });
    const client = new Pia(pia.runner, fast);
    await client.begin('jp-tokyo');
    await client.end();
    expect(pia.state).toEqual({ region: 'netherlands', state: 'Connected' });
  });

  it('ne touche à rien si PIA est déjà connecté au Japon', async () => {
    const pia = fakePiactl({ region: 'jp-tokyo', state: 'Connected' });
    const client = new Pia(pia.runner, fast);
    await client.begin('jp-tokyo');
    await client.end();
    expect(pia.log.filter(c => !c.startsWith('get'))).toEqual([]);
  });

  it('les sessions imbriquées ne restaurent qu’à la fin de la dernière', async () => {
    const pia = fakePiactl({ region: 'netherlands', state: 'Disconnected' });
    const client = new Pia(pia.runner, fast);
    await Promise.all([client.begin('jp-tokyo'), client.begin('jp-tokyo')]);
    await client.end();
    expect(pia.state.state).toBe('Connected');
    await client.end();
    expect(pia.state).toEqual({ region: 'netherlands', state: 'Disconnected' });
  });

  it("échoue clairement si PIA ne peut pas se connecter, et remet la région d'avant", async () => {
    const pia = fakePiactl({ region: 'netherlands', state: 'Disconnected' }, { connectFails: true });
    const client = new Pia(pia.runner, fast);
    await expect(client.begin('jp-tokyo')).rejects.toThrow(/Connexion PIA impossible.*application PIA doit être ouverte/);
    expect(pia.state.region).toBe('netherlands');
    expect(client.active).toBe(false);
  });

  it('refuse une région qui ne ressemble pas à un identifiant PIA', async () => {
    const client = new Pia(fakePiactl({ region: 'auto', state: 'Disconnected' }).runner, fast);
    await expect(client.begin('jp-tokyo; rm -rf')).rejects.toThrow(/Région PIA invalide/);
  });

  it('signale PIA absent', async () => {
    const client = new Pia(null, fast);
    expect(await client.status()).toMatchObject({ available: false });
    await expect(client.begin('jp-tokyo')).rejects.toThrow(/introuvable/);
  });
});
