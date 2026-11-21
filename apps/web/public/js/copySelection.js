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

  // ---- the whole passage: the "Copy passage" button under it (scripture.ejs) ----
  //
  // The text keeps the page's layout: a blank line between paragraphs and stanzas, each poetry
  // line on its own line, and one line per verse in the editions set a verse to a paragraph (the
  // .vcols blocks). With more than one verse each verse starts with its number. The reference of
  // the verses ends the text: on the last line for one verse, as the verse copy does, or on a
  // line of its own. Several references (john.3.16;rom.8.28) copy as blocks, each with its own.

  // Interface inside the text, never copied: verse numbers, per-verse copy buttons, running
  // heads, footnote markers
  var NOT_TEXT = 'sup.vnum, .copyprose, .vhead, button, sup.fn, sup.footnote, .footnote';

  function spanText(span) {
    var c = span.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll(NOT_TEXT), function (n) { n.parentNode.removeChild(n); });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  // The verses a span stands for, [{ id, ref, num, chapter }]. A line of merged verses (compound,
  // ref "Gen. 7:5–6", the short book name) stands for each of them, named with the book as the
  // section's other verses write it.
  function versesOf(span, book) {
    var id = Number(span.getAttribute('verse_id'));
    var ref = span.getAttribute('ref') || '';
    var n = Number(span.getAttribute('compound')) || 1;
    var m = n > 1 && /^(.*) (\d+):(\d+)[–-](\d+)$/.exec(ref);
    if (m && +m[4] - +m[3] === n - 1) {
      var out = [];
      for (var k = 0; k < n; k++) out.push({ id: id + k, ref: (book || m[1]) + ' ' + m[2] + ':' + (+m[3] + k), num: +m[3] + k, chapter: +m[2] });
      return out;
    }
    var r = parseRef(ref);
    return [{ id: id, ref: ref, num: r ? r.verse : null, chapter: r ? r.chapter : null }];
  }

  // One section's text and reference
  function sectionText(section) {
    var spans = Array.prototype.filter.call(section.querySelectorAll('.verse[verse_id]'), function (s) {
      return !(s.closest && s.closest('.vhead, .copyprose'));
    });
    var book = null;
    spans.forEach(function (s) {
      var r = !s.getAttribute('compound') && parseRef(s.getAttribute('ref'));
      if (r && book == null) book = r.book;
    });

    var refs = [];
    var versions = [];
    var parts = [];
    var seen = {};
    spans.forEach(function (s) {
      var id = s.getAttribute('verse_id');
      var vs = seen[id] ? [] : versesOf(s, book);
      seen[id] = true;
      // Verse 0 (a heading line some editions number 0) gets no number and no place in the reference
      vs = vs.filter(function (v) { return v.num !== 0; });
      refs = refs.concat(vs);
      versions.push(s.getAttribute('version'));
      var block = s.closest('p, blockquote, li') || s.parentElement;
      parts.push({ verses: vs, text: spanText(s), block: block, inCols: !!block.closest('.vcols'), newLine: s.classList.contains('linebreak') });
    });
    if (!refs.length) return '';

    var many = refs.length > 1;
    var out = '';
    var prev = null;
    var chapter = null;
    parts.forEach(function (p, i) {
      var label = '';
      if (p.verses.length) {
        var a = p.verses[0];
        var b = p.verses[p.verses.length - 1];
        // chapter:verse at the start of a new chapter after the first, as in copyText
        label = (i > 0 && chapter != null && a.chapter !== chapter ? a.chapter + ':' : '') + (a.num == null ? '' : a.num) + (b !== a ? DASH + b.num : '');
        if (a.chapter != null) chapter = b.chapter;
      }
      if (!p.text) return;
      var t = (many && label ? label + ' ' : '') + p.text;
      if (prev) {
        if (p.block !== prev.block) out += p.inCols && prev.inCols ? '\n' : '\n\n';
        else out += p.newLine ? '\n' : ' ';
      }
      out += t;
      prev = p;
    });
    var cite = citation(formatRefs(refs), versions);
    return many ? out + '\n' + cite.trim() : out + cite;
  }

  // The text of the passage on the page
  function passageText(doc) {
    doc = doc || root.document;
    var container = doc.getElementById('container') || doc.body;
    var sections = container.querySelectorAll('.section');
    if (!sections.length) sections = [container];
    var blocks = [];
    Array.prototype.forEach.call(sections, function (s) {
      var t = sectionText(s);
      if (t) blocks.push(t);
    });
    return blocks.join('\n\n');
  }

  // Copy text to the clipboard; resolves true when it worked. navigator.clipboard where the
  // browser has it and allows it, else a hidden textarea and execCommand('copy').
  function execCopy(text) {
    var doc = root.document;
    var ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;';
    var focused = doc.activeElement;
    doc.body.appendChild(ta);
    var ok = false;
    try {
      ta.focus();
      ta.select();
      ok = !!doc.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    doc.body.removeChild(ta);
    if (focused && focused.focus && focused !== doc.body) focused.focus();
    return ok;
  }
  function writeClipboard(text) {
    var cb = root.navigator && root.navigator.clipboard;
    if (cb && cb.writeText) {
      return Promise.resolve()
        .then(function () { return cb.writeText(text); })
        .then(function () { return true; }, function () { return execCopy(text); });
    }
    return Promise.resolve(execCopy(text));
  }

  // The button: "Copied" with a check mark, or "Copy failed", then back after a moment
  var LABELS = {
    ready: ['Copy passage', 'Copy the passage with its reference', '/img/copy.svg'],
    copied: ['Copied', 'Copied the passage', '/img/check.svg'],
    failed: ['Copy failed', 'Copy failed', '/img/copy.svg'],
  };
  function showState(button, name) {
    var l = LABELS[name];
    var label = button.querySelector('.passage-copy-label');
    var img = button.querySelector('img');
    if (label) label.textContent = l[0];
    if (img) img.setAttribute('src', l[2]);
    button.setAttribute('aria-label', l[1]);
    button.classList.toggle('is-copied', name === 'copied');
    button.classList.toggle('is-failed', name === 'failed');
  }
  function copyPassage(button) {
    return writeClipboard(passageText()).then(function (ok) {
      showState(button, ok ? 'copied' : 'failed');
      if (button._sgTimer) root.clearTimeout(button._sgTimer);
      button._sgTimer = root.setTimeout(function () {
        button._sgTimer = null;
        showState(button, 'ready');
      }, ok ? 2000 : 3000);
      return ok;
    });
  }

  if (root.document) {
    root.document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button.passage-copy');
      if (b) copyPassage(b);
    });
  }

  root.SGCopy = {
    click: click, clear: clear, init: init, formatRefs: formatRefs, copyText: copyText, select: select, modeOf: modeOf,
    passageText: passageText, copyPassage: copyPassage, writeClipboard: writeClipboard,
  };
})(window);
