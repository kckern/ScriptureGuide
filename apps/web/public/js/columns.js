// Two columns for editions with one verse per paragraph (KJV, LDS).
//
// The server wraps such a section's paragraphs in <div class="vcols"> (section.ejs) and the CSS
// sets it in two balanced columns on wide screens, unless the visitor turned "Two columns" off
// (prefs.js puts sg-one-column on <html>). A long chapter in one pair of columns would make the
// reader scroll down the left column and back up for the right, so this script splits each
// .vcols into blocks no taller than the window: each block is a short pair of columns, blocks
// read top to bottom with a dotted rule between them, and a verse never crosses from one block
// to the next (inside a block the columns may split it).
//
// How the split avoids moving text on screen:
// - SGColumns.layout() first runs from the inline script at the end of <body>, before the first
//   paint (the body is still transparent then), so the page appears already split.
// - Paragraph heights are read from the layout already on the page (the sum of each paragraph's
//   line boxes in its column), so nothing is moved to measure.
// - Later calls (web font loaded, resize, verse numbers, a new version swapped in) keep the
//   blocks as they are while each still fits the window (at most 95% of its height, and not
//   under 45% of the target except the last). Only when that fails are the blocks rebuilt; the
//   first verse on screen is then kept at the same height in the window by scrolling.
// - Below 700px wide, or with the preference off, the CSS shows the blocks as one plain column
//   (no rules, no columns), so nothing needs undoing.
(function () {
  var MIN_WIDTH = 700; // matches the @media rule in style.css
  var TARGET = 0.85; // block height, share of the window height
  var MAX = 0.95; // a block taller than this is rebuilt
  var MIN_FILL = 0.45; // a block (not the last) shorter than this share of the target is rebuilt
  var MIN_HEIGHT = 320; // px, smallest target

  function active() {
    if (window.innerWidth < MIN_WIDTH) return false;
    return !document.documentElement.classList.contains('sg-one-column');
  }

  function target() { return Math.max(MIN_HEIGHT, Math.round(window.innerHeight * TARGET)); }

  // The paragraphs' heights as laid out now: in columns a paragraph may be in two pieces
  function heightOf(p) {
    var rects = p.getClientRects();
    var h = 0;
    for (var i = 0; i < rects.length; i++) h += rects[i].height;
    var cs = getComputedStyle(p);
    return h + (parseFloat(cs.marginBottom) || 0) + (parseFloat(cs.marginTop) || 0);
  }

  // Groups of paragraphs, each group at most `limit` tall in two balanced columns
  function partition(heights, limit, slack) {
    var groups = [];
    var cur = [];
    var sum = 0;
    for (var i = 0; i < heights.length; i++) {
      if (cur.length && (sum + heights[i]) / 2 + slack > limit) {
        groups.push(cur);
        cur = [];
        sum = 0;
      }
      cur.push(i);
      sum += heights[i];
    }
    if (cur.length) groups.push(cur);
    // A short last block: share the last two blocks' verses evenly instead
    if (groups.length > 1) {
      var last = groups[groups.length - 1];
      var lastSum = 0;
      last.forEach(function (j) { lastSum += heights[j]; });
      if (lastSum / 2 < limit * 0.4) {
        var both = groups[groups.length - 2].concat(last);
        var total = 0;
        both.forEach(function (j) { total += heights[j]; });
        var a = [];
        var acc = 0;
        for (var k = 0; k < both.length - 1; k++) {
          if (acc + heights[both[k]] / 2 > total / 2) break;
          acc += heights[both[k]];
          a.push(both[k]);
        }
        if (a.length) groups.splice(groups.length - 2, 2, a, both.slice(a.length));
      }
    }
    return groups;
  }

  // The blocks of one section: the server's .vcols and the blocks split from it
  function sections() {
    var out = [];
    var all = document.querySelectorAll('.vcols:not(.vcols-split)');
    for (var i = 0; i < all.length; i++) {
      var blocks = [all[i]];
      var n = all[i].nextElementSibling;
      while (n && n.classList.contains('vcols-split')) { blocks.push(n); n = n.nextElementSibling; }
      out.push(blocks);
    }
    return out;
  }

  function fits(blocks, limit) {
    if (blocks.length === 1) return false; // never split yet
    for (var i = 0; i < blocks.length; i++) {
      var h = blocks[i].getBoundingClientRect().height;
      if (h > window.innerHeight * MAX) return false;
      if (i < blocks.length - 1 && h < limit * MIN_FILL) return false;
    }
    return true;
  }

  // The first paragraph showing in the window, and where it is
  function anchor() {
    var ps = document.querySelectorAll('.vcols > p');
    for (var i = 0; i < ps.length; i++) {
      var r = ps[i].getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) return { el: ps[i], top: r.top };
    }
    return null;
  }

  function split(blocks, limit) {
    var paras = [];
    blocks.forEach(function (b) { paras.push.apply(paras, b.children); });
    var lineHeight = parseFloat(getComputedStyle(blocks[0]).lineHeight) || 26;
    var groups = partition(paras.map(heightOf), limit, 2 * lineHeight);
    var same = groups.length === blocks.length && groups.every(function (g, i) {
      return blocks[i].children.length === g.length && blocks[i].children[0] === paras[g[0]];
    });
    if (same) return;
    var first = blocks[0];
    for (var i = 1; i < blocks.length; i++) blocks[i].parentNode.removeChild(blocks[i]);
    var prev = first;
    groups.forEach(function (g, gi) {
      var block = first;
      if (gi > 0) {
        block = document.createElement('div');
        block.className = 'vcols vcols-split';
        prev.parentNode.insertBefore(block, prev.nextSibling);
        prev = block;
      }
      g.forEach(function (j) { block.appendChild(paras[j]); });
    });
  }

  function layout() {
    if (!active()) return;
    var secs = sections();
    if (!secs.length) return;
    var limit = target();
    var todo = secs.filter(function (blocks) { return !fits(blocks, limit); });
    if (!todo.length) return;
    var a = window.scrollY > 0 ? anchor() : null;
    todo.forEach(function (blocks) { split(blocks, limit); });
    if (a) {
      var moved = a.el.getBoundingClientRect().top - a.top;
      if (moved) window.scrollBy(0, moved);
    }
  }

  var timer = null;
  function later() {
    clearTimeout(timer);
    timer = setTimeout(layout, 120);
  }

  window.SGColumns = { layout: layout, partition: partition };
  window.addEventListener('resize', later);
  if (document.fonts) {
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', layout);
    if (document.fonts.ready) document.fonts.ready.then(layout);
  }
  if (window.SGPrefs) SGPrefs.on(function (key) { if (key === 'twoColumn') layout(); });
})();
