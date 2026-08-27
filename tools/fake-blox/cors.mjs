// CORS + Origin-guard behaviour identical to what firmware PR-A / PR-B add on the real Blox.
// Allow-list: https://blox.fx.land, https://docs.fx.land (org Pages custom domain → staging),
// https://functionland.github.io, http://localhost:*, http://127.0.0.1:*

export const ALLOWED_ORIGINS = ['https://blox.fx.land', 'https://docs.fx.land', 'https://functionland.github.io'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function originAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
}

/**
 * Applies CORS headers and the Origin guard. Returns true when the request has been fully handled
 * (preflight answered or request rejected) and the caller must stop.
 */
export function applyCors(req, res, { allowHeaders = 'content-type', scenario = '' } = {}) {
  const origin = req.headers.origin;
  if (scenario === 'old-firmware') return false; // no CORS at all, like today's Blox

  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', allowHeaders);
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(origin && originAllowed(origin) ? 204 : 403);
    res.end();
    return true;
  }

  // Origin guard: a present-but-unlisted Origin on a state-changing method is a cross-site request → 403.
  if (origin && !originAllowed(origin) && req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden origin');
    return true;
  }
  return false;
}

export function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

export function json(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}
