/* GET /api/data/:key?v=N
   One published dataset (gear, gear-logo-map, talents, weapon-classes).
   With ?v= the response is cached for a year: a new version means a new URL. */
import { first } from '../_lib/db.js';
import { error, fail, cached, IMMUTABLE, SHORT } from '../_lib/http.js';

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function onRequestGet(context) {
  const key = String(context.params.key || '');
  if (!KEY_RE.test(key)) return error(404, 'not found');

  const versioned = new URL(context.request.url).searchParams.has('v');
  const produce = async () => {
    try {
      const row = await first(context.env,
        'SELECT data, version FROM datasets WHERE key = ? AND published = 1', key);
      if (!row) return error(404, 'not found');
      // data is already JSON text — send it as-is
      return new Response(row.data, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...(versioned ? IMMUTABLE : SHORT),
          'X-Data-Version': String(row.version),
        },
      });
    } catch (e) {
      return fail(e);
    }
  };
  return versioned ? cached(context, produce) : produce();
}
