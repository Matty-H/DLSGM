import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';
import { isAppUrl, isTrustedSender } from '../../src/main/ipc-guard';

const index = path.resolve('app', 'src', 'renderer', 'dist', 'index.html');
const indexUrl = pathToFileURL(index).toString();

describe('isAppUrl', () => {
  it('reconnaît le renderer buildé, quelle que soit la route', () => {
    expect(isAppUrl(indexUrl, index)).toBe(true);
    expect(isAppUrl(`${indexUrl}#overlay`, index)).toBe(true);
    expect(isAppUrl(`${indexUrl}#clicker-hud`, index)).toBe(true);
  });

  it('refuse un autre fichier local et les sites externes', () => {
    expect(isAppUrl(pathToFileURL(path.resolve('Downloads', 'index.html')).toString(), index)).toBe(false);
    expect(isAppUrl('https://www.dlsite.com/', index)).toBe(false);
    expect(isAppUrl('https://fr.wikipedia.org/wiki/Spécial:Page_au_hasard', index)).toBe(false);
    expect(isAppUrl('about:blank', index)).toBe(false);
    expect(isAppUrl('pas une adresse', index)).toBe(false);
  });

  it('accepte le serveur de dev Vite seulement s’il est fourni', () => {
    expect(isAppUrl('http://localhost:5173/#overlay', index, 'http://localhost:5173')).toBe(true);
    expect(isAppUrl('http://localhost:5173/', index)).toBe(false);
    expect(isAppUrl('http://localhost:5174/', index, 'http://localhost:5173')).toBe(false);
  });
});

describe('isTrustedSender', () => {
  const isApp = (url: string) => isAppUrl(url, index);

  it('cadre principal d’une page de DLSGM uniquement', () => {
    expect(isTrustedSender({ url: indexUrl, parent: null }, isApp)).toBe(true);
    expect(isTrustedSender({ url: indexUrl, parent: {} }, isApp)).toBe(false);
    expect(isTrustedSender({ url: 'https://fr.wikipedia.org/', parent: {} }, isApp)).toBe(false);
    expect(isTrustedSender(null, isApp)).toBe(false);
  });
});
