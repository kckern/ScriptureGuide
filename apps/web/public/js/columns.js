// Two columns for editions with one verse per paragraph (KJV, LDS), set like the printed scriptures.
//
// The server wraps such a section's paragraphs in <div class="vcols"> (section.ejs). With the
// "Two columns" preference on (prefs.js; sg-one-column on <html> when off) the CSS sets it in two
// columns on screens 700px wide and up. Read down the left column, then on at the top of the
// right one: so this script splits each section into blocks that fit the screen whole, left
// column, right column and the rule under them, above the fixed toolbar.
//
// - The first block on the screen at load fills the room between its own top (under the title
//   and chapter summary) and the toolbar, so its bottom rule shows without scrolling.
// - Every later block fits the screen when scrolled to the top of the window.
// - If the first block would get under 6 lines, the first verses run full width (one column,
//   "vcols-lead") to the bottom of the screen and the two-column blocks start after them.
// - Blocks take whole verses; inside a block a verse may run from the left column to the right.
//
// No text moves on screen:
// - layout() first runs from the inline script at the end of <body>, before the first paint (the
//   body is still transparent then), so the page appears already split.
// - Later calls (web font loaded, resize, verse numbers, a version swapped in) keep the blocks
//   on or above the screen while they still fit, and rebuild only the blocks after them (also
//   when one of those is under 45% full). Only when a block on screen no longer fits is the
//   section rebuilt; the first verse on screen then keeps its height in the window by scrolling.
// - Each block starts with a running head (.vhead): a rule with the references of the left
//   column at its left end and of the right column at its right end. The server renders it
//   empty, so its height is there from the first paint; labels() fills in the text.
// - Below 700px wide, or with the preference off, the CSS shows the blocks as one plain column.
(function () {
  var MIN_WIDTH = 700; // matches the @media rule in style.css
  var GAP = 10; // px kept clear above the toolbar
  var MIN_LINES = 6; // fewer lines than this for the first block: lead with full-width verses
  var MIN_FILL = 0.45; // a block (not the last) under this share of its room is rebuilt

  function active() {
    if (window.innerWidth < MIN_WIDTH) return false;
    return !document.documentElement.classList.contains('sg-one-column');
  }

  function px(el, prop) { return parseFloat(getComputedStyle(el)[prop]) || 0; }

  // The bottom of the usable window: the top of the fixed toolbar, less a margin
  function usable() {
    var bar = document.getElementById('toolbar');
    var top = bar && bar.offsetHeight ? bar.getBoundingClientRect().top : window.innerHeight;
    return top - GAP;
  }

  // Room for a block (its running-head rule included), given where its top edge sits in the
  // window. The block, its bottom margin and the line of the next block's running head must
  // all end above the toolbar.
  function room(block, top) {
    var head = headOf(block);
    var below = head ? head.offsetHeight / 2 + 1 : 1;
    return usable() - top - px(block, 'borderTopWidth') - px(block, 'paddingTop') - px(block, 'marginBottom') - below;
  }
  function headOf(block) { return block.querySelector(':scope > .vhead'); }
  function parasOf(block) { return Array.prototype.slice.call(block.querySelectorAll(':scope > p')); }
  // Height the running head takes from a block's room
  function headHeight(block) {
    var head = headOf(block);
    return head ? head.offsetHeight + px(head, 'marginTop') + px(head, 'marginBottom') : 0;
  }
  function textHeight(block) {
    return block.getBoundingClientRect().height - px(block, 'borderTopWidth') - px(block, 'paddingTop');
  }
  function lineHeight(block) { return px(block.querySelector('p') || block, 'lineHeight') || 22; }
  // Where the block's top is when the page is at the top
  function topAtLoad(block) { return block.getBoundingClientRect().top + window.scrollY; }

  // The paragraphs' heights as laid out now: in columns a paragraph may be in two pieces
  function heightOf(p) {
    var rects = p.getClientRects();
    var h = 0;
    for (var i = 0; i < rects.length; i++) h += rects[i].height;
    return h + px(p, 'marginTop') + px(p, 'marginBottom');
  }

  // Groups of paragraphs for blocks of the given heights (limits[i], the last one repeating),
  // estimating a block in two balanced columns at half its paragraphs' height plus `slack`.
  function partition(heights, limits, slack) {
    var limit = function (i) { return limits[Math.min(i, limits.length - 1)]; };
    var groups = [];
    var cur = [];
    var sum = 0;
    for (var i = 0; i < heights.length; i++) {
      if (cur.length && (sum + heights[i]) / 2 + slack > limit(groups.length)) {
        groups.push(cur);
        cur = [];
        sum = 0;
      }
      cur.push(i);
      sum += heights[i];
    }
    if (cur.length) groups.push(cur);
    // A short last block: share the last two blocks' verses evenly (not with a first block,
    // whose room is set by the page above it)
    var n = groups.length;
    if (n > 2 || (n === 2 && limit(0) === limit(1))) {
      var lastSum = 0;
      groups[n - 1].forEach(function (j) { lastSum += heights[j]; });
      if (lastSum / 2 < limit(n - 1) * 0.4) {
        var both = groups[n - 2].concat(groups[n - 1]);
        var total = 0;
        both.forEach(function (j) { total += heights[j]; });
        var a = [];
        var acc = 0;
        for (var k = 0; k < both.length - 1; k++) {
          if (acc + heights[both[k]] / 2 > total / 2) break;
          acc += heights[both[k]];
          a.push(both[k]);
        }
        if (a.length) groups.splice(n - 2, 2, a, both.slice(a.length));
      }
    }
    return groups;
  }

  // The blocks of each section: the server's .vcols and the blocks split from it
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

  // What the first block should be: { lead: true } for full-width verses, else its room
  function firstPlan(first) {
    var top = topAtLoad(first);
    if (top >= usable()) return { room: null }; // below the first screen: a block like the others
    var r = room(first, top);
    if (r < MIN_LINES * lineHeight(first)) return { lead: true };
    return { room: r };
  }

  // How many leading blocks can stay as they are: on or above the screen and still fitting.
  // A rebuild then starts after them, so text on screen does not move. Returns -1 when every
  // block is fine.
  function keepable(blocks) {
    var first = blocks[0];
    var plan = firstPlan(first);
    var isLead = first.classList.contains('vcols-lead');
    if (!!plan.lead !== isLead) return 0;
    if (isLead && blocks.length > 1 && first.getBoundingClientRect().bottom + window.scrollY < usable()) return 0;
    var keep = isLead ? 1 : 0;
    for (var i = keep; i < blocks.length; i++) {
      var h = textHeight(blocks[i]);
      var r = i === 0 && plan.room != null ? plan.room : room(blocks[i], 0);
      var onScreen = blocks[i].getBoundingClientRect().top < window.innerHeight;
      if (h > r) return onScreen ? 0 : i;
      if (i < blocks.length - 1 && h < r * MIN_FILL && !onScreen) return i;
    }
    return -1;
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

  // A running head: a rule with the left column's references at its left end and the right
  // column's at its right end. section.ejs renders an empty one in each .vcols, so its height
  // is there from the first paint; labels() fills in the text.
  function newHead() {
    var head = document.createElement('div');
    head.className = 'vhead';
    head.setAttribute('aria-hidden', 'true');
    head.innerHTML = '<span class="vhead-l"></span><i></i><span class="vhead-r"></span>';
    return head;
  }

  function newBlock(after) {
    var block = document.createElement('div');
    block.className = 'vcols vcols-split';
    block.appendChild(newHead());
    after.parentNode.insertBefore(block, after.nextSibling);
    return block;
  }

  // "John 14:1", "John 14:1–10", "John 14:30–15:2" from the verses' ref attributes
  function rangeLabel(first, last) {
    if (!first) return '';
    if (first === last) return first;
    var a = /^(.*) (\d+):(\d+)$/.exec(first);
    var b = /^(.*) (\d+):(\d+)$/.exec(last);
    if (!a || !b) return first + '\u2013' + last;
    if (a[1] !== b[1]) return first + '\u2013' + last;
    if (a[2] !== b[2]) return first + '\u2013' + b[2] + ':' + b[3];
    return first + '\u2013' + b[3];
  }

  // Which verses each column of a block holds, from where their lines are drawn; a verse that
  // runs from the left column into the right is in both
  function labels(blocks) {
    blocks.forEach(function (block, i) {
      block.classList.toggle('vcols-end', i === blocks.length - 1);
      var head = headOf(block);
      if (!head) return;
      var box = block.getBoundingClientRect();
      var mid = box.left + box.width / 2;
      var left = [];
      var right = [];
      parasOf(block).forEach(function (p) {
        var verse = p.querySelector('.verse[ref]');
        var ref = verse && verse.getAttribute('ref');
        if (!ref) return;
        var rects = p.getClientRects();
        var inLeft = false;
        var inRight = false;
        for (var k = 0; k < rects.length; k++) {
          if (!rects[k].height) continue;
          if (rects[k].left < mid) inLeft = true; else inRight = true;
        }
        if (inLeft) left.push(ref);
        if (inRight) right.push(ref);
      });
      var lead = block.classList.contains('vcols-lead');
      head.firstChild.textContent = lead ? '' : rangeLabel(left[0], left[left.length - 1]);
      head.lastChild.textContent = lead ? '' : rangeLabel(right[0], right[right.length - 1]);
    });
  }

  // Rebuild the blocks from block `from` on (the ones before stay as they are)
  function rebuildFrom(blocks, from) {
    var target = blocks[from];
    for (var b = from + 1; b < blocks.length; b++) {
      parasOf(blocks[b]).forEach(function (p) { target.appendChild(p); });
      blocks[b].parentNode.removeChild(blocks[b]);
    }
    var paras = parasOf(target);
    var heights = paras.map(heightOf);
    var r = room(target, 0);
    var groups = partition(heights, [r - headHeight(target)], lineHeight(target));
    var chain = [target];
    var block = target;
    for (var g = 1; g < groups.length; g++) {
      block = newBlock(block);
      for (var j = 0; j < groups[g].length; j++) block.appendChild(paras[groups[g][j]]);
      chain.push(block);
    }
    for (var k = 0; k < chain.length; k++) {
      var own = parasOf(chain[k]);
      while (own.length > 1 && textHeight(chain[k]) > r) {
        if (!chain[k + 1]) chain.push(newBlock(chain[k]));
        chain[k + 1].insertBefore(own.pop(), chain[k + 1].querySelector(':scope > p'));
      }
    }
  }

  function rebuild(blocks) {
    var first = blocks[0];
    // Back to one two-column block, to measure every verse at column width
    first.classList.remove('vcols-lead');
    for (var b = 1; b < blocks.length; b++) {
      parasOf(blocks[b]).forEach(function (p) { first.appendChild(p); });
      blocks[b].parentNode.removeChild(blocks[b]);
    }
    if (!headOf(first)) first.insertBefore(newHead(), first.firstChild);
    var paras = parasOf(first);
    if (!paras.length) return;
    var heights = paras.map(heightOf);
    var plan = firstPlan(first);
    var probe = newBlock(first);
    var laterRoom = room(probe, 0); // a later block's room, with its rule and padding
    probe.parentNode.removeChild(probe);

    var start = 0;
    var head = first; // the first two-column block
    var firstRoom = plan.room != null ? plan.room : laterRoom;
    if (plan.lead) {
      // Full-width verses down past the bottom of the first screen, then the blocks
      first.classList.add('vcols-lead');
      head = newBlock(first);
      for (var m = 1; m < paras.length; m++) head.appendChild(paras[m]);
      start = 1;
      while (start < paras.length - 1 && first.getBoundingClientRect().bottom + window.scrollY < usable()) {
        first.appendChild(paras[start]);
        start++;
      }
      firstRoom = laterRoom;
    }

    // Greedy split, whole verses. Later groups move out first, so each block keeps verse order.
    var hh = headHeight(head);
    var groups = partition(heights.slice(start), [firstRoom - hh, laterRoom - hh], lineHeight(first));
    var chain = [head];
    var block = head;
    for (var g = 1; g < groups.length; g++) {
      block = newBlock(block);
      for (var j = 0; j < groups[g].length; j++) block.appendChild(paras[start + groups[g][j]]);
      chain.push(block);
    }
    // Exact check: while a block is taller than its room, its last verse moves to the next block
    for (var k = 0; k < chain.length; k++) {
      var r = k === 0 ? firstRoom : laterRoom;
      var own = parasOf(chain[k]);
      while (own.length > 1 && textHeight(chain[k]) > r) {
        if (!chain[k + 1]) chain.push(newBlock(chain[k]));
        chain[k + 1].insertBefore(own.pop(), chain[k + 1].querySelector(':scope > p'));
      }
    }
  }

  function layout() {
    if (!active()) return;
    var secs = sections();
    if (!secs.length) return;
    var a = null;
    secs.forEach(function (blocks) {
      var keep = keepable(blocks);
      if (keep < 0) return;
      if (keep > 0) { rebuildFrom(blocks, keep); return; }
      if (!a && window.scrollY > 0) a = anchor();
      rebuild(blocks);
    });
    if (a) {
      var moved = a.el.getBoundingClientRect().top - a.top;
      if (moved) window.scrollBy(0, moved);
    }
    // The running heads follow the columns (a new font or verse numbers move verses between them)
    sections().forEach(labels);
  }

  var timer = null;
  function later() {
    clearTimeout(timer);
    timer = setTimeout(layout, 120);
  }

  window.SGColumns = { layout: layout, partition: partition, rangeLabel: rangeLabel };
  window.addEventListener('resize', later);
  if (document.fonts) {
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', layout);
    if (document.fonts.ready) document.fonts.ready.then(layout);
  }
  if (window.SGPrefs) SGPrefs.on(function (key) { if (key === 'twoColumn') layout(); });
})();
