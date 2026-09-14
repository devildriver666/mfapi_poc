import { useRetryCountdown } from '../lib/useApi.js';

export function Panel({ title, note, actions, children, bodyClass = 'panel-body' }) {
  return (
    <section className="panel">
      {(title || actions) && (
        <header className="panel-head">
          {title && <span className="panel-title">{title}</span>}
          {note && <span className="panel-note">{note}</span>}
          <span className="spacer" />
          {actions}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Empty({ children = 'No data available.' }) {
  return <div className="state">{children}</div>;
}

export function Loading({ rows = 6 }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  );
}

/**
 * Renders an API failure. A 429 shows a live countdown and retries itself once
 * the window closes; everything else offers a manual retry.
 */
export function ErrorBanner({ error, onRetry }) {
  const secondsLeft = useRetryCountdown(error, onRetry);
  if (!error) return null;

  const rateLimited = error.code === 'RATE_LIMITED';
  const message = rateLimited && secondsLeft > 0
    ? `Rate limited by the data provider. Retrying in ${secondsLeft}s…`
    : error.userMessage || error.message;

  return (
    <div className={`banner ${error.code === 'RATE_LIMITED' ? '' : 'error'}`}>
      <span>{message}</span>
      <span className="spacer" />
      {onRetry && !rateLimited && (
        <button type="button" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

/**
 * Section-level failure. 404 is not an error state here — the API returns it
 * for "this fund has no disclosure/NAV data", which is an empty state.
 */
export function SectionState({ loading, error, empty, onRetry, children, emptyText, rows }) {
  if (loading) return <Loading rows={rows} />;
  if (error?.status === 404) return <Empty>{emptyText || 'No data reported for this fund.'}</Empty>;
  if (error) return <ErrorBanner error={error} onRetry={onRetry} />;
  if (empty) return <Empty>{emptyText}</Empty>;
  return children;
}

/** Sortable column header. `dir` is 'asc' | 'desc' | null. */
export function Th({ label, sortKey, active, dir, onSort, numeric = false, title }) {
  const classes = [numeric ? 'num' : '', sortKey ? 'sortable' : '', active ? 'active' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <th
      className={classes}
      title={title}
      onClick={sortKey ? () => onSort(sortKey) : undefined}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {active && <span className="arrow">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((opt) => {
        const v = typeof opt === 'object' ? opt.value : opt;
        const label = typeof opt === 'object' ? opt.label : opt;
        return (
          <button
            key={v}
            type="button"
            className={v === value ? 'on' : ''}
            onClick={() => onChange(v)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, style }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={style}>
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}
