/* GET /api/admin/history/:table/:key
   Previous versions of one dataset or build, newest first (up to 50).
   :table is "datasets" or "builds". */
import { sb, q } from '../../../../_lib/supabase.js';
import { json, error, fail, NO_STORE } from '../../../../_lib/http.js';

const TABLES = ['datasets', 'builds'];
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

export async function onRequestGet({ params, env }) {
  const table = String(params.table || '');
  const key = String(params.key || '');
  if (!TABLES.includes(table) || !KEY_RE.test(key)) return error(404, 'not found');
  try {
    const rows = await sb(env, 'secret',
      `content_history?table_name=eq.${table}&row_key=eq.${q(key)}` +
      '&select=version,changed_at,changed_by,extra,data&order=version.desc&limit=50');
    return json(rows, 200, NO_STORE);
  } catch (e) { return fail(e); }
}
