import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  findAuthorizedBlox: vi.fn(),
  rememberedLanIp: vi.fn(),
  loadManualBloxIp: vi.fn(),
}));
vi.mock('@/utils/lanIpCache', () => ({
  findAuthorizedBlox: h.findAuthorizedBlox,
  rememberedLanIp: h.rememberedLanIp,
}));
vi.mock('@/utils/manualBloxIp', () => ({ loadManualBloxIp: h.loadManualBloxIp }));

import { buildNasAddresses, defaultNasDevice, isNetbiosName, resolveNasIp } from '../nasAddress';

describe('defaultNasDevice', () => {
  it('maps the OS to a device tab; an iPad (Mac user agent + touch) gets iPhone/iPad', () => {
    expect(defaultNasDevice('windows', 0)).toBe('windows');
    expect(defaultNasDevice('macos', 0)).toBe('mac');
    expect(defaultNasDevice('macos', 5)).toBe('ios');
    expect(defaultNasDevice('ios', 5)).toBe('ios');
    expect(defaultNasDevice('android', 5)).toBe('android');
    expect(defaultNasDevice('linux', 0)).toBe('windows');
    expect(defaultNasDevice('unknown', 0)).toBe('windows');
  });
});

describe('isNetbiosName', () => {
  it('accepts 1–15 letters, digits and hyphens only', () => {
    expect(isNetbiosName('fxblox-rk1')).toBe(true);
    expect(isNetbiosName('a-very-long-hostname')).toBe(false);
    expect(isNetbiosName('fxblox.local')).toBe(false);
    expect(isNetbiosName('')).toBe(false);
    expect(isNetbiosName(undefined)).toBe(false);
  });
});

describe('buildNasAddresses', () => {
  it('one Blox: Windows uses the name, the others use the IP; the alternatives are the other forms', () => {
    const a = buildNasAddresses({ hostname: 'fxblox-rk1', share: 'SharedFolder', ip: '192.168.1.50', bloxCount: 1 });
    expect(a.windows).toBe('\\\\FXBLOX-RK1\\SharedFolder');
    expect(a.windowsAlt).toBe('\\\\192.168.1.50\\SharedFolder');
    expect(a.smb).toBe('smb://192.168.1.50/SharedFolder');
    expect(a.smbAlt).toBe('smb://fxblox-rk1/SharedFolder');
    expect(a.server).toBe('192.168.1.50');
    expect(a.ipKnown).toBe(true);
  });

  it('several Blox (names may clash) or a name Windows cannot use: the IP wins on Windows too', () => {
    expect(buildNasAddresses({ hostname: 'fxblox-rk1', ip: '192.168.1.50', bloxCount: 2 }).windows).toBe(
      '\\\\192.168.1.50\\SharedFolder',
    );
    expect(
      buildNasAddresses({ hostname: 'my-very-long-blox-name', ip: '192.168.1.50', bloxCount: 1 }).windows,
    ).toBe('\\\\192.168.1.50\\SharedFolder');
  });

  it('IP unknown: the name form everywhere, never .local', () => {
    const a = buildNasAddresses({ hostname: 'fxblox-rk1', share: 'SharedFolder', ip: null, bloxCount: 1 });
    expect(a.windows).toBe('\\\\FXBLOX-RK1\\SharedFolder');
    expect(a.windowsAlt).toBeUndefined();
    expect(a.smb).toBe('smb://fxblox-rk1/SharedFolder');
    expect(a.smbAlt).toBeUndefined();
    expect(a.ipKnown).toBe(false);
    expect(JSON.stringify(a)).not.toContain('.local');
  });

  it('ignores a public IP, a hostile hostname and a share with slashes', () => {
    const a = buildNasAddresses({ hostname: 'evil/../x', share: '../etc', ip: '8.8.8.8', bloxCount: 1 });
    expect(a.ipKnown).toBe(false);
    expect(a.share).toBe('SharedFolder');
    expect(a.windows).toBe('');
    expect(a.smb).toBe('');
  });
});

describe('resolveNasIp', () => {
  beforeEach(() => {
    h.findAuthorizedBlox.mockReset().mockReturnValue(null);
    h.rememberedLanIp.mockReset().mockResolvedValue(null);
    h.loadManualBloxIp.mockReset().mockResolvedValue(null);
  });

  it('prefers a fresh record, then a typed IP, then the remembered one', async () => {
    h.findAuthorizedBlox.mockReturnValue({ service: { txt: { ipAddress: '192.168.1.10' } }, observedAt: 0 });
    h.loadManualBloxIp.mockResolvedValue('192.168.1.20');
    h.rememberedLanIp.mockResolvedValue({ ip: '192.168.1.30' });
    await expect(resolveNasIp('p1', 'app')).resolves.toEqual({ ip: '192.168.1.10', source: 'fresh' });

    h.findAuthorizedBlox.mockReturnValue(null);
    await expect(resolveNasIp('p1', 'app')).resolves.toEqual({ ip: '192.168.1.20', source: 'manual' });

    h.loadManualBloxIp.mockResolvedValue(null);
    await expect(resolveNasIp('p1', 'app')).resolves.toEqual({ ip: '192.168.1.30', source: 'remembered' });
  });

  it('never returns a non-private address; nothing known → null', async () => {
    h.findAuthorizedBlox.mockReturnValue({ service: { host: 'fxblox-rk1.local' }, observedAt: 0 });
    h.loadManualBloxIp.mockResolvedValue('8.8.8.8');
    h.rememberedLanIp.mockRejectedValue(new Error('idb'));
    await expect(resolveNasIp('p1', 'app')).resolves.toBeNull();
    await expect(resolveNasIp('', 'app')).resolves.toBeNull();
  });
});
