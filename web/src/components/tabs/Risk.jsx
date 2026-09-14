import { useMemo, useState } from 'react';
import { Empty, Panel, Seg } from '../ui.jsx';
import {
  categoryRow,
  indexRow,
  pickPrimary,
  riskPeriods,
  riskRow,
  volatilityRow,
} from '../../lib/mfdata.js';
import { fmtDate, fmtNum, num, signClass } from '../../lib/format.js';

/** Risk/return stats, each with the fund value plus its category and index peers. */
const RISK_METRICS = [
  { key: 'alpha', label: 'Alpha', digits: 2, sign: true, title: 'Excess return vs benchmark' },
  { key: 'beta', label: 'Beta', digits: 2, title: 'Sensitivity to benchmark moves' },
  { key: 'r_squared', label: 'R²', digits: 1, title: 'Share of movement explained by the benchmark' },
  { key: 'sharpe_ratio', label: 'Sharpe Ratio', digits: 2, sign: true, title: 'Return per unit of total risk' },
  { key: 'standard_deviation', label: 'Std Deviation', digits: 2, title: 'Annualised volatility' },
  { key: 'sortino', label: 'Sortino', digits: 2, sign: true, title: 'Return per unit of downside risk', soloOnly: true },
  { key: 'tracking_error', label: 'Tracking Error', digits: 3, title: 'Deviation from the benchmark', soloOnly: true },
  { key: 'correlation', label: 'Correlation', digits: 3, title: 'Co-movement with the benchmark', soloOnly: true },
];

const VOL_METRICS = [
  { key: 'upside_capture', label: 'Upside Capture', digits: 1, suffix: '%' },
  { key: 'downside_capture', label: 'Downside Capture', digits: 1, suffix: '%', invert: true },
  { key: 'max_drawdown', label: 'Max Drawdown', digits: 2, suffix: '%', sign: true, investmentKey: 'max_drawdown_investment' },
];

const CAP_BUCKETS = [
  ['giant', 'Giant'],
  ['large', 'Large'],
  ['medium', 'Mid'],
  ['small', 'Small'],
  ['micro', 'Micro'],
];

const VALUATION = [
  ['price_earnings', 'P/E', 2],
  ['price_book', 'P/B', 2],
  ['price_sales', 'P/S', 2],
  ['price_cashflow', 'P/CF', 2],
  ['dividend_yield', 'Dividend Yield', 2, '%'],
  ['long_term_earnings', 'LT Earnings Growth', 2, '%'],
  ['historical_earnings', 'Historical Earnings', 2, '%'],
  ['sales_growth', 'Sales Growth', 2, '%'],
  ['book_value_growth', 'Book Value Growth', 2, '%'],
  ['cash_flow_growth', 'Cash Flow Growth', 2, '%'],
];

function ComparisonTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Metric</th>
            <th className="num">Fund</th>
            <th className="num">Category</th>
            <th className="num">Index</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td title={r.title}>{r.label}</td>
              <td className={`num ${r.sign ? signClass(r.fund) : ''}`}>{r.fundText}</td>
              <td className="num" style={{ color: 'var(--text-dim)' }}>{r.categoryText}</td>
              <td className="num" style={{ color: 'var(--text-mute)' }}>{r.indexText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Risk({ scheme }) {
  const mf = scheme?.mf_data ?? {};
  const periods = useMemo(() => riskPeriods(mf), [mf]);
  const [period, setPeriod] = useState(null);

  // Default to the 3-year window when present — the conventional lens.
  const activePeriod = period ?? (periods.includes(3) ? 3 : periods[0] ?? null);

  const risk = activePeriod != null ? riskRow(mf, activePeriod) : null;
  const vol = activePeriod != null ? volatilityRow(mf, activePeriod) : null;

  const capRow = pickPrimary(mf.market_cap, 'cap_of');
  const capCategory = categoryRow(mf.market_cap, 'cap_of');
  const styleRow = pickPrimary(mf.style_measures, 'measure_of');
  const styleCategory = categoryRow(mf.style_measures, 'measure_of');
  const styleIndex = indexRow(mf.style_measures, 'measure_of');

  const fmt = (v, digits, suffix = '', sign = false) => {
    const n = num(v);
    if (n === null) return '—';
    return `${sign && n > 0 ? '+' : ''}${fmtNum(n, digits)}${suffix}`;
  };

  const riskRows = RISK_METRICS.filter((m) => !m.soloOnly || risk?.[m.key] != null).map((m) => {
    const suffix = m.key === 'r_squared' ? '%' : '';
    return {
      label: m.label,
      title: m.title,
      sign: m.sign,
      fund: risk?.[m.key],
      fundText: fmt(risk?.[m.key], m.digits, suffix, m.sign),
      categoryText: m.soloOnly ? '—' : fmt(risk?.[`${m.key}_category`], m.digits, suffix),
      indexText: m.soloOnly ? '—' : fmt(risk?.[`${m.key}_index`], m.digits, suffix),
    };
  });

  const volRows = VOL_METRICS.map((m) => {
    const base = m.investmentKey ?? m.key;
    const fundValue = vol?.[base];
    return {
      label: m.label,
      sign: m.sign,
      fund: fundValue,
      fundText: fmt(fundValue, m.digits, m.suffix, m.sign),
      categoryText: fmt(vol?.[`${m.key}_category`], m.digits, m.suffix),
      indexText: fmt(vol?.[`${m.key}_index`], m.digits, m.suffix),
    };
  });

  const capTotal = CAP_BUCKETS.reduce((sum, [k]) => sum + (num(capRow?.[k]) ?? 0), 0);

  return (
    <>
      <Panel
        title="Risk & Volatility"
        note={
          risk?.calculation_benchmark
            ? `vs ${risk.calculation_benchmark}`
            : vol?.calculation_benchmark
              ? `vs ${vol.calculation_benchmark}`
              : undefined
        }
        bodyClass=""
        actions={
          periods.length > 0 && (
            <Seg
              options={periods.map((p) => ({ value: p, label: `${p}Y` }))}
              value={activePeriod}
              onChange={setPeriod}
            />
          )
        }
      >
        {!risk && !vol ? (
          <Empty>No risk statistics reported for this scheme.</Empty>
        ) : (
          <div className="grid-2" style={{ padding: 12 }}>
            <section className="panel">
              <header className="panel-head"><span className="panel-title">Return / Risk</span></header>
              {risk ? <ComparisonTable rows={riskRows} /> : <Empty>Not reported.</Empty>}
            </section>
            <section className="panel">
              <header className="panel-head">
                <span className="panel-title">Capture & Drawdown</span>
                {vol?.drawdown_peak && (
                  <span className="panel-note">
                    {fmtDate(vol.drawdown_peak)} → {fmtDate(vol.drawdown_valley)}
                    {vol.max_drawdown_duration ? ` · ${vol.max_drawdown_duration} mo` : ''}
                  </span>
                )}
              </header>
              {vol ? <ComparisonTable rows={volRows} /> : <Empty>Not reported.</Empty>}
            </section>
          </div>
        )}
      </Panel>

      <div className="grid-2">
        <Panel
          title="Market-Cap Mix"
          note={capRow?.asof_date ? `as of ${fmtDate(capRow.asof_date)}` : undefined}
          bodyClass=""
        >
          {!capRow || capTotal === 0 ? (
            <Empty>No market-cap breakdown reported.</Empty>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th className="num">Fund %</th>
                      <th className="num">Category %</th>
                      <th style={{ width: '32%' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {CAP_BUCKETS.map(([key, label]) => {
                      const v = num(capRow?.[key]) ?? 0;
                      return (
                        <tr key={key}>
                          <td>{label}</td>
                          <td className="num">{fmtNum(capRow?.[key], 2)}</td>
                          <td className="num" style={{ color: 'var(--text-mute)' }}>
                            {fmtNum(capCategory?.[key], 2)}
                          </td>
                          <td>
                            <div className="bar-track">
                              <div className="bar-fill" style={{ width: `${Math.min(100, v)}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {capRow?.avgmarketcap != null && (
                <div className="footer-bar">
                  <span>Average market cap</span>
                  <span className="spacer" />
                  <span>{fmtNum(capRow.avgmarketcap, 0)}</span>
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel title="Valuation & Growth" bodyClass="">
          {!styleRow ? (
            <Empty>No style measures reported.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th className="num">Fund</th>
                    <th className="num">Category</th>
                    <th className="num">Index</th>
                  </tr>
                </thead>
                <tbody>
                  {VALUATION.map(([key, label, digits, suffix = '']) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td className="num">{styleRow?.[key] != null ? `${fmtNum(styleRow[key], digits)}${suffix}` : '—'}</td>
                      <td className="num" style={{ color: 'var(--text-dim)' }}>
                        {styleCategory?.[key] != null ? `${fmtNum(styleCategory[key], digits)}${suffix}` : '—'}
                      </td>
                      <td className="num" style={{ color: 'var(--text-mute)' }}>
                        {styleIndex?.[key] != null ? `${fmtNum(styleIndex[key], digits)}${suffix}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
