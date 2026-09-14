import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/useApi.js';
import { Field, Panel, SectionState, Select, Th } from '../components/ui.jsx';
import { dash, fmtNum, fmtPct, fmtRupees, signClass } from '../lib/format.js';

const PAGE_SIZE = 50;

/** Column definitions. `sortKey` values are the upstream sort_by vocabulary. */
const COLUMNS = [
  { key: 'name', label: 'Scheme', sortKey: 'name' },
  { key: 'category', label: 'Category' },
  { key: 'plan', label: 'Plan' },
  { key: 'aum', label: 'AUM', sortKey: 'aum', numeric: true },
  { key: 'ter', label: 'TER %', sortKey: 'ter', numeric: true, title: 'Total expense ratio' },
  { key: 'returns_1y', label: '1Y', sortKey: 'returns_1y', numeric: true },
  { key: 'returns_3y', label: '3Y', sortKey: 'returns_3y', numeric: true },
  { key: 'returns_5y', label: '5Y', sortKey: 'returns_5y', numeric: true },
  { key: 'rating', label: 'Rating', sortKey: 'rating', numeric: true },
];

export default function Explorer() {
  const navigate = useNavigate();
  // Filters live in the URL so a result set is shareable and survives Back.
  const [params, setParams] = useSearchParams();

  const get = (k, fallback = '') => params.get(k) ?? fallback;
  const page = Math.max(1, Number(get('page', '1')) || 1);
  const sortBy = get('sort_by', 'aum');
  const sortDir = get('sort_dir', 'desc');

  const [queryText, setQueryText] = useState(get('q'));
  const debouncedQuery = useDebounced(queryText, 300);

  /** Merge patch into the URL; any change but paging resets to page 1. */
  const update = useCallback(
    (patch, { keepPage = false } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === '' || v === null || v === undefined) next.delete(k);
            else next.set(k, String(v));
          }
          if (!keepPage) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const optionsFetcher = useCallback((opts) => api.filterOptions(opts), []);
  const { data: filterOptions } = useApi(optionsFetcher, []);

  const category = get('category');
  const subCategory = get('sub_category');
  const amc = get('amc');
  const plan = get('plan');
  const includeIdcw = get('include_idcw_options') === 'true';

  const query = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      q: debouncedQuery || undefined,
      category: category || undefined,
      sub_category: subCategory || undefined,
      amc: amc || undefined,
      plan: plan || undefined,
      include_idcw_options: includeIdcw ? 'true' : undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [page, debouncedQuery, category, subCategory, amc, plan, includeIdcw, sortBy, sortDir]
  );

  const listFetcher = useCallback((opts) => api.schemes(query, opts), [query]);
  const { data, loading, error, refetch } = useApi(listFetcher, [query]);

  const rows = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // The debounced value is what actually drives the request; mirror it into
  // the URL once it settles. Skipped on mount so an inbound ?q= link survives.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (debouncedQuery !== (params.get('q') ?? '')) update({ q: debouncedQuery });
  }, [debouncedQuery, params, update]);

  const onSort = (key) => {
    // Same column toggles direction; a new column starts descending, except
    // name, where A→Z is the useful default.
    if (key === sortBy) {
      update({ sort_dir: sortDir === 'asc' ? 'desc' : 'asc' });
    } else {
      update({ sort_by: key, sort_dir: key === 'name' ? 'asc' : 'desc' });
    }
  };

  const resetAll = () => {
    setQueryText('');
    setParams(new URLSearchParams(), { replace: true });
  };

  const hasFilters = Boolean(category || subCategory || amc || plan || queryText || includeIdcw);

  return (
    <Panel
      title="Fund Explorer"
      note={loading ? 'loading…' : `${total.toLocaleString('en-IN')} schemes`}
      bodyClass=""
    >
      <div className="controls">
        <input
          className="search-input"
          type="search"
          placeholder="Search scheme name, AMC, ISIN…"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
        />
        <Field label="Category">
          <Select
            value={category}
            onChange={(v) => update({ category: v, sub_category: '' })}
            options={filterOptions?.categories ?? []}
            placeholder="All categories"
          />
        </Field>
        <Field label="Sub-category">
          <Select
            value={subCategory}
            onChange={(v) => update({ sub_category: v })}
            options={filterOptions?.subCategories ?? []}
            placeholder="All sub-categories"
          />
        </Field>
        <Field label="AMC">
          <Select
            value={amc}
            onChange={(v) => update({ amc: v })}
            options={filterOptions?.amcs ?? []}
            placeholder="All AMCs"
            style={{ maxWidth: 200 }}
          />
        </Field>
        <Field label="Plan">
          <Select
            value={plan}
            onChange={(v) => update({ plan: v })}
            options={filterOptions?.plans ?? []}
            placeholder="All plans"
          />
        </Field>
        <Field label="IDCW">
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 0' }}
          >
            <input
              type="checkbox"
              checked={includeIdcw}
              onChange={(e) => update({ include_idcw_options: e.target.checked ? 'true' : '' })}
            />
            include
          </label>
        </Field>
        {hasFilters && (
          <button type="button" onClick={resetAll} style={{ alignSelf: 'flex-end' }}>
            Clear
          </button>
        )}
      </div>

      <SectionState
        loading={loading && rows.length === 0}
        error={error}
        onRetry={refetch}
        empty={!loading && rows.length === 0}
        emptyText="No schemes match these filters."
        rows={10}
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <Th
                    key={col.key}
                    label={col.label}
                    title={col.title}
                    sortKey={col.sortKey}
                    numeric={col.numeric}
                    active={col.sortKey === sortBy}
                    dir={sortDir}
                    onSort={onSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="clickable"
                  onClick={() => navigate(`/fund/${encodeURIComponent(row.id)}`)}
                >
                  <td>
                    <div className="name-cell">{row.name}</div>
                    <div className="name-cell sub">
                      {row.scheme_amc_name} · {row.scheme_isin}
                    </div>
                  </td>
                  <td>
                    <div className="name-cell" style={{ maxWidth: 200 }}>
                      {dash(row.scheme_sub_category || row.scheme_category)}
                    </div>
                  </td>
                  <td>{dash(row.scheme_plan)}</td>
                  <td className="num">{fmtRupees(row.aum)}</td>
                  <td className="num">{fmtNum(row.ter ?? row.expense_ratio, 2)}</td>
                  <td className={`num ${signClass(row.returns_1y)}`}>{fmtPct(row.returns_1y)}</td>
                  <td className={`num ${signClass(row.returns_3y)}`}>{fmtPct(row.returns_3y)}</td>
                  <td className={`num ${signClass(row.returns_5y)}`}>{fmtPct(row.returns_5y)}</td>
                  <td className="num">{row.rating ? '★'.repeat(Math.round(row.rating)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionState>

      <div className="footer-bar">
        <span>
          {total > 0
            ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString('en-IN')}`
            : '—'}
        </span>
        <span className="spacer" />
        <button type="button" disabled={page <= 1 || loading} onClick={() => update({ page: page - 1 }, { keepPage: true })}>
          ← Prev
        </button>
        <span>
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => update({ page: page + 1 }, { keepPage: true })}
        >
          Next →
        </button>
      </div>
    </Panel>
  );
}
