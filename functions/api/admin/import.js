/* POST /api/admin/import  ← a full export file (from Export Full Backup — the
   Supabase version or this one; same format):
     { datasets: { <key>: { data, published } }, builds: [ { id, category, status, sort_order, data } ] }
   Creates or replaces every dataset and build in the file, in one atomic batch.
   Anything replaced keeps its previous version in the history. Things in the
   database but not in the file are left alone.  → { datasets: n, builds: n, skipped: [...] } */
import { batch } from '../../_lib/db.js';
import { json, error, fail, readJSON, NO_STORE } from '../../_lib/http.js';

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const CATEGORIES = ['dps', 'skill', 'tank', 'support'];
const STATUSES = ['draft', 'published', 'archived'];

export async function onRequestPost({ request, env, data: ctx }) {
  const body = await readJSON(request);
  if (!body || typeof body.datasets !== 'object' || body.datasets === null || !Array.isArray(body.builds)) {
    return error(400, 'not a full backup file (expected "datasets" and "builds")');
  }
  const now = new Date().toISOString();
  const statements = [];
  const skipped = [];
  let nd = 0, nb = 0;

  for (const [key, d] of Object.entries(body.datasets)) {
    if (!KEY_RE.test(key) || !d || typeof d.data !== 'object' || d.data === null) { skipped.push('dataset ' + key); continue; }
    statements.push([
      `INSERT INTO datasets (key, data, published, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET data = excluded.data, published = excluded.published,
         version = datasets.version + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      key, JSON.stringify(d.data), d.published === false ? 0 : 1, now, ctx.user,
    ]);
    nd++;
  }

  for (const b of body.builds) {
    const id = b && String(b.id || '');
    if (!b || !ID_RE.test(id) || !b.data || typeof b.data !== 'object'
        || !CATEGORIES.includes(b.category) || !STATUSES.includes(b.status)) {
      skipped.push('build ' + (b && b.id));
      continue;
    }
    const sortOrder = Number.isInteger(b.sort_order) ? b.sort_order : 100;
    statements.push([
      `INSERT INTO builds (id, category, status, sort_order, data, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET category = excluded.category, status = excluded.status,
         sort_order = excluded.sort_order, data = excluded.data,
         version = builds.version + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      id, b.category, b.status, sortOrder, JSON.stringify({ ...b.data, id, cat: b.category }), now, ctx.user,
    ]);
    nb++;
  }

  if (!statements.length) return error(400, 'nothing to import');
  try {
    await batch(env, statements);
    return json({ datasets: nd, builds: nb, skipped }, 200, NO_STORE);
  } catch (e) { return fail(e); }
}
