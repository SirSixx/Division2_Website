/* ============================================================================
   Cloudflare D1 helpers.
   ----------------------------------------------------------------------------
   The database is attached to the Worker as the binding `DB` (wrangler.jsonc →
   d1_databases). No keys or URLs: only this Worker can reach it.

   Public endpoints only ever SELECT published rows. Every write goes through
   /api/admin/*, which is behind Cloudflare Access (see admin/access-check.js).
   ============================================================================ */

export class DbError extends Error {
  constructor(status, detail) {
    super(`D1 ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

export function db(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    throw new DbError(500, 'missing DB binding (wrangler.jsonc → d1_databases)');
  }
  return env.DB;
}

/** Run a SELECT and return all rows. */
export async function all(env, sql, ...args) {
  try {
    const r = await db(env).prepare(sql).bind(...args).all();
    return r.results || [];
  } catch (e) { throw wrap(e); }
}

/** Run a SELECT and return the first row or null. */
export async function first(env, sql, ...args) {
  try {
    return await db(env).prepare(sql).bind(...args).first();
  } catch (e) { throw wrap(e); }
}

/** Run an INSERT/UPDATE/DELETE and return the number of rows changed. */
export async function run(env, sql, ...args) {
  try {
    const r = await db(env).prepare(sql).bind(...args).run();
    return (r.meta && r.meta.changes) || 0;
  } catch (e) { throw wrap(e); }
}

/** Run several statements as one atomic batch. */
export async function batch(env, statements) {
  try {
    const d = db(env);
    return await d.batch(statements.map(([sql, ...args]) => d.prepare(sql).bind(...args)));
  } catch (e) { throw wrap(e); }
}

function wrap(e) {
  if (e instanceof DbError) return e;
  const msg = String((e && e.message) || e);
  if (/UNIQUE constraint failed/i.test(msg)) return new DbError(409, 'already exists');
  if (/CHECK constraint failed/i.test(msg)) return new DbError(400, 'invalid value: ' + msg.replace(/^.*CHECK constraint failed:\s*/i, ''));
  if (/no such table/i.test(msg)) return new DbError(500, 'tables not created yet — run d1/schema.sql in the D1 console');
  return new DbError(500, msg);
}

/** Current time in the same format the schema uses. */
export const now = () => new Date().toISOString();

/** Parse a JSON column; null-safe. */
export const parse = s => (s == null ? null : JSON.parse(s));
