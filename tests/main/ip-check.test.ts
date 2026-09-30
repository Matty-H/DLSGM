import { describe, expect, it } from 'vitest';
import type { NetworkInterfaceInfo } from 'os';
import { checkIp, lanAddresses } from '../../src/main/ip-check';

const iface = (address: string, family: 'IPv4' | 'IPv6', internal = false) =>
  ({ address, family, internal, netmask: '', mac: '', cidr: null }) as unknown as NetworkInterfaceInfo;

describe('lanAddresses', () => {
  it('garde les IPv4 non internes, avec le nom de chaque interface', () => {
    expect(
      lanAddresses({
        Ethernet: [iface('192.168.1.20', 'IPv4'), iface('fe80::1', 'IPv6')],
        'PIA - WireGuard': [iface('10.12.0.5', 'IPv4')],
        'Loopback Pseudo-Interface 1': [iface('127.0.0.1', 'IPv4', true)]
      })
    ).toEqual([
      { interface: 'Ethernet', address: '192.168.1.20' },
      { interface: 'PIA - WireGuard', address: '10.12.0.5' }
    ]);
  });
});

describe('checkIp', () => {
  it("renvoie l'IP publique et sa localisation", async () => {
    const result = await checkIp(async () =>
      new Response(JSON.stringify({ ip: '203.0.113.7', city: 'Tokyo', region: 'Tokyo', country: 'JP', org: 'AS0 Exemple' }))
    );
    expect(result.wan).toEqual({ ip: '203.0.113.7', city: 'Tokyo', region: 'Tokyo', country: 'JP', org: 'AS0 Exemple' });
  });

  it('signale une erreur WAN sans perdre les adresses LAN', async () => {
    const result = await checkIp(async () => {
      throw new Error('net::ERR_INTERNET_DISCONNECTED');
    });
    expect(result.wan).toBeUndefined();
    expect(result.wanError).toMatch(/ERR_INTERNET_DISCONNECTED/);
    expect(Array.isArray(result.lan)).toBe(true);
  });
});
