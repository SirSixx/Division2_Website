/* ============================================================================
   SHD FIELD TOOLKIT — SHARED BUILD CARD RENDERER (build-card.js)
   ----------------------------------------------------------------------------
   One renderer for a build card, used by BOTH:
     - division2-builds.html            (the public Builds page)
     - admin/build-creator.html         (the live preview while authoring)
   so the preview can never drift from what the public page shows.
   Requires data.js to be loaded first (uses SHD.esc).

   Build object shape (same as the rows in the Supabase `builds` table):
   {
     id, cat: "dps"|"skill"|"tank"|"support", name, subtitle,
     diff: "easy"|"medium"|"hard", spec?,
     slots: [{ slot, set, logo, talent?, exotic?, flex?, flexNote?, warnTalent? }],
     statsLeft:  [{ l, v, opt? }],      // v may contain \n line breaks
     statsRight: [{ l, v }],
     warn?, playstyle
   }

   Usage:
     const el = SHDBuildCard.render(build);                 // public page
     const el = SHDBuildCard.render(build, { logoBase: "../logos/" });  // admin
   ============================================================================ */
(function () {
  'use strict';
  const esc = window.SHD.esc;

  // text with \n → <br>, escaped first so the <br> is the only markup
  function lines(s) { return esc(s).replace(/\n/g, '<br>'); }

  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  function logoImg(logoKey, alt, isExotic, isFlex, logoBase) {
    const wrapClass = ['logo-wrap', isExotic ? 'exotic-wrap' : '', isFlex ? 'flex-wrap' : ''].filter(Boolean).join(' ');
    if (!logoKey) {
      return '<div class="' + wrapClass + '"><span class="logo-placeholder">?</span></div>';
    }
    const src = logoBase + encodeURIComponent(logoKey) + '.png';
    const initial = esc((alt || '?')[0].toUpperCase());
    return '<div class="' + wrapClass + '">' +
      '<img src="' + esc(src) + '" alt="' + esc(alt) + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
      '<span class="logo-placeholder" style="display:none">' + initial + '</span>' +
      '</div>';
  }

  function render(b, opts) {
    const logoBase = (opts && opts.logoBase) || 'logos/';
    const card = document.createElement('div');
    card.className = 'build-card';
    card.dataset.cat = b.cat || '';

    // -- HEADER
    const specHtml = b.spec ? '<div class="spec-badge">' + esc(b.spec) + '</div>' : '';
    let html =
      '<div class="card-head"><div class="head-left">' +
        '<div class="head-badges">' +
          '<span class="cat-badge ' + esc(b.cat) + '">' + esc(String(b.cat || '').toUpperCase()) + '</span>' +
          '<span class="diff-badge ' + esc(b.diff) + '">' + esc(cap(b.diff)) + '</span>' +
        '</div>' +
        '<div class="build-name">' + esc(b.name) + '</div>' +
        '<div class="build-subtitle">' + esc(b.subtitle) + '</div>' +
        specHtml +
      '</div></div>';

    // -- GEAR SLOT STRIP
    const slotCells = (b.slots || []).map(function (s) {
      const talentHtml = s.talent
        ? '<div class="slot-talent' + (s.warnTalent ? ' warn-talent' : '') + '">' + esc(s.talent) + (s.warnTalent ? ' ?' : '') + '</div>'
        : '';
      const nameClass = s.exotic ? 'exotic-name' : s.flex ? 'flex-name' : '';
      const subName = s.flexNote ? '<br><span style="font-size:.57rem;color:var(--muted)">' + esc(s.flexNote) + '</span>' : '';
      return '<div class="slot-cell">' +
        '<div class="slot-label">' + esc(s.slot) + '</div>' +
        logoImg(s.logo, s.set, s.exotic, s.flex, logoBase) +
        '<div class="slot-set-name ' + nameClass + '">' + esc(s.set) + subName + '</div>' +
        talentHtml +
        '</div>';
    }).join('');
    html += '<div class="gear-strip">' + slotCells + '</div>';

    // -- STATS
    const leftRows = (b.statsLeft || []).map(function (s) {
      const opt = s.opt ? '<br><span class="muted">' + esc(s.opt) + '</span>' : '';
      return '<div class="stat-row"><span class="stat-label">' + esc(s.l) + '</span>' +
        '<span class="stat-val">' + lines(s.v) + opt + '</span></div>';
    }).join('');
    const rightRows = (b.statsRight || []).map(function (s) {
      return '<div class="stat-row"><span class="stat-label">' + esc(s.l) + '</span>' +
        '<span class="stat-val">' + lines(s.v) + '</span></div>';
    }).join('');
    html += '<div class="card-stats"><div class="stat-col">' + leftRows + '</div><div class="stat-col">' + rightRows + '</div></div>';

    // -- WARNING
    if (b.warn) html += '<div class="warn-banner">' + esc(b.warn) + '</div>';

    // -- PLAYSTYLE
    html += '<div class="card-playstyle"><div class="ps-label">Playstyle</div><p class="ps-text">' + esc(b.playstyle) + '</p></div>';

    card.innerHTML = html;
    return card;
  }

  window.SHDBuildCard = { render: render };
})();
