import { Empty, Panel } from '../ui.jsx';
import NavChart from '../NavChart.jsx';
import { TRAILING_PERIODS, calendarReturns, trailingReturns } from '../../lib/mfdata.js';
import { dash, fmtNum, fmtPct, signClass } from '../../lib/format.js';

export default function Performance({ scheme }) {
  const mf = scheme?.mf_data ?? {};
  const trailing = trailingReturns(scheme);
  const calendar = calendarReturns(mf);

  const trailingCells = TRAILING_PERIODS.map((p) => ({ ...p, value: trailing?.[p.key] }));
  const hasTrailing = trailingCells.some((c) => c.value != null);

  return (
    <>
      <Panel
        title="Trailing Returns"
        note={trailing?.is_rolling ? 'rolling' : 'point-to-point · annualised beyond 1Y'}
        bodyClass=""
      >
        {!hasTrailing ? (
          <Empty>No trailing returns reported.</Empty>
        ) : (
          <div className="statbar" style={{ borderTop: 'none' }}>
            {trailingCells.map((c) => (
              <div className="stat" key={c.key}>
                <div className="k">{c.label}</div>
                <div className={`v ${signClass(c.value)}`}>{fmtPct(c.value, { sign: true })}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <NavChart schemeId={scheme?.id} amfiCode={scheme?.scheme_amfi_code} />

      <Panel
        title="Calendar-Year Returns"
        note={calendar[0]?.category_name ? `vs ${calendar[0].category_name}` : undefined}
        bodyClass=""
      >
        {calendar.length === 0 ? (
          <Empty>No calendar-year history reported.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="num">Fund %</th>
                  <th className="num">Category %</th>
                  <th className="num">Index %</th>
                  <th className="num" title="Percentile rank within category — lower is better">
                    Rank
                  </th>
                  <th className="num">Funds in Cat.</th>
                  <th className="num" title="Fund return minus category return">
                    vs Cat.
                  </th>
                </tr>
              </thead>
              <tbody>
                {calendar.map((r) => {
                  const excess =
                    r.investment_return != null && r.category_return != null
                      ? r.investment_return - r.category_return
                      : null;
                  return (
                    <tr key={r.year}>
                      <td>{dash(r.year)}</td>
                      <td className={`num ${signClass(r.investment_return)}`}>
                        {fmtPct(r.investment_return, { sign: true })}
                      </td>
                      <td className="num" style={{ color: 'var(--text-dim)' }}>
                        {fmtPct(r.category_return, { sign: true })}
                      </td>
                      <td className="num" style={{ color: 'var(--text-mute)' }}>
                        {fmtPct(r.index_return, { sign: true })}
                      </td>
                      <td className="num">
                        {r.percentile_rank != null ? fmtNum(r.percentile_rank, 0) : '—'}
                      </td>
                      <td className="num" style={{ color: 'var(--text-mute)' }}>
                        {r.num_invest_in_cat != null ? fmtNum(r.num_invest_in_cat, 0) : '—'}
                      </td>
                      <td className={`num ${signClass(excess)}`}>{fmtPct(excess, { sign: true })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
