/* ============================================================================
   Supabase REST helper for Cloudflare Pages Functions.
   ----------------------------------------------------------------------------
   Environment variables (Pages → Settings → Variables and Secrets):
     SUPABASE_URL              https://<project>.supabase.co
     SUPABASE_PUBLISHABLE_KEY  sb_publishable_…  (or the legacy "anon" key)
     SUPABASE_SECRET_KEY       sb_secret_…       (or the legacy "service_role" key)
                               → add as type "Secret" (encrypted)

   Public endpoints use the publishable key, so Row Level Security limits
   them to published rows. Admin endpoints use the secret key, which bypasses
   RLS — they are only reachable after the Cloudflare Access check in
   functions/api/admin/_middleware.js.
   ============================================================================ */

export class SupabaseError extends Error {
  constructor(status, detail) {
    super(`Supabase ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

function keyHeaders(key) {
  // New-style keys (sb_publishable_ / sb_secret_) go in the apikey header only.
  // Legacy JWT keys (anon / service_role) also need to be the bearer token.
  return key.startsWith('sb_')
    ? { apikey: key }
    : { apikey: key, Authorization: `Bearer ${key}` };
}

function config(env, which) {
  const url = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = which === 'secret' ? env.SUPABASE_SECRET_KEY : env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new SupabaseError(500, `missing SUPABASE_URL or ${which === 'secret' ? 'SUPABASE_SECRET_KEY' : 'SUPABASE_PUBLISHABLE_KEY'}`);
  }
  return { url, key };
}

/**
 * Call the Supabase REST API (PostgREST).
 *   which:  'public' (publishable key) | 'secret'
 *   path:   e.g. 'datasets?key=eq.gear&select=data,version'
 *   opts:   { method, body, prefer }
 * Returns parsed JSON (or null for empty bodies). Throws SupabaseError.
 */
export async function sb(env, which, path, opts = {}) {
  const { url, key } = config(env, which);
  const headers = { ...keyHeaders(key), Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.prefer) headers.Prefer = opts.prefer;

  let r;
  try {
    r = await fetch(`${url}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new SupabaseError(502, 'unreachable: ' + e.message);
  }

  const text = await r.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = text; }
  }
  if (!r.ok) {
    const detail = (json && (json.message || json.error || json.hint)) || text || r.statusText;
    // 23505 = unique violation (row already exists) → surface as a conflict
    const status = json && json.code === '23505' ? 409 : r.status;
    throw new SupabaseError(status, detail);
  }
  return json;
}

/** Encode a value for a PostgREST filter, e.g. eq.<value>. */
export function q(value) {
  return encodeURIComponent(String(value));
}
