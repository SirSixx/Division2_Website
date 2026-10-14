/* GET /api/builds?v=TAG
   All published builds, in Builds-page order. Returns the build objects only
   (the same shape the page used to have hard-coded). */
import { all } from '../_lib/db.js';
import { fail, cached, IMMUTABLE, SHORT } from '../_lib/http.js';

export async function onRequestGet(context) {
  const versioned = new URL(context.request.url).searchParams.has('v');
  const produce = async () => {
    try {
      const rows = await all(context.env,
        "SELECT data FROM builds WHERE status = 'published' ORDER BY sort_order, id");
      // Each data column is JSON text; join into one JSON array without re-parsing
      return new Response('[' + rows.map(r => r.data).join(',') + ']', {
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...(versioned ? IMMUTABLE : SHORT) },
      });
    } catch (e) {
      return fail(e);
    }
  };
  return versioned ? cached(context, produce) : produce();
}
