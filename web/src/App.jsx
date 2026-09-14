import { Link, Route, Routes } from 'react-router-dom';
import Explorer from './pages/Explorer.jsx';
import FundDetail from './pages/FundDetail.jsx';
import { api } from './lib/api.js';
import { useApi } from './lib/useApi.js';
import { useCallback } from 'react';

/** Surfaces a missing/!broken partner token once, at the top of the app. */
function AuthNotice() {
  const fetcher = useCallback((opts) => api.health(opts), []);
  const { data, error } = useApi(fetcher, []);

  if (error) {
    return (
      <div className="banner error">
        <span>Cannot reach the Ledger proxy on port 8787. Start it with <code>npm run dev</code>.</span>
      </div>
    );
  }
  if (data && data.auth && !data.auth.configured) {
    return (
      <div className="banner error">
        <span>
          No partner token configured. Copy <code>.env.example</code> to <code>.env</code>,
          set <code>PARTNER_ACCESS_TOKEN</code>, and restart the proxy.
        </span>
      </div>
    );
  }
  return null;
}

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="tick">▚</span>Ledger
        </Link>
        <span className="sub">MF RESEARCH TERMINAL</span>
        <span className="spacer" />
        <span className="sub">app2.mfapis.club · v2</span>
      </header>

      <main className="main">
        <AuthNotice />
        <Routes>
          <Route path="/" element={<Explorer />} />
          <Route path="/fund/:id" element={<FundDetail />} />
          <Route path="*" element={<div className="state">Nothing here. <Link to="/">Back to explorer</Link></div>} />
        </Routes>
      </main>
    </div>
  );
}
