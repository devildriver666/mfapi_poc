/**
 * Selectors over the nested `mf_data` research payload.
 *
 * Several of these tables carry one row per perspective (the fund itself, its
 * category, the benchmark index) distinguished by a `cap_of` / `measure_of`
 * label whose exact vocabulary isn't pinned down in the docs. `pickPrimary`
 * prefers a fund-ish label and falls back to the first row, so the UI degrades
 * to "something sensible" rather than blank.
 */
import { num } from './format.js';

const FUND_LABEL = /fund|investment|portfolio|scheme/i;
const CATEGORY_LABEL = /categ/i;
const INDEX_LABEL = /index|benchmark/i;

export function pickPrimary(rows, field) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((r) => FUND_LABEL.test(String(r?.[field] ?? ''))) ?? rows[0];
}

export function pickBy(rows, field, pattern) {
  if (!Array.isArray(rows)) return null;
  return rows.find((r) => pattern.test(String(r?.[field] ?? ''))) ?? null;
}

export const categoryRow = (rows, field) => pickBy(rows, field, CATEGORY_LABEL);
export const indexRow = (rows, field) => pickBy(rows, field, INDEX_LABEL);

/** The single research row describing the fund. */
export const researchRow = (mf) => mf?.scheme?.[0] ?? null;

/** Document links + risk level. Prefer a row that actually has links. */
export function supplemental(mf) {
  const rows = mf?.supplemental_data;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((r) => r?.factsheet_url || r?.sid_url || r?.kim_url) ?? rows[0];
}

/** Fund managers, currently-serving first, then by longest tenure. */
export function managers(mf) {
  const rows = mf?.management_team;
  if (!Array.isArray(rows)) return [];
  return [...rows].sort((a, b) => {
    const aActive = !a?.end_date;
    const bActive = !b?.end_date;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return new Date(a?.start_date ?? 0) - new Date(b?.start_date ?? 0);
  });
}

/** Latest asset-allocation snapshot, largest net weight first. */
export function assetAllocation(mf) {
  const rows = mf?.asset_allocation;
  if (!Array.isArray(rows) || rows.length === 0) return { asOf: null, rows: [] };

  const latest = rows.reduce((acc, r) => {
    const t = new Date(r?.asof_date ?? 0).getTime();
    return t > acc ? t : acc;
  }, 0);

  const asOf = latest ? new Date(latest).toISOString() : null;
  const slice = asOf
    ? rows.filter((r) => new Date(r?.asof_date ?? 0).getTime() === latest)
    : rows;

  return {
    asOf,
    rows: [...slice].sort((a, b) => (num(b?.net) ?? -Infinity) - (num(a?.net) ?? -Infinity)),
  };
}

/** Holdings from the latest asof_date, heaviest first. */
function topHoldings(rows, nameField, limit) {
  if (!Array.isArray(rows) || rows.length === 0) return { asOf: null, rows: [] };

  const latest = rows.reduce((acc, r) => {
    const t = new Date(r?.asof_date ?? 0).getTime();
    return Number.isFinite(t) && t > acc ? t : acc;
  }, 0);

  const slice = latest
    ? rows.filter((r) => new Date(r?.asof_date ?? 0).getTime() === latest)
    : rows;

  const sorted = [...slice]
    .filter((r) => r?.[nameField])
    .sort((a, b) => (num(b?.portfolio_weight) ?? -Infinity) - (num(a?.portfolio_weight) ?? -Infinity));

  return {
    asOf: latest ? new Date(latest).toISOString() : null,
    rows: limit ? sorted.slice(0, limit) : sorted,
  };
}

export const topEquity = (mf, limit) => topHoldings(mf?.equity_holdings, 'holding_name', limit);
export const topBonds = (mf, limit) => topHoldings(mf?.bond_holdings, 'bond_name', limit);
export const topOther = (mf, limit) => topHoldings(mf?.other_holdings, 'holding_name', limit);

/** Distinct period_years present in a risk table, ascending. */
export function riskPeriods(mf) {
  const rows = [...(mf?.risk_volatility ?? []), ...(mf?.market_volatility ?? [])];
  const set = new Set(rows.map((r) => num(r?.period_years)).filter((n) => n !== null));
  return [...set].sort((a, b) => a - b);
}

export const riskRow = (mf, years) =>
  mf?.risk_volatility?.find((r) => num(r?.period_years) === years) ?? null;

export const volatilityRow = (mf, years) =>
  mf?.market_volatility?.find((r) => num(r?.period_years) === years) ?? null;

/** Calendar-year returns, most recent first. */
export function calendarReturns(mf) {
  const rows = mf?.returns;
  if (!Array.isArray(rows)) return [];
  return [...rows].sort((a, b) => String(b?.year ?? '').localeCompare(String(a?.year ?? '')));
}

/**
 * Trailing returns live on the scheme summary as `scheme_returns`, keyed by
 * odd short names (mths1, yrs3...). Prefer the point-to-point row over any
 * rolling-return variant.
 */
export const TRAILING_PERIODS = [
  { key: 'mths1', label: '1M' },
  { key: 'mths6', label: '6M' },
  { key: 'yrs1', label: '1Y' },
  { key: 'yrs2', label: '2Y' },
  { key: 'yrs3', label: '3Y' },
  { key: 'yrs5', label: '5Y' },
  { key: 'yrs7', label: '7Y' },
  { key: 'yrs10', label: '10Y' },
];

export function trailingReturns(scheme) {
  const rows = scheme?.scheme_returns;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((r) => !r?.is_rolling) ?? rows[0];
}

/**
 * Headline stats, resolved across the two places upstream puts them.
 *
 * Verified against live data: GET /scheme (the list) populates aum, ter,
 * rating and returns_1y/3y/5y, but GET /scheme/:id (the detail) returns null
 * for all of them — the same numbers are only reachable through mf_data and
 * scheme_returns. Detail pages would render an empty stat bar without this.
 */
export function schemeStats(scheme) {
  const mf = scheme?.mf_data ?? {};
  const research = researchRow(mf);
  const supp = supplemental(mf);
  const trailing = trailingReturns(scheme);

  const first = (...vals) => {
    for (const v of vals) {
      const n = num(v);
      if (n !== null) return n;
    }
    return null;
  };

  return {
    // Absolute rupees in both places.
    aum: first(scheme?.aum, research?.total_assets),
    ter: first(scheme?.ter, scheme?.expense_ratio, research?.expense_ratio, supp?.expense_ratio),
    rating: first(scheme?.rating, research?.rating),
    returns_1y: first(scheme?.returns_1y, trailing?.yrs1),
    returns_3y: first(scheme?.returns_3y, trailing?.yrs3),
    returns_5y: first(scheme?.returns_5y, trailing?.yrs5),
  };
}

/**
 * Settlement is reported as a bare number ("2") or already prefixed ("T2").
 * Normalise to "T+2" without producing "T+T2".
 */
export function fmtSettlement(v) {
  if (v === null || v === undefined || v === '') return null;
  const raw = String(v).trim();
  const digits = raw.match(/\d+/)?.[0];
  return digits ? `T+${digits}` : raw;
}
