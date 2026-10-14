/* GET /api/admin/export → everything in one JSON file (the Backup tab's "Export").
   Shape: { exported_at, datasets: { <key>: { data, version, published, updated_at } }, builds: [rows] }
   The Build Creator's "Restore" accepts this file (see import.js). */
import { all, parse } from '../../_lib/db.js';
import { json, fail, NO_STORE } from '../../_lib/http.js';

export async function onRequestGet({ env }) {
  try {
    const [datasets, builds] = await Promise.all([
      all(env, 'SELECT key, data, version, published, updated_at FROM datasets ORDER BY key'),
      all(env, 'SELECT id, category, status, sort_order, version, updated_at, data FROM builds ORDER BY sort_order, id'),
    ]);
    const out = {
      exported_at: new Date().toISOString(),
      datasets: {},
      builds: builds.map(b => ({ ...b, data: parse(b.data) })),
    };
    for (const d of datasets) {
      out.datasets[d.key] = { data: parse(d.data), version: d.version, published: !!d.published, updated_at: d.updated_at };
    }
    return json(out, 200, NO_STORE);
  } catch (e) { return fail(e); }
}
