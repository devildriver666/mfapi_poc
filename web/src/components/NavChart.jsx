import { useCallback, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { SectionState, Seg } from './ui.jsx';
import { fmtNum, fmtPct, isoYearsAgo, signClass } from '../lib/format.js';

/**
 * Periods map to a from_date. "Max" deliberately omits from_date, which is the
 * only case where the full (up to 18-year) daily series is worth pulling.
 */
const PERIODS = [
  { value: '1y', label: '1Y', years: 1 },
  { value: '3y', label: '3Y', years: 3 },
  { value: '5y', label: '5Y', years: 5 },
  { value: 'max', label: 'MAX', years: null },
];

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tip">
      <div className="d">{new Date(point.t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      <div className="v">NAV {fmtNum(point.nav, 4)}</div>
    </div>
  );
}

export default function NavChart({ schemeId, amfiCode }) {
  const [period, setPeriod] = useState('1y');
  const active = PERIODS.find((p) => p.value === period);

  const fetcher = useCallback(
    (opts) => {
      const params = active.years ? { from_date: isoYearsAgo(active.years) } : {};
      // Prefer the scheme id; AMFI code is the fallback the API also accepts.
      return schemeId
        ? api.nav(schemeId, params, opts)
        : api.navByAmfi(amfiCode, params, opts);
    },
    [schemeId, amfiCode, active]
  );

  const { data, loading, error, refetch } = useApi(fetcher, [schemeId, amfiCode, period], {
    enabled: Boolean(schemeId || amfiCode),
  });

  const series = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data
      .filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[1])))
      .map(([t, nav]) => ({ t: Number(t), nav: Number(nav) }));
  }, [data]);

  // Simple point-to-point change over whatever window is displayed.
  const change = useMemo(() => {
    if (series.length < 2) return null;
    const first = series[0].nav;
    const last = series[series.length - 1].nav;
    if (!first) return null;
    return ((last - first) / first) * 100;
  }, [series]);

  const yDomain = useMemo(() => {
    if (series.length === 0) return ['auto', 'auto'];
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of series) {
      if (p.nav < lo) lo = p.nav;
      if (p.nav > hi) hi = p.nav;
    }
    const pad = (hi - lo) * 0.06 || hi * 0.02 || 1;
    return [lo - pad, hi + pad];
  }, [series]);

  const multiYear = active.years === null || active.years > 1;

  return (
    <section className="panel">
      <header className="panel-head">
        <span className="panel-title">NAV History</span>
        {series.length > 0 && (
          <span className="panel-note">
            {series.length.toLocaleString('en-IN')} points ·{' '}
            <span className={signClass(change)}>{fmtPct(change, { sign: true })}</span> over period
          </span>
        )}
        <span className="spacer" />
        <Seg options={PERIODS} value={period} onChange={setPeriod} />
      </header>

      <div className="panel-body">
        <SectionState
          loading={loading}
          error={error}
          onRetry={refetch}
          empty={!loading && series.length === 0}
          emptyText="No NAV history reported for this scheme."
          rows={8}
        >
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1e242d" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fill: '#63707f', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                  tickLine={false}
                  axisLine={{ stroke: '#262d38' }}
                  minTickGap={48}
                  tickFormatter={(t) =>
                    new Date(t).toLocaleDateString('en-IN', {
                      month: 'short',
                      ...(multiYear ? { year: '2-digit' } : { day: '2-digit' }),
                    })
                  }
                />
                <YAxis
                  domain={yDomain}
                  width={62}
                  tick={{ fill: '#63707f', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v.toFixed(v > 1000 ? 0 : 1)}
                />
                <Tooltip content={<Tip />} cursor={{ stroke: '#2f4a63' }} />
                <Line
                  type="monotone"
                  dataKey="nav"
                  stroke="#5e9ed6"
                  strokeWidth={1.4}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionState>
      </div>
    </section>
  );
}
