/**
 * Vercel serverless entry point.
 *
 * A catch-all so every /api/* path reaches the Express app with its original
 * URL intact — Express then does its own routing exactly as it does locally.
 * An Express app is already a (req, res) handler, so it can be exported as-is.
 */
export { default } from '../server/src/app.js';
