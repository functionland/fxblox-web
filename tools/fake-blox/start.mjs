// Starts all fake servers and writes their addresses to .state/state.json (consumed by Playwright / dev).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startWap } from './http3500.mjs';
import { startAi } from './http8083.mjs';
import { startRpc } from './rpc.mjs';

const host = process.env.FAKE_BIND ?? '127.0.0.1';
const [wap, ai, rpc] = await Promise.all([
  startWap({ port: Number(process.env.FAKE_WAP_PORT ?? 3500), host }),
  startAi({ port: Number(process.env.FAKE_AI_PORT ?? 8083), host }),
  startRpc({ port: Number(process.env.FAKE_RPC_PORT ?? 8545), host }),
]);

const state = {
  wapUrl: `http://${host}:${wap.port}`,
  aiUrl: `http://${host}:${ai.port}`,
  rpcUrl: `http://${host}:${rpc.port}`,
  bloxPeerId: wap.state.kuboPeerId,
  scenario: process.env.FAKE_BLOX_SCENARIO ?? '',
};
const dir = fileURLToPath(new URL('./.state/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(dir + 'state.json', JSON.stringify(state, null, 2) + '\n');
console.log('[fake-blox] up:', state);
