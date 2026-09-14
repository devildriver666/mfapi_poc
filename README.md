# Ledger

A mutual-fund research POC over the [MF Data API](https://app2.mfapis.club/docs/mf-data-api-docs.html).

Two processes: an **Express proxy** that holds the partner token and talks to
`app2.mfapis.club`, and a **React (Vite) frontend** that talks only to the proxy.

---

## Why a proxy

The upstream API does not send permissive CORS headers, so calling it from
browser JS fails with `Failed to fetch`. It also requires a partner bearer
token, which has no business being in client-side code.

Both problems have the same fix:

```
browser  ──→  localhost:5173 (Vite)  ──/api──→  localhost:8787 (Express)  ──→  app2.mfapis.club
             same origin, no CORS               attaches Authorization here
```

The token is read from `PARTNER_ACCESS_TOKEN` inside the Express process, is
attached in exactly one place (`server/src/upstream.js`), and is never included
in any response body. `GET /api/health` reports *whether* a token is configured,
never its value.

---

## Setup

```bash
npm install
cp .env.example .env      # then paste your token into PARTNER_ACCESS_TOKEN
npm run dev
```

| Process        | Port   | URL                     |
| -------------- | ------ | ----------------------- |
| Frontend (Vite)| `5173` | http://localhost:5173   |
| Proxy (Express)| `8787` | http://localhost:8787   |

Open **http://localhost:5173**. Vite forwards `/api/*` to the proxy, so the
browser only ever sees its own origin.

### Getting a token

Either paste a long-lived one into `.env`:

```bash
PARTNER_ACCESS_TOKEN=eyJ...
```

…or give the proxy credentials and let it log in itself (it calls
`POST /partner/login`, caches the `accessToken` in memory, and re-logs-in once
on a 401):

```bash
PARTNER_IDENTIFIER=partner@example.com
PARTNER_PASSWORD=...
```

`PARTNER_ACCESS_TOKEN` wins if both are set.

### Verifying your token

```bash
npm run probe
```

Hits the main endpoints directly and prints the shape of each response, plus a
row count for every `mf_data` table. Fastest way to tell a bad token from a bad
query.

---

## Scripts

| Command             | Does                                               |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Both processes, colour-tagged `api` / `web`         |
| `npm run dev:api`   | Proxy only (auto-restarts via `node --watch`)       |
| `npm run dev:web`   | Frontend only                                       |
| `npm run build`     | Production build of the frontend into `web/dist`    |
| `npm run probe`     | Smoke-test the upstream API with your token         |

---

## Proxy routes

Every route mirrors the upstream path and query params 1:1 under `/api`. Params
outside each route's allow-list are dropped rather than forwarded, so a typo
surfaces as an ignored filter instead of an upstream 400.

| Proxy route | Upstream |
| --- | --- |
| `GET /api/health` | — (local; reports auth config) |
| `GET /api/scheme` | `/scheme` |
| `GET /api/scheme/amcs` | `/scheme/amcs` |
| `GET /api/scheme/filter-options` | `/scheme/filter-options` |
| `GET /api/scheme/:id` | `/scheme/:id` |
| `GET /api/scheme/mf-data/:id` | `/scheme/mf-data/:id` |
| `GET /api/scheme/:id/related` | `/scheme/:id/related` |
| `GET /api/scheme/:id/holding-changes` | `/scheme/:id/holding-changes` |
| `GET /api/scheme/factsheet/:isin` | `/scheme/factsheet/:isin` |
| `GET /api/nav/:id` | `/nav/:id` |
| `GET /api/nav/amfi/:amfiCode` | `/nav/amfi/:amfi_code` |
| `GET /api/amc_factsheet/history` | `/amc_factsheet/history` |
| `GET /api/amc_factsheet/history/:snapshotId` | `/amc_factsheet/history/:snapshotId` |
| `GET /api/amc_portfolio_disclosure` | `/amc_portfolio_disclosure` |
| `GET /api/amc_portfolio_disclosure/months` | `/amc_portfolio_disclosure/months` |
| `GET /api/amc_portfolio_disclosure/:disclosureId` | `/amc_portfolio_disclosure/:disclosureId` |
| `GET /api/amc_portfolio_disclosure/scheme/:isin/holding-changes` | same |

`limit` is clamped to 100 before forwarding, since upstream 400s above that.
`X-Truncated` is relayed to the browser so the UI can tell when `/related` hit
its 200-result cap.

### Error handling

Every failure reaches the browser in one shape:

```json
{ "success": false, "message": "…", "code": "…", "retryAfter": 42 }
```

| Upstream | Proxy | `code` | Frontend behaviour |
| --- | --- | --- | --- |
| 401 | 401 | `SESSION_EXPIRED` | "Session expired — refresh the partner token" |
| 400 | 400 | `BAD_REQUEST` | Upstream message shown verbatim |
| 404 | 404 | `NOT_FOUND` | Empty state for that section, not an error |
| 429 | 429 | `RATE_LIMITED` | Live countdown, auto-retries once it expires |
| 5xx | 502 | `UPSTREAM_ERROR` | "Try again later" + manual retry |
| timeout | 504 | `UPSTREAM_TIMEOUT` | Same |

The `Retry-After` header is passed through and **clamped to 60s**, which is the
documented ceiling. Nothing in the app ever waits longer, and nothing retries in
a loop — the 401 path retries at most once, and only when the proxy owns the
credentials.

---

## Frontend

### Fund Explorer (`/`)

Debounced search, filters from `/scheme/filter-options`, server-side sorting on
every numeric column, pagination at 50/page. Filter state lives in the URL, so a
result set is shareable and the Back button behaves.

### Fund Detail (`/fund/:id`)

- **Overview** — AUM, expense ratio, inception, exit load, managers, asset
  allocation, document links (factsheet / KIM / SID / SIA / disclosure).
  Falls back to `/scheme/factsheet/:isin` when `supplemental_data` has no link.
- **Performance** — trailing returns (1M→10Y) from `scheme_returns`, NAV chart
  with 1Y/3Y/5Y/Max toggle, calendar-year returns against category and index.
- **Holdings** — top 25 equity and debt holdings by weight, plus a
  holding-changes comparison over a 2–6 month lookback, bucketed into
  added / exited / increased / decreased with weight deltas.
- **Risk** — alpha, beta, R², Sharpe, std deviation (each against category and
  index), upside/downside capture, max drawdown with its peak→valley window,
  market-cap mix, and P/E · P/B · dividend yield.

Each period toggle on the NAV chart sends a matching `from_date`; only **Max**
omits it, which is the one case where the full series is wanted.

### Design

Dark research-terminal palette. Monospaced tabular numerics, 30px table rows,
sortable dense tables rather than card grids. Colour carries signal only:
muted teal for positive, muted rose for negative — no pure red/green.

---

## Layout

```
ledger/
├── .env.example
├── scripts/probe.mjs           API smoke test
├── server/                     Express proxy — the only thing with the token
│   └── src/
│       ├── index.js            app wiring + error envelope
│       ├── token.js            token source (static or login), refresh-on-401
│       ├── upstream.js         fetch + auth header + status mapping
│       └── routes/             scheme · nav · factsheet · disclosure
└── web/                        React + Vite
    └── src/
        ├── lib/                api client · hooks · formatting · mf_data selectors
        ├── components/         ui primitives · NavChart · tabs/
        └── pages/              Explorer · FundDetail
```

---

## Notes and known gaps

Verified against live partner data on 2026-09-14 (HDFC Flexi Cap, 2,619 schemes
in the index). The three field-mapping assumptions flagged during the build are
now resolved:

- **AUM is absolute rupees, not crores.** `scheme.aum` reports
  `1107364118522` for a ₹1.1 lakh crore fund, and `total_assets` uses the same
  scale. Both go through `fmtRupees`. The `min_aum`/`max_aum` filters take the
  same absolute figures.
- **`cap_of` / `measure_of` labels confirmed.** `market_cap` rows are labelled
  `Fund` / `Category` / `Index`, and `style_measures` uses `investment`. The
  regexes in `web/src/lib/mfdata.js` match all four.
- **Holding-change status** stays derived from the weight pair. The live
  buckets reconcile exactly against the API's own counts.

Two behaviours worth knowing:

- **`GET /scheme/:id` returns `null` for `aum`, `ter`, `rating` and
  `returns_1y/3y/5y`** — those only populate on the list endpoint. The detail
  page recovers them from `mf_data.scheme[0]` and `scheme_returns[0]` via
  `schemeStats()`. Without that the stat bar renders empty, so keep the fallback
  if you refactor.
- **`GET /scheme/factsheet/:isin` currently 500s** for at least some ISINs
  (including HDFC Flexi Cap). The proxy maps it to a 502 and the Overview tab
  falls back to `supplemental_data`, which carries the SEBI-hosted KIM/SID/SIA
  links, so the Documents panel still populates.

The docs differ from the live API in three places, none of which affect the UI:

- `/scheme/:id/related` returns a paginated `{list, total, page, limit}`, not
  the bare `SchemeSummary[]` the published type shows.
- `mf_data` carries six tables the docs omit: `ratios` (sortino, tracking error,
  correlation, treynor, fama), `market_cap_amfi`, `amfi_fund_performance`,
  `amfi_ter`, plus top-level `asset_allocation_as_of` and `portfolio_as_of`
  stamps. The Risk tab surfaces sortino, tracking error and correlation; the
  rest are proxied but unused.
- `management_team` rows can include a `fund_manager_rating` object (star
  rating, composite score, peer rank, AUM managed, experience). Not surfaced —
  an easy addition to the Overview tab if you want it.

Still open:

- **`POST /cas/ai/parse` is not implemented.** It was marked optional; it needs
  a multipart passthrough and a fairly different UI. The proxy has no
  file-upload path today.
- **Calendar-year returns are thin.** `mf_data.returns` returned a single `YTD`
  row for this fund, and `category_name` is a code (`IN077`) rather than a
  readable name. The table renders whatever arrives.
- **No caching layer.** Each tab fetches on mount; on a rate-limited token that
  is noticeable.
- **Token expiry.** The token in `.env` is a 7-day JWT, not long-lived. When it
  expires the UI shows "session expired" — swap in a new one, or switch to
  `PARTNER_IDENTIFIER`/`PARTNER_PASSWORD` so the proxy refreshes itself.
