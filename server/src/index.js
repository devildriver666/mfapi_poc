/**
 * Local dev server. On Vercel the same app is exported from api/[...slug].js
 * instead, and this file is never run.
 */
import app, { authStatus } from './app.js';

const PORT = Number(process.env.PORT || 8787);

app.listen(PORT, () => {
  const { configured, mode } = authStatus();
  console.log(`\n  Ledger proxy   http://localhost:${PORT}`);
  console.log(`  Upstream       ${process.env.MF_API_BASE || 'https://app2.mfapis.club/api/v2'}`);
  console.log(`  Auth           ${configured ? `configured (${mode})` : 'MISSING — set PARTNER_ACCESS_TOKEN in .env'}\n`);
});
