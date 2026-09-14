import { Panel, Empty } from '../ui.jsx';
import {
  assetAllocation,
  fmtSettlement,
  managers,
  researchRow,
  schemeStats,
  supplemental,
} from '../../lib/mfdata.js';
import { dash, fmtDate, fmtNum, fmtPct, fmtRupees, num } from '../../lib/format.js';

const DOCS = [
  ['factsheet_url', 'Factsheet'],
  ['kim_url', 'KIM'],
  ['sid_url', 'SID'],
  ['sia_url', 'SIA'],
  ['portfolio_disclosure_url', 'Portfolio Disclosure'],
];

function Row({ k, v }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

export default function Overview({ scheme, factsheetLink }) {
  const mf = scheme?.mf_data ?? {};
  const research = researchRow(mf);
  const supp = supplemental(mf);
  const team = managers(mf);
  const alloc = assetAllocation(mf);
  const stats = schemeStats(scheme);
  const allocAsOf = mf.asset_allocation_as_of ?? alloc.asOf;

  const docs = DOCS.map(([key, label]) => [label, supp?.[key]]).filter(([, url]) => url);
  // /scheme/factsheet/:isin resolves a link even when supplemental_data has none.
  if (factsheetLink && !docs.some(([label]) => label === 'Factsheet')) {
    docs.unshift(['Factsheet', factsheetLink]);
  }

  return (
    <>
      <div className="grid-2">
        <Panel title="Fund Profile">
          <dl className="kv">
            <Row k="AUM" v={fmtRupees(stats.aum)} />
            <Row k="Expense Ratio" v={`${fmtNum(stats.ter, 2)}%`} />
            <Row k="Fee Level" v={dash(research?.fee_level)} />
            <Row k="Inception" v={fmtDate(research?.inception_date)} />
            <Row k="Category" v={dash(scheme?.scheme_category)} />
            <Row k="Sub-category" v={dash(scheme?.scheme_sub_category)} />
            <Row k="SEBI Category" v={dash(supp?.sebi_category_name)} />
            <Row k="Plan / Option" v={`${dash(scheme?.scheme_plan)} · ${dash(scheme?.scheme_option)}`} />
            <Row k="Risk Level" v={dash(supp?.risk_level)} />
            <Row k="Rating" v={stats.rating ? '★'.repeat(Math.round(stats.rating)) : '—'} />
            <Row k="Investment Style" v={dash(research?.investment_style)} />
            <Row k="Min Investment" v={research?.min_initial_investment != null ? fmtRupees(research.min_initial_investment) : '—'} />
            <Row k="Turnover" v={research?.turnover != null ? `${fmtNum(research.turnover, 1)}%` : '—'} />
            <Row k="Top 10 Weight" v={research?.percent_assets_top_10 != null ? `${fmtNum(research.percent_assets_top_10, 1)}%` : '—'} />
          </dl>
        </Panel>

        <div>
          <Panel title="Exit Load & Identifiers">
            <dl className="kv">
              <Row k="Exit Load" v={scheme?.scheme_exit_load != null ? `${fmtNum(scheme.scheme_exit_load, 2)}%` : '—'} />
              <Row k="Load Structure" v={dash(research?.load)} />
              <Row k="Remarks" v={<span style={{ whiteSpace: 'normal' }}>{dash(scheme?.scheme_exit_load_remarks)}</span>} />
              <Row k="Settlement" v={dash(fmtSettlement(scheme?.scheme_redemption_settlement_days))} />
              <Row k="ISIN" v={dash(scheme?.scheme_isin)} />
              <Row k="AMFI Code" v={dash(scheme?.scheme_amfi_code)} />
            </dl>
          </Panel>

          <Panel title="Fund Managers" note={team.length ? `${team.length} on record` : undefined} bodyClass="">
            {team.length === 0 ? (
              <Empty>No management team reported.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Manager</th>
                      <th className="num">From</th>
                      <th className="num">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((m, i) => (
                      <tr key={`${m.manager_name}-${i}`}>
                        <td>{dash(m.manager_name)}</td>
                        <td className="num">{fmtDate(m.start_date)}</td>
                        <td className="num">{m.end_date ? fmtDate(m.end_date) : <span className="pos">Current</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Documents">
            {docs.length === 0 ? (
              <Empty>No documents linked.</Empty>
            ) : (
              <div className="doc-links">
                {docs.map(([label, url]) => (
                  <a key={label} href={url} target="_blank" rel="noreferrer noopener">
                    {label} ↗
                  </a>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Asset Allocation"
        note={allocAsOf ? `as of ${fmtDate(allocAsOf)}` : undefined}
        bodyClass=""
      >
        {alloc.rows.length === 0 ? (
          <Empty>No asset allocation reported.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Asset Class</th>
                  <th className="num">Net %</th>
                  <th className="num">Long %</th>
                  <th className="num">Short %</th>
                  <th className="num">Category %</th>
                  <th className="num">Index %</th>
                  <th style={{ width: '22%' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {alloc.rows.map((r, i) => {
                  const net = num(r.net);
                  return (
                    <tr key={`${r.asset_class}-${i}`}>
                      <td>{dash(r.asset_class)}</td>
                      <td className="num">{fmtPct(r.net)}</td>
                      <td className="num">{fmtPct(r.long)}</td>
                      <td className="num">{fmtPct(r.short)}</td>
                      <td className="num" style={{ color: 'var(--text-mute)' }}>{fmtPct(r.category)}</td>
                      <td className="num" style={{ color: 'var(--text-mute)' }}>{fmtPct(r.index)}</td>
                      <td>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, net ?? 0))}%` }} />
                        </div>
                      </td>
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
