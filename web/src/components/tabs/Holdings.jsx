import { useCallback, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { Empty, Field, Panel, SectionState, Seg } from '../ui.jsx';
import { topBonds, topEquity } from '../../lib/mfdata.js';
import { dash, fmtDate, fmtNum, fmtPct, num, signClass } from '../../lib/format.js';

const TOP_N = 25;

/**
 * The API reports a per-snapshot status, but deriving it from the weight pair
 * keeps the four buckets consistent no matter which snapshot is latest.
 */
function deriveStatus(h) {
  const latest = num(h.latest_weight);
  const oldest = num(h.oldest_weight);
  if (latest !== null && (oldest === null || oldest === 0)) return 'added';
  if ((latest === null || latest === 0) && oldest !== null) return 'removed';
  const change = num(h.absolute_change) ?? (latest ?? 0) - (oldest ?? 0);
  if (change > 0.005) return 'increased';
  if (change < -0.005) return 'decreased';
  return 'unchanged';
}

const STATUS_FILTERS = [
  { value: 'all', label: 'ALL' },
  { value: 'added', label: 'ADDED' },
  { value: 'removed', label: 'EXITED' },
  { value: 'increased', label: 'UP' },
  { value: 'decreased', label: 'DOWN' },
];

function HoldingsTable({ rows, nameField, extra }) {
  if (rows.length === 0) return <Empty>No holdings reported.</Empty>;
  const max = Math.max(...rows.map((r) => num(r.portfolio_weight) ?? 0), 0.0001);

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 34 }} className="num">#</th>
            <th>{nameField === 'bond_name' ? 'Security' : 'Holding'}</th>
            <th>{nameField === 'bond_name' ? 'Rating / Sector' : 'Sector'}</th>
            {extra.map((c) => (
              <th key={c.key} className="num" title={c.title}>{c.label}</th>
            ))}
            <th className="num">Weight %</th>
            <th style={{ width: '16%' }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r[nameField]}-${i}`}>
              <td className="num" style={{ color: 'var(--text-mute)' }}>{i + 1}</td>
              <td><div className="name-cell">{dash(r[nameField])}</div></td>
              <td><div className="name-cell" style={{ maxWidth: 190, color: 'var(--text-dim)' }}>{dash(r.sector)}</div></td>
              {extra.map((c) => (
                <td key={c.key} className={`num ${c.sign ? signClass(r[c.key]) : ''}`}>
                  {c.render(r[c.key])}
                </td>
              ))}
              <td className="num">{fmtNum(r.portfolio_weight, 2)}</td>
              <td>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${((num(r.portfolio_weight) ?? 0) / max) * 100}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoldingChanges({ schemeId }) {
  const [months, setMonths] = useState(3);
  const [holdingType, setHoldingType] = useState('equity');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetcher = useCallback(
    (opts) => api.schemeHoldingChanges(schemeId, { months, holding_type: holdingType }, opts),
    [schemeId, months, holdingType]
  );
  const { data, loading, error, refetch } = useApi(fetcher, [schemeId, months, holdingType], {
    enabled: Boolean(schemeId),
  });

  const { rows, counts } = useMemo(() => {
    const list = (data?.holdings ?? []).map((h) => ({ ...h, status: deriveStatus(h) }));
    const tally = { added: 0, removed: 0, increased: 0, decreased: 0, unchanged: 0 };
    for (const h of list) tally[h.status] += 1;

    const term = search.trim().toLowerCase();
    const filtered = list
      .filter((h) => (statusFilter === 'all' ? true : h.status === statusFilter))
      .filter((h) => (term ? String(h.holding_name ?? '').toLowerCase().includes(term) : true))
      .sort((a, b) => Math.abs(num(b.absolute_change) ?? 0) - Math.abs(num(a.absolute_change) ?? 0));

    return { rows: filtered, counts: tally };
  }, [data, statusFilter, search]);

  const window = data
    ? `${dash(data.earliest_available_snapshot_date)} → ${dash(data.latest_available_snapshot_date)}`
    : undefined;

  return (
    <Panel
      title="Holding Changes"
      note={window}
      bodyClass=""
      actions={
        <Seg
          options={[2, 3, 4, 5, 6].map((m) => ({ value: m, label: `${m}M` }))}
          value={months}
          onChange={setMonths}
        />
      }
    >
      <div className="controls">
        <Field label="Type">
          <select value={holdingType} onChange={(e) => setHoldingType(e.target.value)}>
            <option value="equity">Equity</option>
            <option value="bond">Bond</option>
            <option value="other">Other</option>
            <option value="all">All</option>
          </select>
        </Field>
        <Field label="Change">
          <Seg options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        </Field>
        <input
          className="search-input"
          type="search"
          placeholder="Filter by holding name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {data && (
        <div className="statbar">
          <div className="stat"><div className="k">Added</div><div className="v pos">{counts.added}</div></div>
          <div className="stat"><div className="k">Exited</div><div className="v neg">{counts.removed}</div></div>
          <div className="stat"><div className="k">Increased</div><div className="v pos">{counts.increased}</div></div>
          <div className="stat"><div className="k">Decreased</div><div className="v neg">{counts.decreased}</div></div>
          <div className="stat"><div className="k">Unchanged</div><div className="v" style={{ color: 'var(--text-mute)' }}>{counts.unchanged}</div></div>
          <div className="stat"><div className="k">Snapshots</div><div className="v">{data.snapshot_dates?.length ?? 0}</div></div>
        </div>
      )}

      {data?.fallback_used && (
        <div className="banner" style={{ margin: 12 }}>
          <span>
            No disclosure data for this exact plan. Showing{' '}
            <strong>{data.scheme_name}</strong> ({data.scheme_isin}) instead.
          </span>
        </div>
      )}

      <SectionState
        loading={loading}
        error={error}
        onRetry={refetch}
        empty={!loading && rows.length === 0}
        emptyText={
          data
            ? 'No holdings match this filter.'
            : 'No portfolio disclosures available for this scheme.'
        }
        rows={8}
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Holding</th>
                <th>Sector</th>
                <th className="num">Status</th>
                <th className="num" title={`Weight ${months} months ago`}>Then %</th>
                <th className="num">Now %</th>
                <th className="num">Δ pp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h, i) => (
                <tr key={`${h.holding_name}-${i}`}>
                  <td><div className="name-cell">{dash(h.holding_name)}</div></td>
                  <td><div className="name-cell" style={{ maxWidth: 180, color: 'var(--text-dim)' }}>{dash(h.sector)}</div></td>
                  <td className="num"><span className={`chip ${h.status}`}>{h.status}</span></td>
                  <td className="num" style={{ color: 'var(--text-mute)' }}>{fmtNum(h.oldest_weight, 2)}</td>
                  <td className="num">{fmtNum(h.latest_weight, 2)}</td>
                  <td className={`num ${signClass(h.absolute_change)}`}>
                    {h.absolute_change != null ? fmtNum(h.absolute_change, 2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionState>
    </Panel>
  );
}

export default function Holdings({ scheme }) {
  const mf = scheme?.mf_data ?? {};
  const equity = topEquity(mf, TOP_N);
  const bonds = topBonds(mf, TOP_N);
  // mf_data carries a single as-of stamp for the whole portfolio snapshot.
  const asOf = mf.portfolio_as_of ?? equity.asOf;

  return (
    <>
      <Panel
        title={`Top Equity Holdings`}
        note={asOf ? `top ${equity.rows.length} · as of ${fmtDate(asOf)}` : undefined}
        bodyClass=""
      >
        <HoldingsTable
          rows={equity.rows}
          nameField="holding_name"
          extra={[
            { key: 'one_year_return', label: '1Y %', sign: true, render: (v) => fmtPct(v, { sign: true }) },
            { key: 'forward_pe', label: 'Fwd P/E', render: (v) => fmtNum(v, 1) },
            { key: 'share_change', label: 'Share Δ', sign: true, render: (v) => (v != null ? fmtNum(v, 0) : '—') },
          ]}
        />
      </Panel>

      <Panel
        title="Top Debt Holdings"
        note={asOf ? `top ${bonds.rows.length} · as of ${fmtDate(asOf)}` : undefined}
        bodyClass=""
      >
        <HoldingsTable
          rows={bonds.rows}
          nameField="bond_name"
          extra={[
            { key: 'coupon_rate', label: 'Coupon %', render: (v) => fmtNum(v, 2) },
            { key: 'maturity_date', label: 'Maturity', render: (v) => fmtDate(v) },
          ]}
        />
      </Panel>

      <HoldingChanges schemeId={scheme?.id} />
    </>
  );
}
