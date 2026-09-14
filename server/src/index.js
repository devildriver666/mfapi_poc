/**
 * Ledger proxy.
 *
 * The browser talks only to this server. This server is the only thing that
 * knows the partner bearer token, and the only thing that ever contacts
 * app2.mfapis.club.
 */
import express from 'express';
import schemeRoutes from './routes/scheme.js';
import navRoutes from './routes/nav.js';
import factsheetRoutes from './routes/factsheet.js';
import disclosureRoutes from './routes/disclosure.js';
import { authStatus, isConfigured } from './token.js';
import { ProxyError } from './upstream.js';

const app = express();
const PORT = Number(process.env.PORT || 8787);

app.disable('x-powered-by');
app.set('query parser', 'simple');

// One-line request log — useful when the UI misbehaves and you want to see
// which upstream call was actually made.
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    console.log(`${res.statusCode} ${req.method} ${req.originalUrl} ${ms}ms`);
  });
  next();
});

/**
 * Health/config probe. Reports whether a token is configured so the UI can
 * show a setup hint instead of a wall of 500s — but never reveals the token.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', auth: authStatus() },
    message: 'OK',
  });
});

// Fail fast and legibly if the operator forgot the token.
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || isConfigured()) return next();
  res.status(500).json({
    success: false,
    message:
      'Proxy is missing a partner token. Copy .env.example to .env and set PARTNER_ACCESS_TOKEN, then restart.',
    code: 'NOT_CONFIGURED',
  });
});

app.use('/api/scheme', schemeRoutes);
app.use('/api/nav', navRoutes);
app.use('/api/amc_factsheet', factsheetRoutes);
app.use('/api/amc_portfolio_disclosure', disclosureRoutes);

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

app.listen(PORT, () => {
  const { configured, mode } = authStatus();
  console.log(`\n  Ledger proxy   http://localhost:${PORT}`);
  console.log(`  Upstream       ${process.env.MF_API_BASE || 'https://app2.mfapis.club/api/v2'}`);
  console.log(`  Auth           ${configured ? `configured (${mode})` : 'MISSING — set PARTNER_ACCESS_TOKEN in .env'}\n`);
});
