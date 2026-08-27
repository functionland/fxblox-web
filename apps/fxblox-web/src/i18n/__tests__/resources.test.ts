import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { GROUP_FILES, resources } from '@/i18n/resources';

const SHELL_KEYS = [
  'shell.nav.blox',
  'shell.nav.settings',
  'shell.setup.deepLinkBanner',
  'shell.settings.select',
  'shell.notFound.title',
  'shell.version',
  'settings.menu.pools',
  'settings.logout.title',
  'setup.steps.welcome',
  'main.screens.blox',
  // mobile keys still present after the merge
  'currentBloxIndicator.connected',
  'welcome.title',
];

describe('i18n resources', () => {
  it('merges the four group files into the translation namespace for en and zh', () => {
    for (const group of GROUP_FILES) {
      expect(resources.en.translation).toHaveProperty(group);
      expect(resources.zh.translation).toHaveProperty(group);
    }
  });

  it('resolves shell keys in en and zh (zh falls back to en for anything missing)', () => {
    const en = i18n.getFixedT('en');
    const zh = i18n.getFixedT('zh');
    for (const key of SHELL_KEYS) {
      expect(en(key), key).not.toBe(key);
      expect(zh(key), key).not.toBe(key);
    }
    expect(en('shell.comingSoon', { name: 'Pools' })).toBe('Pools — coming soon');
    expect(zh('shell.nav.settings')).toBe('设置');
  });
});
