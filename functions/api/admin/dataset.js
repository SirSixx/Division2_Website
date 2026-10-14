/* /api/admin/datasets/:key
   GET → { data, version, published }    (404 if it doesn't exist yet)
   PUT ← { data, expectedVersion, published? }  → { version, updated_at }
       expectedVersion 0 creates the dataset; otherwise the save only goes
       through if the stored version still matches (409 if it changed). */
import { first, parse } from '../../_lib/db.js';
import { json, error, fail, readJSON, NO_STORE } from '../../_lib/http.js';

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function onRequestGet({ params, env }) {
  const key = String(params.key || '');
  if (!KEY_RE.test(key)) return error(404, 'not found');
  try {
    const row = await first(env, 'SELECT data, version, published, updated_at FROM datasets WHERE key = ?', key);
    if (!row) return error(404, 'not found');
    return json({ data: parse(row.data), version: row.version, published: !!row.published, updated_at: row.updated_at }, 200, NO_STORE);
  } catch (e) { return fail(e); }
}

export async function onRequestPut({ params, env, request, data: ctx }) {
  const key = String(params.key || '');
  if (!KEY_RE.test(key)) return error(400, 'invalid dataset key');
  const body = await readJSON(request);
  if (!body || typeof body.data !== 'object' || body.data === null) return error(400, 'body must include data (array or object)');
  const expected = body.expectedVersion;
  if (!Number.isInteger(expected) || expected < 0) return error(400, 'expectedVersion must be a whole number (0 = create)');
  const dataText = JSON.stringify(body.data);
  const now = new Date().toISOString();

  try {
    let row;
    if (expected === 0) {
      row = await first(env,
        `INSERT INTO datasets (key, data, published, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
         RETURNING version, updated_at`,
        key, dataText, body.published === true ? 1 : 0, now, ctx.user);
    } else {
      const pub = typeof body.published === 'boolean' ? (body.published ? 1 : 0) : null;
      row = await first(env,
        `UPDATE datasets SET data = ?, published = COALESCE(?, published), version = version + 1,
                updated_at = ?, updated_by = ?
         WHERE key = ? AND version = ?
         RETURNING version, updated_at`,
        dataText, pub, now, ctx.user, key, expected);
    }
    if (!row) return error(409, 'conflict');
    return json({ version: row.version, updated_at: row.updated_at }, 200, NO_STORE);
  } catch (e) { return fail(e); }
}
