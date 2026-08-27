// Minimal JSON-RPC stub so injected-wallet E2E flows complete without a real chain.
// Supports: eth_chainId, eth_blockNumber, eth_getBalance, eth_call (returns zero-filled 32 bytes),
// eth_estimateGas, eth_gasPrice, eth_sendRawTransaction / eth_sendTransaction (fake hash),
// eth_getTransactionReceipt (status 0x1), eth_getTransactionCount, net_version.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { applyCors, json, readBody } from './cors.mjs';

const CHAIN_ID = process.env.FAKE_RPC_CHAIN_ID ?? '0x79f99296'; // SKALE Europa by default
let txCounter = 0;

export function startRpc({ port = 8545, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    if (applyCors(req, res, { mutatingGetPaths: new Set() })) return;
    const raw = await readBody(req);
    let calls;
    try {
      calls = JSON.parse(raw || '{}');
    } catch {
      return json(res, 400, { error: 'invalid json' });
    }
    const batch = Array.isArray(calls);
    const answers = (batch ? calls : [calls]).map((c) => ({ jsonrpc: '2.0', id: c.id ?? null, result: handle(c.method, c.params ?? []) }));
    return json(res, 200, batch ? answers : answers[0]);
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, port, host })));
}

function handle(method, params) {
  switch (method) {
    case 'eth_chainId':
      return CHAIN_ID;
    case 'net_version':
      return String(parseInt(CHAIN_ID, 16));
    case 'eth_blockNumber':
      return '0x' + Math.floor(Date.now() / 1000).toString(16);
    case 'eth_getBalance':
      return '0xde0b6b3a7640000'; // 1 ETH
    case 'eth_getTransactionCount':
      return '0x' + txCounter.toString(16);
    case 'eth_gasPrice':
      return '0x0';
    case 'eth_estimateGas':
      return '0x5208';
    case 'eth_call':
      return '0x' + '0'.repeat(64);
    case 'eth_sendTransaction':
    case 'eth_sendRawTransaction':
      txCounter++;
      return '0x' + txCounter.toString(16).padStart(64, '0');
    case 'eth_getTransactionReceipt':
      return {
        transactionHash: params[0],
        status: '0x1',
        blockNumber: '0x1',
        blockHash: '0x' + '1'.repeat(64),
        gasUsed: '0x5208',
        logs: [],
      };
    case 'eth_getBlockByNumber':
      return { number: '0x1', hash: '0x' + '1'.repeat(64), timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16), transactions: [] };
    default:
      return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startRpc({ port: Number(process.env.FAKE_RPC_PORT ?? 8545) }).then(({ port, host }) =>
    console.log(`[fake-blox] RPC listening on http://${host}:${port} (chainId ${CHAIN_ID})`),
  );
}
