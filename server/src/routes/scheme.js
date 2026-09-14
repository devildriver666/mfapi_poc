import { Router } from 'express';
import { forward, seg } from '../upstream.js';

const router = Router();

/** Filters shared by GET /scheme and GET /scheme/amcs. */
const SCHEME_FILTERS = [
  'q', 'name', 'amc', 'category', 'sub_category', 'plan', 'option', 'isin',
  'include_idcw_options',
  'min_1y', 'max_1y', 'min_3y', 'max_3y', 'min_5y', 'max_5y',
  'min_aum', 'max_aum',
  'min_ter', 'max_ter',
  'min_expense_ratio', 'max_expense_ratio',
  'min_rating', 'max_rating',
];

const SCHEME_LIST_PARAMS = ['page', 'limit', ...SCHEME_FILTERS, 'sort_by', 'sort_dir'];

/**
 * Upstream rejects limit > 100 with a 400. The UI never asks for more, but
 * clamping here keeps a hand-crafted URL from producing a confusing error.
 */
function clampLimit(name, max) {
  return (req, _res, next) => {
    const raw = Number(req.query[name]);
    if (Number.isFinite(raw) && raw > max) req.query[name] = String(max);
    next();
  };
}

// --- Static paths must be registered before /:id so they aren't swallowed. ---

router.get('/amcs', forward('/scheme/amcs', SCHEME_FILTERS));

router.get('/filter-options', forward('/scheme/filter-options', []));

router.get('/factsheet/:isin', forward((req) => `/scheme/factsheet/${seg(req.params.isin)}`, []));

router.get('/mf-data/:id', forward((req) => `/scheme/mf-data/${seg(req.params.id)}`, []));

router.get(
  '/:id/related',
  forward((req) => `/scheme/${seg(req.params.id)}/related`, ['scope'])
);

router.get(
  '/:id/holding-changes',
  forward((req) => `/scheme/${seg(req.params.id)}/holding-changes`, [
    'months',
    'holding_type',
    'holding_name',
  ])
);

router.get('/:id', forward((req) => `/scheme/${seg(req.params.id)}`, ['scripbox']));

router.get('/', clampLimit('limit', 100), forward('/scheme', SCHEME_LIST_PARAMS));

export default router;
