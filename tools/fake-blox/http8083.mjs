// Fake Blox AI service (real one: E:\GitHub\blox-ai\src\app.py, FastAPI on :8083).
// Streams scripted SSE events for /troubleshoot and /troubleshoot/tree; other routes return canned JSON.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { applyCors, json, readBody } from './cors.mjs';

const SCENARIO = process.env.FAKE_BLOX_SCENARIO ?? '';
const sessions = new Map();
let seq = 0;

function sse(res, events, { intervalMs = 150 } = {}) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'x-accel-buffering': 'no',
  });
  let i = 0;
  const timer = setInterval(() => {
    if (i >= events.length) {
      clearInterval(timer);
      res.end();
      return;
    }
    const ev = events[i++];
    res.write(`id: ${++seq}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
  }, intervalMs);
  res.on('close', () => clearInterval(timer));
}

function scriptedSession(sessionId, prompt) {
  return [
    { type: 'session_started', session_id: sessionId },
    { type: 'thought', text: `Looking into: ${prompt.slice(0, 60)}` },
    { type: 'tool_call', tool: 'internet', args: {} },
    { type: 'tool_result', tool: 'internet', result: { ok: true, latency_ms: 42 } },
    { type: 'tool_call', tool: 'relay', args: {} },
    { type: 'tool_result', tool: 'relay', result: { ok: true, relay: 'relay.dev.fx.land' } },
    { type: 'verdict', summary: 'Blox is healthy; relay reachable.', severity: 'info' },
    {
      type: 'recommended_action',
      action_id: 'restart_fula',
      title: 'Restart fula service',
      approval_token: 'tok-' + sessionId,
      requires_security_code: false,
    },
    { type: 'done', session_id: sessionId },
  ];
}

export function startAi({ port = 8083, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    if (applyCors(req, res, { allowHeaders: 'content-type, x-fula-support', scenario: SCENARIO, mutatingGetPaths: new Set() })) return;
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const raw = req.method === 'POST' ? await readBody(req) : '';
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 400, { detail: 'invalid json' });
    }
    if (SCENARIO === 'busy' && path.startsWith('/troubleshoot')) return json(res, 429, { detail: 'session in progress' });

    switch (path) {
      case '/health':
        return json(res, 200, { status: 'ok', version: 'fake' });
      case '/status':
        return json(res, 200, { status: 'idle', sessions: sessions.size });
      case '/troubleshoot':
      case '/troubleshoot/tree': {
        const sessionId = body.session_id ?? `s-${Date.now()}`;
        sessions.set(sessionId, { prompt: body.prompt ?? '', pending: [] });
        return sse(res, scriptedSession(sessionId, body.prompt ?? ''));
      }
      case '/troubleshoot/classify':
        return json(res, 200, { scenario_id: /pool/i.test(body.prompt ?? '') ? 'cannot-join-pool' : 'disconnected' });
      case '/troubleshoot/user-reply':
      case '/troubleshoot/phone-context':
        return json(res, 200, { ok: true });
      case '/troubleshoot/resume': {
        const sessionId = url.searchParams.get('session_id') ?? 'unknown';
        return sse(res, scriptedSession(sessionId, sessions.get(sessionId)?.prompt ?? ''));
      }
      case '/execute-action':
        if (!body.approval_token) return json(res, 400, { detail: 'approval_token required' });
        return json(res, 200, { ok: true, action_id: body.action_id, output: 'restarted' });
      case '/cancel':
        return json(res, 200, { ok: true });
      case '/pending':
        return json(res, 200, { pending: [] });
      case '/feedback':
        return json(res, 200, { ok: true });
      case '/diag/bundle':
        return json(res, 200, { internet: { ok: true }, relay: { ok: true }, storage: { used_pct: 25 } });
      case '/support/wireguard':
        if (req.headers['x-fula-support'] !== 'enable') return json(res, 400, { detail: 'X-Fula-Support header required' });
        return json(res, 200, { ok: true, endpoint: 'wg.fake:51820' });
      default:
        if (path.startsWith('/diag/')) return json(res, 200, { tool: path.slice(6), ok: true });
        return json(res, 404, { detail: 'Not Found' });
    }
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, port, host })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startAi({ port: Number(process.env.FAKE_AI_PORT ?? 8083), host: process.env.FAKE_BIND ?? '127.0.0.1' }).then(({ port, host }) =>
    console.log(`[fake-blox] Blox AI listening on http://${host}:${port} (scenario: ${SCENARIO || 'default'})`),
  );
}
