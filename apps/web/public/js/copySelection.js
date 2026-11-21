// Copying verses with the copy buttons (the layout's activateCopyButtons), several at a time:
//
//   click                   copies that verse, and it becomes the anchor
//   Shift+click             selects the verses from the anchor to this one and copies them
//   Cmd+click (Mac),        adds or removes this verse (gaps allowed) and copies the selection
//   Ctrl+click (elsewhere)
//
// Selected verses get a light highlight and a checked button; nothing moves. A plain click
// elsewhere, Escape or a version switch clears the selection. One verse copies as before,
// "text (John 14:1)"; several copy one line per verse with its number, then the reference of
// the whole selection: "John 14:1–4, 6, 9–10".
(function (root) {
  var DASH = '–';
  var LDS_KJV = ['LDS', 'KJV'];

  function parseRef(ref) {
    var m = /^(.*) (\d+):(\d+)$/.exec(ref || '');
    return m ? { book: m[1], chapter: +m[2], verse: +m[3] } : null;
  }

  // The reference of verses in reading order, items [{ id, ref }]: runs of consecutive verse ids
  // become ranges ("14:1–4", "14:30–15:2"), with the book and chapter written once.
  function formatRefs(items) {
    var runs = [];
    items.forEach(function (it) {
      var run = runs[runs.length - 1];
      if (run && Number(it.id) === Number(run[run.length - 1].id) + 1) run.push(it);
      else runs.push([it]);
    });
    var out = '';
    var book = null;
    var chapter = null;
    runs.forEach(function (run) {
      var firstRef = run[0].ref;
      var lastRef = run[run.length - 1].ref;
      var a = parseRef(firstRef);
      var b = parseRef(lastRef);
      if (!a || !b) {
        out += (out ? '; ' : '') + firstRef + (run.length > 1 ? DASH + lastRef : '');
        book = chapter = null;
        return;
      }
      var text;
      if (a.book !== book) text = (out ? '; ' : '') + a.book + ' ' + a.chapter + ':' + a.verse;
      else if (a.chapter !== chapter) text = '; ' + a.chapter + ':' + a.verse;
      else text = ', ' + a.verse;
      if (run.length > 1) {
        if (b.book !== a.book) text += DASH + b.book + ' ' + b.chapter + ':' + b.verse;
        else if (b.chapter !== a.chapter) text += DASH + b.chapter + ':' + b.verse;
        else text += DASH + b.verse;
      }
      out += text;
      book = b.book;
      chapter = b.chapter;
    });
    return out;
  }

  // "(John 14:1)" for LDS and KJV text, "(John 14:1, NIV)" for other versions
  function citation(ref, versions) {
    var vs = [];
    versions.forEach(function (v) { if (v && vs.indexOf(v) === -1) vs.push(v); });
    var others = vs.filter(function (v) { return LDS_KJV.indexOf(v) === -1; });
    var c = ' (' + ref + (others.length ? ', ' + vs.join(', ') : '') + ')';
    return c.replace('Doctrine and Covenants', 'D&C');
  }

  // The copied text, items [{ id, ref, version, text }] in reading order
  function copyText(items) {
    if (!items.length) return '';
    var ref = formatRefs(items);
    var versions = items.map(function (it) { return it.version; });
    if (items.length === 1) return items[0].text + citation(ref, versions);
    var lines = [];
    var chapter = null;
    items.forEach(function (it, i) {
      var r = parseRef(it.ref);
      // The verse number; chapter:verse at the start of a new chapter after the first
      var label = r ? (i > 0 && r.chapter !== chapter ? r.chapter + ':' + r.verse : String(r.verse)) : '';
      if (r) chapter = r.chapter;
      lines.push((label ? label + ' ' : '') + it.text);
    });
    return lines.join('\n') + citation(ref, versions);
  }

  // The selection after a click on item `idx`. mode: 'plain', 'range' (Shift), 'toggle' (Cmd/Ctrl)
  function select(state, idx, mode) {
    var sel = (state && state.sel) || [];
    var anchor = state ? state.anchor : null;
    if (mode === 'range' && anchor != null) {
      var out = [];
      for (var i = Math.min(anchor, idx); i <= Math.max(anchor, idx); i++) out.push(i);
      return { anchor: anchor, sel: out };
    }
    if (mode === 'toggle') {
      var next = sel.indexOf(idx) === -1 ? sel.concat([idx]) : sel.filter(function (j) { return j !== idx; });
      next.sort(function (x, y) { return x - y; });
      return { anchor: idx, sel: next };
    }
    return { anchor: idx, sel: [idx] };
  }

  var isMac = /mac|iphone|ipad|ipod/i.test((root.navigator && (root.navigator.userAgentData && root.navigator.userAgentData.platform || root.navigator.platform)) || '');
  function modeOf(ev) {
    if (!ev) return 'plain';
    if (ev.shiftKey) return 'range';
    if (isMac ? ev.metaKey : ev.ctrlKey) return 'toggle';
    return 'plain';
  }

  // ---- the page ----
  var state = { anchor: null, sel: [] };
  var HINT = 'Shift-click to copy a range, ' + (isMac ? '⌘' : 'Ctrl') + '-click to add a verse';

  function buttons() { return Array.prototype.slice.call(root.document.querySelectorAll('.copyprose img')); }
  function verseOf(img) { return img.parentElement && img.parentElement.previousElementSibling; }
  function itemOf(img) {
    var v = verseOf(img);
    var vnum = v.querySelector('.vnum');
    var text = v.textContent;
    if (vnum && text.indexOf(vnum.textContent) === 0) text = text.slice(vnum.textContent.length);
    return { id: v.getAttribute('verse_id'), ref: v.getAttribute('ref'), version: v.getAttribute('version'), text: text.trim() };
  }

  function show(all) {
    all.forEach(function (img, i) {
      var on = state.sel.indexOf(i) !== -1;
      var v = verseOf(img);
      if (v) v.classList.toggle('sg-picked', on);
      var src = on ? '/img/check.svg' : '/img/copy.svg';
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
  }

  function click(img, ev) {
    var all = buttons();
    var idx = all.indexOf(img);
    if (idx === -1) return;
    state = select(state, idx, modeOf(ev));
    show(all);
    var text = copyText(state.sel.map(function (i) { return itemOf(all[i]); }));
    if (text && root.navigator.clipboard) root.navigator.clipboard.writeText(text);
    if (root.SGPrefs && SGPrefs.get('copyHint')) {
      SGPrefs.set('copyHint', false);
      all.forEach(function (b) { if (b.getAttribute('title') === HINT) b.removeAttribute('title'); });
    }
  }

  function clear() {
    if (!state.sel.length && state.anchor == null) return;
    state = { anchor: null, sel: [] };
    show(buttons());
  }

  // The hint on the buttons, until the first copy
  function init() {
    if (!root.SGPrefs || !SGPrefs.get('copyHint')) return;
    buttons().forEach(function (b) { if (!b.getAttribute('title')) b.setAttribute('title', HINT); });
  }

  if (root.document) {
    var doc = root.document;
    // Shift+click would otherwise select page text from the last click
    doc.addEventListener('mousedown', function (e) {
      if (e.shiftKey && e.target.closest && e.target.closest('.copyprose')) e.preventDefault();
    });
    doc.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.copyprose')) return;
      if (e.shiftKey || e.metaKey || e.ctrlKey) return;
      clear();
    });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Esc') clear(); });
  }

  root.SGCopy = { click: click, clear: clear, init: init, formatRefs: formatRefs, copyText: copyText, select: select, modeOf: modeOf };
})(window);
