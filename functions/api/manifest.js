/* GET /api/manifest
   Tells pages which version of each dataset (and of the published builds)
   is current, so they can request immutable, versioned URLs.
   Cached for 30 s — that is the delay between "Publish" and the live site. */
import { sb } from '../_lib/supabase.js';
import { json, fail, cached } from '../_lib/http.js';

// Short, stable fingerprint of the published builds (FNV-1a, hex).
function fingerprint(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export async function onRequestGet(context) {
  return cached(context, async () => {
    try {
      const { env } = context;
      const [datasets, builds] = await Promise.all([
        sb(env, 'public', 'datasets?select=key,version&published=is.true'),
        sb(env, 'public', 'builds?select=id,version&status=eq.published&order=id.asc'),
      ]);
      const versions = {};
      for (const d of datasets) versions[d.key] = d.version;
      const buildsTag = builds.length + '-' + fingerprint(builds.map(b => `${b.id}:${b.version}`).join('|'));
      return json({ datasets: versions, builds: buildsTag }, 200, {
        'Cache-Control': 'public, max-age=30',
      });
    } catch (e) {
      return fail(e);
    }
  });
}
