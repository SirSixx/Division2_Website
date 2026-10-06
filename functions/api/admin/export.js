/* GET /api/admin/export → everything in one JSON file (the Backup tab's "Export").
   Shape: { exported_at, datasets: { <key>: { data, version, published, updated_at } }, builds: [rows] }
   The Build Creator's "Restore" accepts this file. */
import { sb } from '../../_lib/supabase.js';
import { json, fail, NO_STORE } from '../../_lib/http.js';

export async function onRequestGet({ env }) {
  try {
    const [datasets, builds] = await Promise.all([
      sb(env, 'secret', 'datasets?select=key,data,version,published,updated_at&order=key.asc'),
      sb(env, 'secret', 'builds?select=id,category,status,sort_order,version,updated_at,data&order=sort_order.asc,id.asc'),
    ]);
    const out = { exported_at: new Date().toISOString(), datasets: {}, builds };
    for (const d of datasets) {
      out.datasets[d.key] = { data: d.data, version: d.version, published: d.published, updated_at: d.updated_at };
    }
    return json(out, 200, NO_STORE);
  } catch (e) { return fail(e); }
}
