/* POST /api/admin/restore  ← { table: "datasets"|"builds", key, version }
   Puts an old version back as a NEW version (nothing is ever overwritten
   without a history entry). Also brings back a deleted build — as a draft.
   → { version } */
import { first, parse } from '../../_lib/db.js';
import { json, error, fail, readJSON, NO_STORE } from '../../_lib/http.js';

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

export async function onRequestPost({ request, env, data: ctx }) {
  const body = await readJSON(request);
  const table = body && body.table;
  const key = body && String(body.key || '');
  const version = body && body.version;
  if (!['datasets', 'builds'].includes(table) || !KEY_RE.test(key) || !Number.isInteger(version)) {
    return error(400, 'need { table: "datasets"|"builds", key, version }');
  }
  const now = new Date().toISOString();

  try {
    const old = await first(env,
      `SELECT data, extra FROM content_history WHERE table_name = ? AND row_key = ? AND version = ?
       ORDER BY id DESC LIMIT 1`, table, key, version);
    if (!old) return error(404, 'that version is not in the history');
    const extra = parse(old.extra) || {};

    let row;
    if (table === 'datasets') {
      row = await first(env,
        `UPDATE datasets SET data = ?, version = version + 1, updated_at = ?, updated_by = ?
         WHERE key = ? RETURNING version`, old.data, now, ctx.user, key);
      if (!row) {
        row = await first(env,
          `INSERT INTO datasets (key, data, published, updated_at, updated_by) VALUES (?, ?, 0, ?, ?)
           RETURNING version`, key, old.data, now, ctx.user);
      }
    } else {
      const cur = await first(env, 'SELECT status, category, sort_order FROM builds WHERE id = ?', key);
      if (cur) {
        row = await first(env,
          `UPDATE builds SET data = ?, status = ?, category = ?, sort_order = ?, version = version + 1,
                  updated_at = ?, updated_by = ?
           WHERE id = ? RETURNING version`,
          old.data, extra.status || cur.status, extra.category || cur.category,
          Number.isInteger(extra.sort_order) ? extra.sort_order : cur.sort_order, now, ctx.user, key);
      } else {
        const d = parse(old.data) || {};
        row = await first(env,
          `INSERT INTO builds (id, category, status, sort_order, data, updated_at, updated_by)
           VALUES (?, ?, 'draft', ?, ?, ?, ?) RETURNING version`,     // never silently re-publish a deleted build
          key, extra.category || d.cat || 'dps',
          Number.isInteger(extra.sort_order) ? extra.sort_order : 100, old.data, now, ctx.user);
      }
    }
    if (!row) return error(409, 'conflict');
    return json({ version: row.version }, 200, NO_STORE);
  } catch (e) { return fail(e); }
}
