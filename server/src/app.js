/**
 * Ledger proxy — the Express app itself, with no server attached.
 *
 * The browser talks only to this app. This app is the only thing that knows
 * the partner bearer token, and the only thing that ever contacts
 * app2.mfapis.club.
 *
 * Kept separate from index.js so the same app can be either listened on
 * (local dev) or exported as a serverless handler (Vercel), with no branching
 * on environment inside the routes.
 */
import express from 'express';
import schemeRoutes from './routes/scheme.js';
import navRoutes from './routes/nav.js';
import factsheetRoutes from './routes/factsheet.js';
import disclosureRoutes from './routes/disclosure.js';
import { authStatus, isConfigured } from './token.js';
import { ProxyError } from './upstream.js';

const app = express();

app.disable('x-powered-by');
app.set('query parser', 'simple');

// One-line request log — useful when the UI misbehaves and you want to see
// which upstream call was actually made. On Vercel these land in the
// function logs.
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${res.statusCode} ${req.method} ${req.originalUrl} ${Date.now() - started}ms`);
  });
  next();
});

/**
 * Health/config probe. Reports whether a token is configured so the UI can
 * show a setup hint instead of a wall of 500s — but never reveals the token.
 */
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', auth: authStatus() }, message: 'OK' });
});

/**
 * Fail fast and legibly if the operator forgot the token. Scoped to the data
 * prefixes rather than all of /api, so an unknown path still answers 404
 * instead of blaming the config.
 */
const DATA_PREFIXES = ['/api/scheme', '/api/nav', '/api/amc_factsheet', '/api/amc_portfolio_disclosure'];

app.use(DATA_PREFIXES, (_req, res, next) => {
  if (isConfigured()) return next();
  res.status(500).json({
    success: false,
    message:
      'Proxy is missing a partner token. Set PARTNER_ACCESS_TOKEN in the environment (Vercel: Settings → Environment Variables, then redeploy; local: .env) and restart.',
    code: 'NOT_CONFIGURED',
  });
});

app.use('/api/scheme', schemeRoutes);
app.use('/api/nav', navRoutes);
app.use('/api/amc_factsheet', factsheetRoutes);
app.use('/api/amc_portfolio_disclosure', disclosureRoutes);

// Unknown /api paths are a routing mistake, not a config problem — answer
// before the token guard so a typo doesn't masquerade as a missing token.
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: 'No such proxy route', code: 'NOT_FOUND' });
});

// --- Error envelope -------------------------------------------------------
// Every failure reaches the browser in the same shape:
//   { success: false, message, code, retryAfter? }
app.use((err, _req, res, _next) => {
  const status = err instanceof ProxyError ? err.status : err.status || 500;

  if (status >= 500) console.error('proxy error:', err.message);
  if (err.retryAfter != null) res.setHeader('Retry-After', String(err.retryAfter));

  res.status(status).json({
    success: false,
    message: err.message || 'Something went wrong. Try again later.',
    code: err.code || 'INTERNAL_ERROR',
    ...(err.retryAfter != null ? { retryAfter: err.retryAfter } : {}),
  });
});

export { app, isConfigured, authStatus };
export default app;
