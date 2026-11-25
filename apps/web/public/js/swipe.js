// Swipe between chapters on a phone: a swipe left follows the "next" link, a swipe right the
// "previous" one (the chapter nav under the passage, a.next / a.prev). Active under html.sg-mobile
// only (device.js). A swipe is one finger, mostly horizontal, at least 60px, finished within
// 600ms. It is ignored when the page is zoomed in (the swipe is a pan), when text is selected,
// when it starts in a form field, panel or lightbox, or in something that scrolls sideways.
(function (root) {
  var MIN_DX = 60;      // px
  var MAX_MS = 600;
  var RATIO = 1.5;      // |dx| must be this many times |dy|
  var IGNORE = 'input, textarea, select, #pastebin, .sgp, .featherlight, .versionsbox, .versebox, #floater, #toolbar';

  var start = null;

  function scrollsSideways(el, stop) {
    for (; el && el !== stop && el.nodeType === 1; el = el.parentNode) {
      var s = root.getComputedStyle(el);
      if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true;
    }
    return false;
  }

  function onStart(e) {
    start = null;
    var doc = root.document;
    if (!doc.documentElement.classList.contains('sg-mobile')) return;
    if (e.touches.length !== 1) return;
    if (root.visualViewport && root.visualViewport.scale > 1.05) return;
    var t = e.target;
    if (t && t.closest && t.closest(IGNORE)) return;
    if (scrollsSideways(t, doc.body)) return;
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }

  function onEnd(e) {
    var s = start;
    start = null;
    if (!s || !e.changedTouches || e.changedTouches.length !== 1) return;
    var dx = e.changedTouches[0].clientX - s.x;
    var dy = e.changedTouches[0].clientY - s.y;
    if (Date.now() - s.t > MAX_MS) return;
    if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * RATIO) return;
    var sel = root.getSelection && root.getSelection();
    if (sel && !sel.isCollapsed) return;
    var link = root.document.querySelector(dx < 0 ? 'a.next' : 'a.prev');
    if (link) link.click(); // main layout script fades the page out, then follows it
  }

  function onCancel() { start = null; }

  var d = root.document;
  d.addEventListener('touchstart', onStart, { passive: true });
  d.addEventListener('touchend', onEnd, { passive: true });
  d.addEventListener('touchcancel', onCancel, { passive: true });
  d.addEventListener('touchmove', function (e) { if (e.touches.length > 1) start = null; }, { passive: true });
})(window);
