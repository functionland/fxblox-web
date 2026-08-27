import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TestProviders } from '@/test/helpers/renderWithProviders';
import { BottomTabs } from '@/app/shells/BottomTabs';
import { Sidebar } from '@/app/shells/Sidebar';
import { PRIMARY_TABS } from '@/app/shells/tabs';

const ORDER = ['blox', 'users', 'plugins', 'bloxAi', 'devices', 'settings'];
const LABELS = ['Blox', 'Users', 'Plugins', 'Blox AI', 'Devices', 'Settings'];

const CASES: [string, string][] = [
  ['/blox', 'blox'],
  ['/blox/manage', 'blox'],
  ['/users', 'users'],
  ['/plugins', 'plugins'],
  ['/plugins/blox-ai', 'plugins'],
  ['/blox-ai', 'bloxAi'],
  ['/devices', 'devices'],
  ['/settings', 'settings'],
  ['/settings/pools/1/join-requests', 'settings'],
];

function renderNav(path: string, Nav: typeof BottomTabs | typeof Sidebar) {
  render(
    <TestProviders>
      <MemoryRouter initialEntries={[path]}>
        <Nav />
      </MemoryRouter>
    </TestProviders>,
  );
  return within(screen.getByRole('navigation', { name: 'Primary' }));
}

describe('primary tabs', () => {
  it('are the six mobile tabs in mobile order with Plugins in the centre', () => {
    expect(PRIMARY_TABS.map((t) => t.id)).toEqual(ORDER);
    expect(PRIMARY_TABS[2]!.center).toBe(true);
  });
});

describe.each([
  ['BottomTabs', BottomTabs],
  ['Sidebar', Sidebar],
] as const)('%s', (_name, Nav) => {
  it('renders the six items with accessible names in order', () => {
    const nav = renderNav('/blox', Nav);
    const links = nav.getAllByRole('link');
    expect(links).toHaveLength(6);
    expect(links.map((l) => l.getAttribute('data-tab'))).toEqual(ORDER);
    LABELS.forEach((label) => expect(nav.getByRole('link', { name: label })).toBeInTheDocument());
  });

  it.each(CASES)('at %s marks %s as the current page', (path, active) => {
    const nav = renderNav(path, Nav);
    const links = nav.getAllByRole('link');
    for (const link of links) {
      const isActive = link.getAttribute('data-tab') === active;
      if (isActive) expect(link).toHaveAttribute('aria-current', 'page');
      else expect(link).not.toHaveAttribute('aria-current');
    }
  });

  it('marks no tab on a setup route', () => {
    const nav = renderNav('/setup/welcome', Nav);
    for (const link of nav.getAllByRole('link')) expect(link).not.toHaveAttribute('aria-current');
  });
});
