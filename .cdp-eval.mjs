// Evaluate an expression in a page on the phone, over the forwarded CDP port.
// usage: node cdp-eval.mjs <port> <targetUrlSubstring> <file-with-js>
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

const [, , port, urlPart, jsFile] = process.argv;
const expression = readFileSync(jsFile, 'utf8');

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const target = targets.find((t) => t.type === 'page' && (t.url || '').includes(urlPart));
if (!target) {
  console.error('no matching target for', urlPart);
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CDP timeout')), 180_000);
  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true, userGesture: true },
      }),
    );
  });
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id !== 1) return;
    clearTimeout(timer);
    if (msg.result?.exceptionDetails) {
      resolve('EXCEPTION: ' + JSON.stringify(msg.result.exceptionDetails.exception ?? msg.result.exceptionDetails));
    } else {
      resolve(msg.result?.result?.value);
    }
    ws.close();
  });
  ws.on('error', reject);
});

console.log(typeof (await done) === 'string' ? await done : JSON.stringify(await done, null, 2));
process.exit(0);
