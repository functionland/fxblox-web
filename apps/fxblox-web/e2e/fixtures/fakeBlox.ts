/**
 * Spawns `node tools/fake-blox/start.mjs` (WAP :3500, Blox AI :8083, RPC :8545 on 127.0.0.1) and waits for the
 * WAP readiness route. If something already answers on :3500 (a fake-blox left running, or a real hotspot alias)
 * it is reused and not stopped.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export interface FakeBloxHandle {
  wapUrl: string;
  aiUrl: string;
  rpcUrl: string;
  /** Whether this handle spawned the process (false = reused an existing server). */
  owned: boolean;
  stop: () => Promise<void>;
}

export interface StartFakeBloxOptions {
  host?: string;
  wapPort?: number;
  aiPort?: number;
  rpcPort?: number;
  scenario?: string;
  timeoutMs?: number;
}

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const START_MJS = fileURLToPath(new URL('../../../../tools/fake-blox/start.mjs', import.meta.url));

async function isReady(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/readiness`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startFakeBlox(options: StartFakeBloxOptions = {}): Promise<FakeBloxHandle> {
  const host = options.host ?? '127.0.0.1';
  const wapPort = options.wapPort ?? 3500;
  const aiPort = options.aiPort ?? 8083;
  const rpcPort = options.rpcPort ?? 8545;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const wapUrl = `http://${host}:${wapPort}`;
  const aiUrl = `http://${host}:${aiPort}`;
  const rpcUrl = `http://${host}:${rpcPort}`;

  if (await isReady(wapUrl)) {
    return { wapUrl, aiUrl, rpcUrl, owned: false, stop: async () => undefined };
  }

  const child: ChildProcess = spawn(process.execPath, [START_MJS], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FAKE_BIND: host,
      FAKE_WAP_PORT: String(wapPort),
      FAKE_AI_PORT: String(aiPort),
      FAKE_RPC_PORT: String(rpcPort),
      ...(options.scenario ? { FAKE_BLOX_SCENARIO: options.scenario } : {}),
    },
  });
  let output = '';
  child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (output += d.toString()));
  let exited = false;
  child.on('exit', () => (exited = true));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`fake-blox exited early:\n${output}`);
    if (await isReady(wapUrl)) break;
    await sleep(250);
  }
  if (!(await isReady(wapUrl))) {
    child.kill();
    throw new Error(
      `fake-blox did not become ready on ${wapUrl} within ${timeoutMs} ms:\n${output}`,
    );
  }

  return {
    wapUrl,
    aiUrl,
    rpcUrl,
    owned: true,
    stop: async () => {
      if (exited) return;
      child.kill();
      const until = Date.now() + 5_000;
      while (!exited && Date.now() < until) await sleep(50);
      if (!exited) child.kill('SIGKILL');
    },
  };
}
