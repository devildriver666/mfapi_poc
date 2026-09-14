import { Router } from 'express';
import { forward, seg } from '../upstream.js';

const router = Router();

router.get(
  '/history/:snapshotId',
  forward((req) => `/amc_factsheet/history/${seg(req.params.snapshotId)}`, [])
);

router.get(
  '/history',
  forward('/amc_factsheet/history', [
    'page', 'limit', 'amc_slug', 'isin', 'scheme_name', 'fund_name',
    'q', 'plan', 'option', 'from_month', 'to_month', 'year', 'include_holdings',
  ])
);

export default router;
