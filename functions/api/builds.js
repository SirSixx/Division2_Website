/* GET /api/builds?v=TAG
   All published builds, in Builds-page order. Returns the build objects only
   (the same shape the page used to have hard-coded). */
import { sb } from '../_lib/supabase.js';
import { json, fail, cached, IMMUTABLE, SHORT } from '../_lib/http.js';

export async function onRequestGet(context) {
  const versioned = new URL(context.request.url).searchParams.has('v');
  const produce = async () => {
    try {
      const rows = await sb(context.env, 'public',
        'builds?status=eq.published&select=data&order=sort_order.asc,id.asc');
      return json(rows.map(r => r.data), 200, versioned ? IMMUTABLE : SHORT);
    } catch (e) {
      return fail(e);
    }
  };
  return versioned ? cached(context, produce) : produce();
}
