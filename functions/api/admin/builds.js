/* GET /api/admin/builds → every build (drafts, published, archived), with metadata. */
import { all, parse } from '../../_lib/db.js';
import { json, fail, NO_STORE } from '../../_lib/http.js';

export async function onRequestGet({ env }) {
  try {
    const rows = await all(env,
      'SELECT id, category, status, sort_order, version, updated_at, updated_by, data FROM builds ORDER BY sort_order, id');
    return json(rows.map(r => ({ ...r, data: parse(r.data) })), 200, NO_STORE);
  } catch (e) { return fail(e); }
}
