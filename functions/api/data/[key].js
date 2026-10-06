/* GET /api/data/:key?v=N
   One published dataset (gear, gear-logo-map, talents, weapon-classes).
   With ?v= the response is cached for a year: a new version means a new URL. */
import { sb, q } from '../../_lib/supabase.js';
import { json, error, fail, cached, IMMUTABLE, SHORT } from '../../_lib/http.js';

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function onRequestGet(context) {
  const key = String(context.params.key || '');
  if (!KEY_RE.test(key)) return error(404, 'not found');

  const versioned = new URL(context.request.url).searchParams.has('v');
  const produce = async () => {
    try {
      const rows = await sb(context.env, 'public',
        `datasets?key=eq.${q(key)}&published=is.true&select=data,version`);
      if (!rows.length) return error(404, 'not found');
      return json(rows[0].data, 200, {
        ...(versioned ? IMMUTABLE : SHORT),
        'X-Data-Version': String(rows[0].version),
      });
    } catch (e) {
      return fail(e);
    }
  };
  return versioned ? cached(context, produce) : produce();
}
