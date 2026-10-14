/* Small response helpers shared by every Function. */
import { DbError } from './db.js';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export const NO_STORE = { 'Cache-Control': 'no-store' };

export function error(status, message) {
  return json({ error: message }, status, NO_STORE);
}

/** Convert anything thrown into a JSON error response. */
export function fail(e) {
  if (e instanceof DbError) {
    console.error(e.message);
    if (e.status === 409) return error(409, 'conflict');
    if (e.status === 400) return error(400, e.detail);
    if (/^(missing DB binding|tables not created)/.test(e.detail)) return error(503, 'not configured: ' + e.detail + ' (see /api/health)');
    return error(502, 'database error (see /api/health)');
  }
  console.error(e && e.stack ? e.stack : e);
  return error(500, 'server error');
}

/** Read and parse a JSON request body, or return null. */
export async function readJSON(request) {
  try { return await request.json(); } catch { return null; }
}

/**
 * Serve a GET from Cloudflare's edge cache when possible.
 * Only used for URLs that carry a ?v= version, which never change content,
 * so they can be cached for a year. (The Cache API only works on your custom
 * domain, not on workers.dev — elsewhere it simply does nothing.)
 */
export async function cached(context, produce) {
  const { request } = context;
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  const res = await produce();
  if (cache && res.ok) {
    context.waitUntil(cache.put(request, res.clone()));
  }
  return res;
}

export const IMMUTABLE = { 'Cache-Control': 'public, max-age=31536000, immutable' };
export const SHORT = { 'Cache-Control': 'public, max-age=60' };
