/* GET /api/admin/builds → every build (drafts, published, archived), with metadata. */
import { sb } from '../../../_lib/supabase.js';
import { json, fail, NO_STORE } from '../../../_lib/http.js';

export async function onRequestGet({ env }) {
  try {
    const rows = await sb(env, 'secret',
      'builds?select=id,category,status,sort_order,version,updated_at,updated_by,data&order=sort_order.asc,id.asc');
    return json(rows, 200, NO_STORE);
  } catch (e) { return fail(e); }
}
