/* GET /api/admin/history/:table/:key
   Previous versions of one dataset or build, newest first (up to 50).
   :table is "datasets" or "builds". */
import { all, parse } from '../../_lib/db.js';
import { json, error, fail, NO_STORE } from '../../_lib/http.js';

const TABLES = ['datasets', 'builds'];
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

export async function onRequestGet({ params, env }) {
  const table = String(params.table || '');
  const key = String(params.key || '');
  if (!TABLES.includes(table) || !KEY_RE.test(key)) return error(404, 'not found');
  try {
    const rows = await all(env,
      `SELECT version, changed_at, changed_by, extra, data FROM content_history
       WHERE table_name = ? AND row_key = ? ORDER BY version DESC, id DESC LIMIT 50`, table, key);
    return json(rows.map(r => ({ ...r, extra: parse(r.extra), data: parse(r.data) })), 200, NO_STORE);
  } catch (e) { return fail(e); }
}
