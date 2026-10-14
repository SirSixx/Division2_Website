/* ============================================================================
   SHD FIELD TOOLKIT — SHARED BUILD CARD RENDERER (build-card.js)
   ----------------------------------------------------------------------------
   One renderer for a build card, used by BOTH:
     - division2-builds.html            (the public Builds page)
     - admin/build-creator.html         (the live preview while authoring)
   so the preview can never drift from what the public page shows.
   Requires data.js to be loaded first (uses SHD.esc).

   Build object shape (same as the rows in the database `builds` table):
   {
     id, cat: "dps"|"skill"|"tank"|"support", name, subtitle,
     diff: "easy"|"medium"|"hard", spec?,
     slots: [{ slot, set, logo, talent?, exotic?, flex?, flexNote?, warnTalent? }],
     statsLeft:  [{ l, v, opt? }],      // v may contain \n line breaks
     statsRight: [{ l, v }],
     warn?, playstyle   // playstyle: plain text OR the rich subset (p, ul/li, strong, em, u, br)
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

  /* ---- PLAYSTYLE RICH TEXT --------------------------------------------------
     The playstyle is stored as a small, fixed subset of HTML:
       <p> paragraphs, <ul><li> bullets, <strong> <em> <u>, and <br>.
     cleanRich() is the ONLY thing that turns stored text into markup. It
       - accepts old plain-text playstyles (blank line = new paragraph,
         single line break = <br>) so existing builds keep working,
       - accepts HTML from the editor (including <b>/<i>/<div> variants that
         browsers produce) and rebuilds it using only the tags above,
       - never copies attributes or unknown tags, so nothing else can get through.
     The creator calls it when saving and the card calls it when rendering. */
  const RICH_TAG_RE = /<\/?(p|ul|ol|li|strong|em|b|i|u|br|div)\b[^>]*>/i;
  const INLINE_TAGS = { B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u' };
  const BLOCK_TAGS = { P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, UL: 1, OL: 1, LI: 1, PRE: 1, TABLE: 1 };

  function plainToRich(text) {
    return String(text == null ? '' : text).replace(/\r\n?/g, '\n').split(/\n{2,}/).map(function (para) {
      para = para.trim();
      return para ? '<p>' + esc(para).replace(/\n/g, '<br>') + '</p>' : '';
    }).join('');
  }

  function inlineRich(node) {
    let out = '';
    node.childNodes.forEach(function (n) {
      // browsers insert non-breaking spaces while typing next to bold/italic runs; store plain spaces
      if (n.nodeType === 3) { out += esc(n.nodeValue.replace(/ /g, ' ')); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === 'BR') out += '<br>';
      else if (t === 'SCRIPT' || t === 'STYLE') { /* drop */ }
      else if (INLINE_TAGS[t]) {
        const inner = inlineRich(n);
        if (inner.replace(/<br>/g, '').trim()) out += '<' + INLINE_TAGS[t] + '>' + inner + '</' + INLINE_TAGS[t] + '>';
        else out += inner;
      } else out += inlineRich(n);       // unknown tag: keep its text, lose the tag
    });
    return out;
  }

  function tidyPara(html) {
    // trim stray <br>/whitespace at either end; drop the paragraph if nothing is left
    html = html.replace(/<(strong|em|u)>\s*<\/\1>/g, '');
    return html.replace(/^(\s|&nbsp;|<br>)+/, '').replace(/(\s|&nbsp;|<br>)+$/, '');
  }

  function listItems(list, items) {       // nested lists are flattened into one level
    Array.prototype.forEach.call(list.childNodes, function (n) {
      if (n.nodeType !== 1) return;
      if (n.tagName === 'LI') {
        const own = document.createElement('div');
        Array.prototype.forEach.call(n.childNodes, function (c) {
          if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) return;
          own.appendChild(c.cloneNode(true));
        });
        const h = tidyPara(inlineRich(own));
        if (h) items.push(h);
        Array.prototype.forEach.call(n.childNodes, function (c) {
          if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) listItems(c, items);
        });
      } else if (n.tagName === 'UL' || n.tagName === 'OL') listItems(n, items);
    });
  }

  function blocksRich(parent) {
    let out = '', buf = '';
    function flush() { const h = tidyPara(buf); if (h) out += '<p>' + h + '</p>'; buf = ''; }
    parent.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { buf += esc(n.nodeValue.replace(/ /g, ' ')); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === 'UL' || t === 'OL') {
        flush();
        const items = []; listItems(n, items);
        if (items.length) out += '<ul>' + items.map(function (h) { return '<li>' + h + '</li>'; }).join('') + '</ul>';
      } else if (BLOCK_TAGS[t]) {
        flush();
        const hasBlockKid = Array.prototype.some.call(n.childNodes, function (c) { return c.nodeType === 1 && BLOCK_TAGS[c.tagName]; });
        if (hasBlockKid) out += blocksRich(n);
        else { const h = tidyPara(inlineRich(n)); if (h) out += '<p>' + h + '</p>'; }
      } else if (t === 'SCRIPT' || t === 'STYLE') { /* drop */ }
      else buf += (t === 'BR' ? '<br>' : INLINE_TAGS[t] ? inlineRich({ childNodes: [n] }) : inlineRich(n));
    });
    flush();
    return out;
  }

  /** Turn a stored playstyle (plain text or rich HTML) into safe, clean markup. */
  function cleanRich(src) {
    src = String(src == null ? '' : src);
    if (!src.trim()) return '';
    if (!RICH_TAG_RE.test(src)) return plainToRich(src);
    const doc = new DOMParser().parseFromString('<body>' + src + '</body>', 'text/html');
    return blocksRich(doc.body);
  }

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
    html += '<div class="card-playstyle"><div class="ps-label">Playstyle</div><div class="ps-text">' + cleanRich(b.playstyle) + '</div></div>';

    card.innerHTML = html;
    return card;
  }

  window.SHDBuildCard = { render: render, cleanRich: cleanRich };
})();
