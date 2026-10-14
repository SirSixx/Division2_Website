/* ============================================================================
   Worker entry point for the SHD Field Toolkit.
   ----------------------------------------------------------------------------
   Static files in /website are served directly by Cloudflare (see
   wrangler.jsonc → assets). Only /api/* requests reach this code, which
   routes them to the handlers in /functions (one file per endpoint).
   ============================================================================ */
import * as health from '../functions/api/health.js';
import * as manifest from '../functions/api/manifest.js';
import * as builds from '../functions/api/builds.js';
import * as dataset from '../functions/api/dataset.js';
import * as adminGate from '../functions/api/admin/access-check.js';
import * as adminDatasets from '../functions/api/admin/dataset.js';
import * as adminBuilds from '../functions/api/admin/builds.js';
import * as adminBuild from '../functions/api/admin/build.js';
import * as adminExport from '../functions/api/admin/export.js';
import * as adminHistory from '../functions/api/admin/history.js';
import * as adminRestore from '../functions/api/admin/restore.js';
import * as adminImport from '../functions/api/admin/import.js';

// [path pattern, param names, module]  — first match wins
const ROUTES = [
  [/^\/api\/health$/, [], health],
  [/^\/api\/manifest$/, [], manifest],
  [/^\/api\/builds$/, [], builds],
  [/^\/api\/data\/([^/]+)$/, ['key'], dataset],
  [/^\/api\/admin\/datasets\/([^/]+)$/, ['key'], adminDatasets],
  [/^\/api\/admin\/builds$/, [], adminBuilds],
  [/^\/api\/admin\/builds\/([^/]+)$/, ['id'], adminBuild],
  [/^\/api\/admin\/export$/, [], adminExport],
  [/^\/api\/admin\/history\/([^/]+)\/([^/]+)$/, ['table', 'key'], adminHistory],
  [/^\/api\/admin\/restore$/, [], adminRestore],
  [/^\/api\/admin\/import$/, [], adminImport],
];

const METHOD_EXPORT = { GET: 'onRequestGet', HEAD: 'onRequestGet', POST: 'onRequestPost', PUT: 'onRequestPut', PATCH: 'onRequestPatch', DELETE: 'onRequestDelete' };

function jsonError(status, message, extra = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    for (const [re, names, mod] of ROUTES) {
      const m = url.pathname.match(re);
      if (!m) continue;

      const handler = mod[METHOD_EXPORT[request.method]] || mod.onRequest;
      if (!handler) {
        const allowed = Object.entries(METHOD_EXPORT).filter(([, fn]) => mod[fn]).map(([verb]) => verb);
        return jsonError(405, 'method not allowed', { Allow: allowed.join(', ') });
      }

      const params = {};
      try {
        names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      } catch {
        return jsonError(400, 'bad URL');
      }

      // The "context" object every handler receives
      const context = {
        request, env, params, data: {},
        waitUntil: p => ctx.waitUntil(p),
        next: () => handler(context),
      };

      try {
        // Admin routes go through the Cloudflare Access check first
        return url.pathname.startsWith('/api/admin/') ? await adminGate.onRequest(context) : await handler(context);
      } catch (e) {
        console.error(e && e.stack ? e.stack : e);
        return jsonError(500, 'server error');
      }
    }
    return jsonError(404, 'not found');
  },
};
