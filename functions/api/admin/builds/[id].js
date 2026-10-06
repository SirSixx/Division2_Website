/* PUT /api/admin/builds/:id
   ← { data, category, status, sort_order, expectedVersion }
   → { version, updated_at }
   expectedVersion 0 creates the build (409 if the id is taken); otherwise the
   save only goes through if the stored version still matches (409 if not). */
import { sb, q } from '../../../_lib/supabase.js';
import { json, error, fail, readJSON, NO_STORE } from '../../../_lib/http.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const CATEGORIES = ['dps', 'skill', 'tank', 'support'];   // must match the table's check constraint
const STATUSES = ['draft', 'published', 'archived'];

export async function onRequestPut({ params, env, request, data: ctx }) {
  const id = String(params.id || '');
  if (!ID_RE.test(id)) return error(400, 'invalid build id');
  const body = await readJSON(request);
  if (!body) return error(400, 'invalid JSON');

  const { data, category, status, sort_order: sortOrder, expectedVersion: expected } = body;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return error(400, 'data must be a build object');
  if (typeof data.name !== 'string' || !data.name.trim()) return error(400, 'build needs a name');
  if (!Array.isArray(data.slots)) return error(400, 'build needs slots');
  if (!CATEGORIES.includes(category)) return error(400, 'category must be one of ' + CATEGORIES.join(', '));
  if (!STATUSES.includes(status)) return error(400, 'status must be one of ' + STATUSES.join(', '));
  if (!Number.isInteger(sortOrder)) return error(400, 'sort_order must be a whole number');
  if (!Number.isInteger(expected) || expected < 0) return error(400, 'expectedVersion must be a whole number (0 = create)');

  // Keep the row's id/category and the object's id/cat in step — the public page filters on data.cat.
  const doc = { ...data, id, cat: category };

  try {
    let rows;
    if (expected === 0) {
      rows = await sb(env, 'secret', 'builds', {
        method: 'POST',
        prefer: 'return=representation',
        body: { id, category, status, sort_order: sortOrder, data: doc, updated_by: ctx.user },
      });
    } else {
      rows = await sb(env, 'secret', `builds?id=eq.${q(id)}&version=eq.${expected}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { category, status, sort_order: sortOrder, data: doc, updated_by: ctx.user },
      });
    }
    if (!rows || !rows.length) return error(409, 'conflict');
    return json({ version: rows[0].version, updated_at: rows[0].updated_at }, 200, NO_STORE);
  } catch (e) { return fail(e); }
}
