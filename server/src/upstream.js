/**
 * Upstream client + Express handler factory.
 *
 * Everything that talks to app2.mfapis.club goes through here, so there is
 * exactly one place that attaches the Authorization header and exactly one
 * place that maps upstream failures onto our own error envelope.
 */
import { getToken, refreshToken } from './token.js';

const BASE = () => process.env.MF_API_BASE || 'https://app2.mfapis.club/api/v2';
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000);

/** Error shape our routes throw; the error middleware renders it. */
export class ProxyError extends Error {
  constructor(status, message, { code, retryAfter, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

/**
 * Build a query string from an allow-list, mirroring upstream param names
 * verbatim. Unknown params are dropped rather than forwarded, so a typo in the
 * frontend surfaces as "filter ignored" instead of an upstream 400.
 */
export function pickQuery(query, allowed) {
  const out = new URLSearchParams();
  for (const key of allowed) {
    const value = query[key];
    if (value === undefined || value === null || value === '') continue;
    // Express gives arrays for repeated params; forward each one.
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v === undefined || v === null || v === '') continue;
      out.append(key, String(v));
    }
  }
  return out;
}

/** Upstream 429 bodies are `{error: "..."}`, not the usual wrapper. */
function messageFrom(body, fallback) {
  if (!body || typeof body !== 'object') return fallback;
  return body.message || body.error || fallback;
}

/** Retry-After is documented as always <= 60s. Clamp defensively. */
function parseRetryAfter(res) {
  const raw = res.headers.get('retry-after');
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.min(Math.ceil(n), 60);
  return 60;
}

/**
 * One upstream call. Returns { status, body, headers }.
 * Retries exactly once on 401 and only when the proxy owns the credentials
 * (login mode) — never a blind retry loop.
 */
async function callOnce(path, search, { method = 'GET', token }) {
  const url = `${BASE()}${path}${search?.toString() ? `?${search}` : ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    if (cause?.name === 'AbortError') {
      throw new ProxyError(504, 'The data provider took too long to respond. Try again.', {
        code: 'UPSTREAM_TIMEOUT',
      });
    }
    throw new ProxyError(502, 'Could not reach the data provider. Try again later.', {
      code: 'UPSTREAM_UNREACHABLE',
    });
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text.slice(0, 500) };
    }
  }
  return { status: res.status, body, headers: res.headers };
}

/**
 * Fetch from upstream and normalise the outcome.
 * Resolves with { data, message, headers } on success; throws ProxyError otherwise.
 */
export async function callUpstream(path, search, opts = {}) {
  let token = await getToken();
  let res = await callOnce(path, search, { ...opts, token });

  if (res.status === 401 && (await refreshToken())) {
    token = await getToken();
    res = await callOnce(path, search, { ...opts, token });
  }

  const { status, body, headers } = res;

  if (status >= 200 && status < 300) {
    return { data: body?.data ?? body, message: body?.message ?? 'OK', headers };
  }

  switch (status) {
    case 401:
      // The partner token is bad or expired. This is an operator problem, not
      // an end-user one, but the frontend still needs to show something.
      throw new ProxyError(401, 'Unauthorized', { code: 'SESSION_EXPIRED' });

    case 400:
      // Validation errors carry a useful message — pass it through verbatim.
      throw new ProxyError(400, messageFrom(body, 'Invalid request'), {
        code: 'BAD_REQUEST',
      });

    case 403:
      throw new ProxyError(403, messageFrom(body, 'Forbidden'), { code: 'FORBIDDEN' });

    case 404:
      throw new ProxyError(404, messageFrom(body, 'Not found'), { code: 'NOT_FOUND' });

    case 429: {
      const retryAfter = parseRetryAfter(headers);
      throw new ProxyError(429, messageFrom(body, 'Rate limit exceeded.'), {
        code: 'RATE_LIMITED',
        retryAfter,
      });
    }

    default:
      if (status >= 500) {
        throw new ProxyError(502, 'The data provider is having trouble. Try again later.', {
          code: 'UPSTREAM_ERROR',
        });
      }
      throw new ProxyError(status, messageFrom(body, `Upstream error (${status})`), {
        code: 'UPSTREAM_ERROR',
      });
  }
}

/** Response headers worth relaying to the browser (e.g. the 200-result cap). */
const RELAYED_HEADERS = ['x-truncated'];

/**
 * Turn a path builder + param allow-list into an Express handler.
 *
 *   router.get('/scheme', forward(() => '/scheme', SCHEME_PARAMS))
 */
export function forward(buildPath, allowedParams = []) {
  return async (req, res, next) => {
    try {
      const path = typeof buildPath === 'function' ? buildPath(req) : buildPath;
      const search = pickQuery(req.query, allowedParams);
      const { data, message, headers } = await callUpstream(path, search);

      for (const name of RELAYED_HEADERS) {
        const value = headers.get(name);
        if (value != null) res.setHeader(name, value);
      }

      res.json({ success: true, data, message });
    } catch (err) {
      next(err);
    }
  };
}

/** URL-encode a path segment taken from user input. */
export const seg = (value) => encodeURIComponent(String(value));
