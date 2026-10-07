/* GET /api/health
   Configuration check: which settings this deployment can see, and whether
   Supabase accepts each key. Never returns the values themselves. */
import { sb } from '../_lib/supabase.js';
import { json, NO_STORE } from '../_lib/http.js';

function keyKind(v) {
  if (!v) return 'MISSING';
  if (v.startsWith('sb_publishable_')) return 'set (publishable key)';
  if (v.startsWith('sb_secret_')) return 'set (secret key)';
  if (v.split('.').length === 3) return 'set (legacy JWT key)';
  return 'set (unrecognised format)';
}

async function probe(env, which) {
  try {
    const rows = await sb(env, which, 'datasets?select=key&limit=1');
    return `OK (${rows.length ? 'data found' : 'connected, but datasets table is empty'})`;
  } catch (e) {
    return `FAILED: ${e.detail || e.message}`;
  }
}

export async function onRequestGet({ env }) {
  const url = env.SUPABASE_URL || '';
  const team = env.ACCESS_TEAM_DOMAIN || '';
  const out = {
    settings: {
      SUPABASE_URL: !url ? 'MISSING'
        : /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url) ? 'set' : 'set, but not in the form https://<project>.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: keyKind(env.SUPABASE_PUBLISHABLE_KEY),
      SUPABASE_SECRET_KEY: keyKind(env.SUPABASE_SECRET_KEY),
      ACCESS_TEAM_DOMAIN: !team ? 'MISSING'
        : /^(https?:\/\/)?[a-z0-9-]+\.cloudflareaccess\.com\/?$/.test(team) ? 'set' : 'set, but not in the form <team>.cloudflareaccess.com',
      ACCESS_AUD: !env.ACCESS_AUD ? 'MISSING' : (/^[a-f0-9]{64}$/.test(env.ACCESS_AUD) ? 'set' : 'set, but not a 64-character AUD tag'),
    },
  };
  if (url) {
    out.supabase = {
      publishable_key: env.SUPABASE_PUBLISHABLE_KEY ? await probe(env, 'public') : 'skipped (key missing)',
      secret_key: env.SUPABASE_SECRET_KEY ? await probe(env, 'secret') : 'skipped (key missing)',
    };
  }
  return json(out, 200, NO_STORE);
}
