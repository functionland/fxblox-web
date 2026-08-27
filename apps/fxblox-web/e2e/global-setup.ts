// Starts the fake Blox once for the whole run; the returned function is Playwright's global teardown.
import { startFakeBlox } from './fixtures/fakeBlox';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const fake = await startFakeBlox();
  console.log(`[e2e] fake-blox ${fake.owned ? 'started' : 'reused'} at ${fake.wapUrl}`);
  return async () => {
    await fake.stop();
  };
}
