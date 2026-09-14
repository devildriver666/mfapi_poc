/**
 * Display formatting.
 *
 * Units note: `aum` and `total_assets` are both absolute rupees — verified
 * against live responses, not assumed from the filter names.
 */

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Coerce to a finite number, or null. Upstream sends some numerics as strings. */
export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const EM_DASH = '—';

export function fmtNum(v, digits = 2) {
  const n = num(v);
  if (n === null) return EM_DASH;
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Percentage with an explicit sign, for returns and weight deltas. */
export function fmtPct(v, { digits = 2, sign = false } = {}) {
  const n = num(v);
  if (n === null) return EM_DASH;
  const body = Math.abs(n).toFixed(digits);
  const prefix = n < 0 ? '−' : sign && n > 0 ? '+' : '';
  return `${prefix}${body}%`;
}

/**
 * Absolute rupees → compact Indian scale.
 *
 * Confirmed against live data: `scheme.aum` and `mf_data.scheme[].total_assets`
 * are both absolute rupee figures (HDFC Flexi Cap reports 1_107_364_118_522,
 * i.e. ~₹1.1 lakh crore), NOT crores as the filter names might suggest.
 * Large Cr values drop the decimals so table columns stay narrow.
 */
export function fmtRupees(v) {
  const n = num(v);
  if (n === null) return EM_DASH;
  const abs = Math.abs(n);
  if (abs >= 1e7) {
    const cr = n / 1e7;
    return `₹${cr.toLocaleString('en-IN', {
      maximumFractionDigits: Math.abs(cr) >= 1000 ? 0 : 2,
    })} Cr`;
  }
  if (abs >= 1e5) return `₹${(n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function fmtDate(v) {
  if (!v) return EM_DASH;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtMonth(v) {
  if (!v) return EM_DASH;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export const dash = (v) => (v === null || v === undefined || v === '' ? EM_DASH : v);

/** Sign class for colouring numeric cells. */
export function signClass(v) {
  const n = num(v);
  if (n === null || n === 0) return '';
  return n > 0 ? 'pos' : 'neg';
}

/** YYYY-MM-DD for from_date, N years before today. */
export function isoYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}
