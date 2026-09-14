import { Router } from 'express';
import { forward, seg } from '../upstream.js';

const router = Router();

/**
 * NAV history. Callers should pass from_date for anything but a "Max" chart —
 * without it upstream returns up to 18 years of daily points.
 */
router.get('/amfi/:amfiCode', forward((req) => `/nav/amfi/${seg(req.params.amfiCode)}`, ['from_date']));

router.get('/:id', forward((req) => `/nav/${seg(req.params.id)}`, ['from_date']));

export default router;
