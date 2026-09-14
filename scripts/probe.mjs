#!/usr/bin/env node
/**
 * Smoke-tests the upstream API with your token and prints the shape of what
 * comes back. Run after pasting a token into .env:
 *
 *   npm run probe
 *
 * Useful for confirming field names before trusting the UI, and for checking
 * whether a 401/429 is coming from the token or from the app.
 */

const BASE = process.env.MF_API_BASE || 'https://app2.mfapis.club/api/v2';
const TOKEN = process.env.PARTNER_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('PARTNER_ACCESS_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

/** Compact type sketch of an arbitrary value, depth-limited. */
function shape(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.length} × ${depth > 1 ? typeof value[0] : shape(value[0], depth + 1)}]`;
  }
  if (typeof value === 'object') {
    if (depth > 1) return '{…}';
    const keys = Object.keys(value);
    const shown = keys.slice(0, 14);
    const body = shown.map((k) => `${k}: ${shape(value[k], depth + 1)}`).join(', ');
    return `{ ${body}${keys.length > shown.length ? `, …+${keys.length - shown.length}` : ''} }`;
  }
  return typeof value;
}

async function probe(label, path) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      const retry = res.headers.get('retry-after');
      console.log(
        `✗ ${label.padEnd(26)} ${res.status} ${body?.message || body?.error || ''}` +
          (retry ? ` (Retry-After: ${retry}s)` : '')
      );
      return null;
    }

    console.log(`✓ ${label.padEnd(26)} ${shape(body?.data)}`);
    return body?.data;
  } catch (err) {
    console.log(`✗ ${label.padEnd(26)} ${err.message}`);
    return null;
  }
}

console.log(`\nProbing ${BASE}\n`);

await probe('filter-options', '/scheme/filter-options');
const list = await probe('scheme list', '/scheme?limit=2&sort_by=aum&sort_dir=desc');

const first = list?.list?.[0];
if (!first?.id) {
  console.log('\nNo scheme returned — stopping here.\n');
  process.exit(0);
}

console.log(`\nUsing scheme: ${first.name} (${first.id})\n`);

const detail = await probe('scheme detail', `/scheme/${encodeURIComponent(first.id)}`);
await probe('mf-data', `/scheme/mf-data/${encodeURIComponent(first.id)}`);
await probe('related (siblings)', `/scheme/${encodeURIComponent(first.id)}/related?scope=siblings`);
await probe('holding-changes', `/scheme/${encodeURIComponent(first.id)}/holding-changes?months=3&holding_type=equity`);

const from = new Date();
from.setFullYear(from.getFullYear() - 1);
await probe('nav (1y)', `/nav/${encodeURIComponent(first.id)}?from_date=${from.toISOString().slice(0, 10)}`);

if (first.scheme_isin) {
  await probe('factsheet link', `/scheme/factsheet/${encodeURIComponent(first.isin ?? first.scheme_isin)}`);
  await probe('disclosure months', `/amc_portfolio_disclosure/months?isin=${encodeURIComponent(first.scheme_isin)}`);
}

if (detail?.mf_data) {
  console.log('\nmf_data tables:');
  for (const [table, rows] of Object.entries(detail.mf_data)) {
    console.log(`  ${table.padEnd(20)} ${Array.isArray(rows) ? `${rows.length} rows` : typeof rows}`);
  }
}

console.log('');
