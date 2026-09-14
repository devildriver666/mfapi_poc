/**
 * Vercel serverless entry point.
 *
 * Routed explicitly from vercel.json ("/api/(.*)" -> "/api") rather than
 * relying on filename-based catch-all inference: an api/[...slug].js file was
 * matching only one path segment in practice, so /api/scheme/:id never
 * reached the function at all.
 *
 * An Express app is already a (req, res) handler, so it exports as-is.
 */
export { default } from '../server/src/app.js';
