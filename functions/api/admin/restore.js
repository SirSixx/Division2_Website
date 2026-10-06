/* POST /api/admin/restore  ← { table: "datasets"|"builds", key, version }
   Puts an old version back as a NEW version (nothing is ever overwritten
   without a history entry). Also brings back a deleted build.
   → { version } */
import { sb, q } from '../../_lib/supabase.js';
import { json, error, fail, readJSON, NO_STORE } from '../../_lib/http.js';

const TABLES = { datasets: 'key', builds: 'id' };
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

export async function onRequestPost({ request, env, data: ctx }) {
  const body = await readJSON(request);
  const table = body && body.table;
  const key = body && String(body.key || '');
  const version = body && body.version;
  if (!TABLES[table] || !KEY_RE.test(key) || !Number.isInteger(version)) {
    return error(400, 'need { table: "datasets"|"builds", key, version }');
  }
  const col = TABLES[table];

  try {
    const old = await sb(env, 'secret',
      `content_history?table_name=eq.${table}&row_key=eq.${q(key)}&version=eq.${version}` +
      '&select=data,extra&order=id.desc&limit=1');
    if (!old.length) return error(404, 'that version is not in the history');
    const { data, extra } = old[0];

    const patch = { data, updated_by: ctx.user };
    if (table === 'builds' && extra) {
      if (extra.status) patch.status = extra.status;
      if (extra.category) patch.category = extra.category;
      if (Number.isInteger(extra.sort_order)) patch.sort_order = extra.sort_order;
    }

    const cur = await sb(env, 'secret', `${table}?${col}=eq.${q(key)}&select=version`);
    let rows;
    if (cur.length) {
      rows = await sb(env, 'secret', `${table}?${col}=eq.${q(key)}&version=eq.${cur[0].version}`, {
        method: 'PATCH', prefer: 'return=representation', body: patch,
      });
    } else {
      // Row was deleted: re-create it. Builds need their required columns.
      const row = { [col]: key, ...patch };
      if (table === 'builds') {
        row.category = row.category || data.cat || 'dps';
        row.status = 'draft';                     // never silently re-publish a deleted build
      }
      rows = await sb(env, 'secret', table, { method: 'POST', prefer: 'return=representation', body: row });
    }
    if (!rows || !rows.length) return error(409, 'conflict');
    return json({ version: rows[0].version }, 200, NO_STORE);
  } catch (e) { return fail(e); }
}
