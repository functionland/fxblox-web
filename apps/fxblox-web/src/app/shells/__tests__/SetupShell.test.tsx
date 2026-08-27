import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestProviders } from '@/test/helpers/renderWithProviders';
import { SetupFooter, SetupShell } from '@/app/shells/SetupShell';
import { clearDeepLinkStash, stashDeepLink } from '@/app/deepLinkStash';
import { useBloxsStore, useUserProfileStore } from '@/stores';

function FooterUser() {
  return (
    <div>
      <p>wifi body</p>
      <SetupFooter>
        <button type="button">Continue from footer</button>
      </SetupFooter>
    </div>
  );
}

const routes: RouteObject[] = [
  {
    path: '/setup',
    element: <SetupShell />,
    children: [
      { path: 'welcome', element: <p>welcome body</p>, handle: { progress: 0 } },
      { path: 'link-password', element: <p>password body</p>, handle: { progress: 20 } },
      { path: 'connect-wifi', element: <FooterUser />, handle: { progress: 80 } },
    ],
  },
];

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <TestProviders>
      <RouterProvider router={router} />
    </TestProviders>,
  );
  return router;
}

describe('SetupShell', () => {
  beforeEach(() => {
    clearDeepLinkStash();
    useUserProfileStore.setState({ appPeerId: undefined });
    useBloxsStore.setState({ bloxs: {} });
  });

  it('hides the progress bar at 0 and shows the route handle progress otherwise', async () => {
    const router = renderAt('/setup/welcome');
    expect(await screen.findByText('welcome body')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    await act(async () => {
      await router.navigate('/setup/link-password');
    });
    expect(await screen.findByText('password body')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    await act(async () => {
      await router.navigate('/setup/connect-wifi');
    });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
  });

  it('renders SetupFooter children into the sticky footer slot', async () => {
    renderAt('/setup/connect-wifi');
    expect(await screen.findByText('wifi body')).toBeInTheDocument();
    const slot = screen.getByTestId('setup-footer-slot');
    expect(slot).toContainElement(screen.getByRole('button', { name: 'Continue from footer' }));
  });

  it('shows the language selector, the version and no "Back to app" when not set up', async () => {
    renderAt('/setup/welcome');
    expect(await screen.findByTestId('language-selector')).toBeInTheDocument();
    expect(screen.getByTestId('app-version')).toHaveTextContent('App version 0.0.1-test #test');
    expect(screen.queryByTestId('back-to-app')).toBeNull();
  });

  it('shows "Back to app" when already set up', async () => {
    useUserProfileStore.setState({ appPeerId: 'peer' });
    useBloxsStore.setState({ bloxs: { b: { peerId: 'b', name: 'B' } } });
    renderAt('/setup/welcome');
    expect(await screen.findByTestId('back-to-app')).toHaveAttribute('href', '/blox');
  });

  it('shows the FxFiles banner while a deep link is stashed', async () => {
    stashDeepLink('/autopin-pair?token=1');
    renderAt('/setup/welcome');
    expect(await screen.findByTestId('deep-link-banner')).toHaveTextContent(
      "You'll return to FxFiles pairing after setup.",
    );
  });
});
