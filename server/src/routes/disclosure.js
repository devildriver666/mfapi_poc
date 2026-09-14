import { Router } from 'express';
import { forward, seg } from '../upstream.js';

const router = Router();

// Static and more-specific paths first.

router.get('/months', forward('/amc_portfolio_disclosure/months', ['isin']));

router.get(
  '/scheme/:isin/holding-changes',
  forward((req) => `/amc_portfolio_disclosure/scheme/${seg(req.params.isin)}/holding-changes`, [
    'period',
    'bucket',
    'holding_name',
  ])
);

router.get(
  '/:disclosureId',
  forward((req) => `/amc_portfolio_disclosure/${seg(req.params.disclosureId)}`, [
    'holdings_page',
    'holdings_limit',
  ])
);

/**
 * Upstream caps from_month..to_month at a 24-month span and returns a 400
 * beyond it. That message is descriptive, so it is passed through untouched
 * rather than pre-validated here.
 */
router.get(
  '/',
  forward('/amc_portfolio_disclosure', [
    'page', 'limit', 'amc_slug', 'scheme_name', 'disclosure_type',
    'isin', 'from_month', 'to_month',
  ])
);

export default router;
