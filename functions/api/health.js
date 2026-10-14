/* GET /api/health
   Configuration check: is the database attached, are the tables there, how
   much data is in them, and are the Access settings present. No secrets. */
import { all } from '../_lib/db.js';
import { json, NO_STORE } from '../_lib/http.js';

export async function onRequestGet({ env }) {
  const team = env.ACCESS_TEAM_DOMAIN || '';
  const out = {
    settings: {
      DB: env.DB && typeof env.DB.prepare === 'function' ? 'attached' : 'MISSING (add the d1_databases binding in wrangler.jsonc)',
      ACCESS_TEAM_DOMAIN: !team ? 'MISSING'
        : /^(https?:\/\/)?[a-z0-9-]+\.cloudflareaccess\.com\/?$/.test(team) ? 'set' : 'set, but not in the form <team>.cloudflareaccess.com',
      ACCESS_AUD: !env.ACCESS_AUD ? 'MISSING' : (/^[a-f0-9]{64}$/.test(env.ACCESS_AUD) ? 'set' : 'set, but not a 64-character AUD tag'),
    },
  };
  if (out.settings.DB === 'attached') {
    try {
      const [ds, bs, hs] = await Promise.all([
        all(env, 'SELECT key, version, published FROM datasets ORDER BY key'),
        all(env, 'SELECT status, COUNT(*) AS n FROM builds GROUP BY status'),
        all(env, 'SELECT COUNT(*) AS n FROM content_history'),
      ]);
      out.database = {
        datasets: Object.fromEntries(ds.map(d => [d.key, `v${d.version}${d.published ? '' : ' (admin only)'}`])),
        builds: Object.fromEntries(bs.map(b => [b.status, b.n])),
        history_entries: hs[0] ? hs[0].n : 0,
      };
      if (!ds.length) out.database.note = 'database is empty — restore your backup in the Build Creator (Backup tab)';
    } catch (e) {
      out.database = 'FAILED: ' + (e.detail || e.message);
    }
  }
  return json(out, 200, NO_STORE);
}
