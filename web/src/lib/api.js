/**
 * Thin client for OUR proxy. Nothing here knows about app2.mfapis.club —
 * every URL is same-origin, which is what keeps CORS out of the picture.
 */

export class ApiError extends Error {
  constructor(status, message, { code, retryAfter } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }

  /** Copy suitable for showing a user directly. */
  get userMessage() {
    switch (this.code) {
      case 'SESSION_EXPIRED':
        return 'Session expired — the partner token is invalid or has expired. Refresh it in the proxy .env and restart.';
      case 'RATE_LIMITED':
        return `Rate limited by the data provider. Retrying is allowed in ${this.retryAfter ?? 60}s.`;
      case 'NOT_CONFIGURED':
        return this.message;
      case 'UPSTREAM_ERROR':
      case 'UPSTREAM_UNREACHABLE':
      case 'UPSTREAM_TIMEOUT':
        return 'The data provider is unavailable. Try again later.';
      default:
        return this.message;
    }
  }
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.append(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

async function request(path, params, { signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}${toQuery(params)}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the Ledger proxy. Is it running on port 8787?', {
      code: 'PROXY_DOWN',
    });
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    throw new ApiError(res.status, body?.message || `Request failed (${res.status})`, {
      code: body?.code,
      retryAfter: body?.retryAfter ?? (Number(res.headers.get('retry-after')) || undefined),
    });
  }

  // X-Truncated marks a capped list (the /related 200-result cap).
  const truncated = res.headers.get('x-truncated') === 'true';
  return { data: body?.data, message: body?.message, truncated };
}

export const api = {
  health: (opts) => request('/health', {}, opts),

  // --- Explorer ---
  schemes: (params, opts) => request('/scheme', params, opts),
  filterOptions: (opts) => request('/scheme/filter-options', {}, opts),
  amcs: (params, opts) => request('/scheme/amcs', params, opts),

  // --- Detail ---
  scheme: (id, params, opts) => request(`/scheme/${encodeURIComponent(id)}`, params, opts),
  mfData: (id, opts) => request(`/scheme/mf-data/${encodeURIComponent(id)}`, {}, opts),
  related: (id, params, opts) =>
    request(`/scheme/${encodeURIComponent(id)}/related`, params, opts),
  factsheetLink: (isin, opts) =>
    request(`/scheme/factsheet/${encodeURIComponent(isin)}`, {}, opts),

  // --- NAV ---
  nav: (id, params, opts) => request(`/nav/${encodeURIComponent(id)}`, params, opts),
  navByAmfi: (code, params, opts) =>
    request(`/nav/amfi/${encodeURIComponent(code)}`, params, opts),

  // --- Holdings ---
  schemeHoldingChanges: (id, params, opts) =>
    request(`/scheme/${encodeURIComponent(id)}/holding-changes`, params, opts),
  disclosureHoldingChanges: (isin, params, opts) =>
    request(
      `/amc_portfolio_disclosure/scheme/${encodeURIComponent(isin)}/holding-changes`,
      params,
      opts
    ),

  // --- Disclosure / factsheet archives (proxied; not surfaced in the POC UI) ---
  disclosures: (params, opts) => request('/amc_portfolio_disclosure', params, opts),
  disclosure: (id, params, opts) =>
    request(`/amc_portfolio_disclosure/${encodeURIComponent(id)}`, params, opts),
  disclosureMonths: (params, opts) => request('/amc_portfolio_disclosure/months', params, opts),
  factsheetHistory: (params, opts) => request('/amc_factsheet/history', params, opts),
  factsheetSnapshot: (id, opts) =>
    request(`/amc_factsheet/history/${encodeURIComponent(id)}`, {}, opts),
};
