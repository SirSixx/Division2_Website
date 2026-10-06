/* /api/admin/datasets/:key
   GET → { data, version, published }    (404 if it doesn't exist yet)
   PUT ← { data, expectedVersion, published? }  → { version, updated_at }
       expectedVersion 0 creates the dataset; otherwise the save only goes
       through if the stored version still matches (409 if it changed). */
import { sb, q } from '../../../_lib/supabase.js';
import { json, error, fail, readJSON, NO_STORE } from '../../../_lib/http.js';

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function onRequestGet({ params, env }) {
  const key = String(params.key || '');
  if (!KEY_RE.test(key)) return error(404, 'not found');
  try {
    const rows = await sb(env, 'secret', `datasets?key=eq.${q(key)}&select=data,version,published,updated_at`);
    if (!rows.length) return error(404, 'not found');
    return json(rows[0], 200, NO_STORE);
  } catch (e) { return fail(e); }
}

export async function onRequestPut({ params, env, request, data: ctx }) {
  const key = String(params.key || '');
  if (!KEY_RE.test(key)) return error(400, 'invalid dataset key');
  const body = await readJSON(request);
  if (!body || typeof body.data !== 'object' || body.data === null) return error(400, 'body must include data (array or object)');
  const expected = body.expectedVersion;
  if (!Number.isInteger(expected) || expected < 0) return error(400, 'expectedVersion must be a whole number (0 = create)');

  try {
    let rows;
    if (expected === 0) {
      rows = await sb(env, 'secret', 'datasets', {
        method: 'POST',
        prefer: 'return=representation',
        body: { key, data: body.data, published: body.published === true, updated_by: ctx.user },
      });
    } else {
      const patch = { data: body.data, updated_by: ctx.user };
      if (typeof body.published === 'boolean') patch.published = body.published;
      rows = await sb(env, 'secret', `datasets?key=eq.${q(key)}&version=eq.${expected}`, {
        method: 'PATCH', prefer: 'return=representation', body: patch,
      });
    }
    if (!rows || !rows.length) return error(409, 'conflict');
    return json({ version: rows[0].version, updated_at: rows[0].updated_at }, 200, NO_STORE);
  } catch (e) { return fail(e); }
}
