/* ============================================================================
   SHD FIELD TOOLKIT — SHARED DATA LOADER (data.js)
   ----------------------------------------------------------------------------
   Linked by every page that shows game data, BEFORE the page's own <script>:
     <script src="data.js"></script>
   Exposes one global, window.SHD.

   How loading works
   1. /api/manifest (cached ~30 s at the edge) lists the current version of
      every dataset, plus a tag for the published builds.
   2. Each dataset is fetched as /api/data/<key>?v=<version>. Versioned URLs are
      cached forever, so a publish shows up as soon as the manifest refreshes
      and nothing else can go stale.
   3. If the API is unreachable, the loader falls back to the static snapshot
      in /snapshot/<key>.json (committed copy of the data), so the site still
      works if the database is paused or down.

   Local testing needs the Functions running:  npx wrangler pages dev website
   Opening pages via file:// will show the "Data didn't load" panel.
   ============================================================================ */
(function () {
  'use strict';

  let manifestP = null;

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
      return r.json();
    });
  }

  function manifest() {
    if (!manifestP) {
      manifestP = getJSON('/api/manifest').catch(function (e) {
        manifestP = null; // allow a retry to try again
        throw e;
      });
    }
    return manifestP;
  }

  function snapshot(key, err) {
    console.warn('[SHD] API unavailable, using snapshot for "' + key + '":', err);
    return getJSON('/snapshot/' + key + '.json');
  }

  /** Load one dataset by key, e.g. SHD.loadDataset('gear'). */
  function loadDataset(key) {
    return manifest()
      .then(function (m) {
        const v = m && m.datasets ? m.datasets[key] : undefined;
        if (v === undefined) throw new Error('dataset "' + key + '" not in manifest');
        return getJSON('/api/data/' + encodeURIComponent(key) + '?v=' + encodeURIComponent(v));
      })
      .catch(function (e) { return snapshot(key, e); });
  }

  /** Load all published builds, already ordered by sort_order. */
  function loadBuilds() {
    return manifest()
      .then(function (m) {
        return getJSON('/api/builds?v=' + encodeURIComponent(m.builds));
      })
      .catch(function (e) { return snapshot('builds', e); });
  }

  /** HTML-escape any value for safe use in text AND attribute positions. */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * Turn a set / brand name into its logo slug. Strips diacritics first
   * (Česká Výroba → ceska), then follows the gear page's existing rules.
   */
  function slugBase(name) {
    return String(name || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function showLoading(el, what) {
    el.innerHTML = '<div class="empty">Loading ' + esc(what || 'data') + '…</div>';
  }

  /** Replace el's contents with an error panel and a Retry button. */
  function showLoadError(el, retry) {
    el.innerHTML =
      '<div class="empty">Data didn\'t load. Check your connection and try again.<br><br>' +
      '<button type="button" class="chip" data-shd-retry>Retry</button></div>';
    const b = el.querySelector('[data-shd-retry]');
    if (b && retry) b.addEventListener('click', retry);
  }

  window.SHD = {
    loadDataset: loadDataset,
    loadBuilds: loadBuilds,
    esc: esc,
    slugBase: slugBase,
    showLoading: showLoading,
    showLoadError: showLoadError,
  };
})();
