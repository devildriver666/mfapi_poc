/**
 * Partner bearer token provider.
 *
 * The token lives here and only here. It is attached to upstream requests
 * inside this process and is never included in any response to the browser.
 *
 * Two modes:
 *   1. PARTNER_ACCESS_TOKEN — a long-lived token pasted into .env. Used as-is.
 *   2. PARTNER_IDENTIFIER + PARTNER_PASSWORD — the proxy calls
 *      POST /partner/login itself and caches the accessToken in memory.
 *
 * Mode 1 wins if both are configured.
 */

const BASE = () => process.env.MF_API_BASE || 'https://app2.mfapis.club/api/v2';

let cached = null;        // { token } from a successful login
let inFlight = null;      // de-dupes concurrent logins

export function hasCredentials() {
  return Boolean(process.env.PARTNER_IDENTIFIER && process.env.PARTNER_PASSWORD);
}

export function isConfigured() {
  return Boolean(process.env.PARTNER_ACCESS_TOKEN) || hasCredentials();
}

/** Describes auth config without leaking the token itself. Safe to expose. */
export function authStatus() {
  const staticToken = Boolean(process.env.PARTNER_ACCESS_TOKEN);
  return {
    configured: isConfigured(),
    mode: staticToken ? 'static_token' : hasCredentials() ? 'login' : 'none',
    // Length only — never the value, not even a prefix.
    tokenPresent: staticToken || Boolean(cached),
  };
}

async function login() {
  const res = await fetch(`${BASE()}/partner/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: process.env.PARTNER_IDENTIFIER,
      password: process.env.PARTNER_PASSWORD,
    }),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok || !body?.data?.accessToken) {
    const err = new Error(body?.message || `Partner login failed (${res.status})`);
    err.status = res.status === 401 ? 401 : 502;
    err.code = 'LOGIN_FAILED';
    throw err;
  }

  cached = { token: body.data.accessToken };
  return cached.token;
}

/** Returns a bearer token, logging in on first use if needed. */
export async function getToken() {
  const staticToken = process.env.PARTNER_ACCESS_TOKEN;
  if (staticToken) return staticToken;

  if (cached) return cached.token;

  if (!hasCredentials()) {
    const err = new Error(
      'No partner token configured. Set PARTNER_ACCESS_TOKEN (or PARTNER_IDENTIFIER + PARTNER_PASSWORD) in .env'
    );
    err.status = 500;
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  // Collapse parallel cold-start logins into one request.
  inFlight ??= login().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Called after an upstream 401. Returns true if a fresh token was obtained and
 * the request is worth retrying once. A pasted static token cannot be
 * refreshed, so this is a no-op in that mode.
 */
export async function refreshToken() {
  if (process.env.PARTNER_ACCESS_TOKEN || !hasCredentials()) return false;
  cached = null;
  try {
    await getToken();
    return true;
  } catch {
    return false;
  }
}
