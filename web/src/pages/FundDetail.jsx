import { useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { ErrorBanner, Loading } from '../components/ui.jsx';
import Overview from '../components/tabs/Overview.jsx';
import Performance from '../components/tabs/Performance.jsx';
import Holdings from '../components/tabs/Holdings.jsx';
import Risk from '../components/tabs/Risk.jsx';
import { dash, fmtNum, fmtPct, fmtRupees, signClass } from '../lib/format.js';
import { schemeStats } from '../lib/mfdata.js';

const TABS = [
  { id: 'overview', label: 'Overview', Component: Overview },
  { id: 'performance', label: 'Performance', Component: Performance },
  { id: 'holdings', label: 'Holdings', Component: Holdings },
  { id: 'risk', label: 'Risk', Component: Risk },
];

export default function FundDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabId = params.get('tab') ?? 'overview';
  const active = TABS.find((t) => t.id === tabId) ?? TABS[0];

  const schemeFetcher = useCallback((opts) => api.scheme(id, {}, opts), [id]);
  const { data: scheme, loading, error, refetch } = useApi(schemeFetcher, [id]);

  // Independent, best-effort: a missing factsheet must not break the page.
  const isin = scheme?.scheme_isin;
  const factsheetFetcher = useCallback((opts) => api.factsheetLink(isin, opts), [isin]);
  const { data: factsheet } = useApi(factsheetFetcher, [isin], { enabled: Boolean(isin) });

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-body"><Loading rows={12} /></div>
      </section>
    );
  }

  if (error) {
    return (
      <>
        <ErrorBanner error={error} onRetry={refetch} />
        <div className="state">
          {error.status === 404 ? 'That scheme does not exist.' : null} <Link to="/">← Back to explorer</Link>
        </div>
      </>
    );
  }

  if (!scheme) return <div className="state">No scheme data.</div>;

  const Body = active.Component;
  // Detail responses null these out; schemeStats recovers them from mf_data.
  const stats = schemeStats(scheme);

  return (
    <>
      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="fund-head">
          <div style={{ marginBottom: 6 }}>
            <button
              type="button"
              className="link-btn"
              style={{ fontFamily: 'var(--mono)', fontSize: 11 }}
              onClick={() => navigate(-1)}
            >
              ← Back
            </button>
          </div>
          <h1>{dash(scheme.name)}</h1>
          <div className="meta">
            <span>{dash(scheme.scheme_amc_name)}</span>
            <span className="dot">│</span>
            <span className="chip">{dash(scheme.scheme_sub_category || scheme.scheme_category)}</span>
            <span className="chip">{dash(scheme.scheme_plan)}</span>
            <span className="chip">{dash(scheme.scheme_option)}</span>
            <span className="dot">│</span>
            <span>{dash(scheme.scheme_isin)}</span>
            {scheme.scheme_amfi_code && (
              <>
                <span className="dot">│</span>
                <span>AMFI {scheme.scheme_amfi_code}</span>
              </>
            )}
          </div>
        </div>

        <div className="statbar">
          <div className="stat">
            <div className="k">AUM</div>
            <div className="v">{fmtRupees(stats.aum)}</div>
          </div>
          <div className="stat">
            <div className="k">TER</div>
            <div className="v">{fmtNum(stats.ter, 2)}%</div>
          </div>
          <div className="stat">
            <div className="k">1Y</div>
            <div className={`v ${signClass(stats.returns_1y)}`}>{fmtPct(stats.returns_1y, { sign: true })}</div>
          </div>
          <div className="stat">
            <div className="k">3Y</div>
            <div className={`v ${signClass(stats.returns_3y)}`}>{fmtPct(stats.returns_3y, { sign: true })}</div>
          </div>
          <div className="stat">
            <div className="k">5Y</div>
            <div className={`v ${signClass(stats.returns_5y)}`}>{fmtPct(stats.returns_5y, { sign: true })}</div>
          </div>
          <div className="stat">
            <div className="k">Rating</div>
            <div className="v">{stats.rating ? '★'.repeat(Math.round(stats.rating)) : '—'}</div>
          </div>
        </div>

        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === active.id ? 'on' : ''}
              onClick={() => setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', t.id);
                return next;
              }, { replace: true })}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </section>

      <Body scheme={scheme} factsheetLink={factsheet?.link} />
    </>
  );
}
