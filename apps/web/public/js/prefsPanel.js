// The preferences panel, opened by the toolbar gear (#settings_button). Built on first open;
// every control writes to SGPrefs (prefs.js) at once, and the page follows the change events.
// It floats over the page (fixed position, no scroll lock), so opening it moves nothing.
(function () {
  var panel = null;
  var backdrop = null;
  var opener = null;

  var TOGGLES = [
    { group: 'Text' },
    { key: 'verseNumbers', label: 'Verse numbers' },
    { key: 'twoColumn', label: 'Two columns', note: 'For editions with one verse per paragraph, like the KJV. Wide screens only.' },
    { group: 'Heading buttons' },
    { key: 'parallel', label: 'Parallel passages' },
    { key: 'facsimile', label: 'Facsimiles' },
    { key: 'audio', label: 'Audio' },
  ];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function build() {
    backdrop = el('div', 'sgp-backdrop');
    backdrop.addEventListener('mousedown', close);
    backdrop.addEventListener('touchstart', close, { passive: true });

    panel = el('div', 'sgp');
    panel.id = 'sg_prefs_panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'sgp_title');
    panel.tabIndex = -1;

    var head = el('div', 'sgp-head');
    var title = el('div', 'sgp-title', 'Preferences');
    title.id = 'sgp_title';
    var x = el('button', 'sgp-close', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    head.appendChild(title);
    head.appendChild(x);
    panel.appendChild(head);

    TOGGLES.forEach(function (t) {
      if (t.group) { panel.appendChild(el('div', 'sgp-group', t.group)); return; }
      var row = el('label', 'sgp-row');
      var text = el('span', 'sgp-label', t.label);
      if (t.note) text.appendChild(el('small', null, t.note));
      var box = el('input');
      box.type = 'checkbox';
      box.setAttribute('data-pref', t.key);
      box.addEventListener('change', function () { SGPrefs.set(t.key, box.checked); });
      row.appendChild(text);
      row.appendChild(box);
      row.appendChild(el('span', 'sgp-switch'));
      panel.appendChild(row);
    });

    panel.appendChild(el('div', 'sgp-group', 'Verse panel opens on'));
    var seg = el('div', 'sgp-seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', 'Verse panel opens on');
    [['ver', 'Versions'], ['ref', 'References']].forEach(function (c) {
      var lab = el('label');
      var r = el('input');
      r.type = 'radio';
      r.name = 'sgp_verpanel';
      r.value = c[0];
      r.setAttribute('data-pref', 'verpanel');
      r.addEventListener('change', function () { if (r.checked) SGPrefs.set('verpanel', r.value); });
      lab.appendChild(r);
      lab.appendChild(el('span', null, c[1]));
      seg.appendChild(lab);
    });
    panel.appendChild(seg);

    var foot = el('div', 'sgp-foot');
    var reset = el('button', 'sgp-reset', 'Reset to defaults');
    reset.type = 'button';
    reset.addEventListener('click', function () { SGPrefs.reset(); });
    foot.appendChild(reset);
    panel.appendChild(foot);

    // Keys stay in the panel: main.js turns the page on keyup of the right arrow
    panel.addEventListener('keyup', function (e) { e.stopPropagation(); });
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') trapTab(e);
      if (e.key === 'Escape' || e.key === 'Esc') close();
      e.stopPropagation();
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    SGPrefs.on(sync);
  }

  // Show the stored values (also after Reset, or a change in another tab)
  function sync() {
    if (!panel) return;
    var all = SGPrefs.all();
    var inputs = panel.querySelectorAll('input[data-pref]');
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var key = inp.getAttribute('data-pref');
      inp.checked = inp.type === 'radio' ? all[key] === inp.value : !!all[key];
    }
  }

  function trapTab(e) {
    var items = panel.querySelectorAll('button, input');
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }

  function place() {
    // Just above the toolbar, which is fixed to the bottom of the window
    var bar = document.getElementById('toolbar');
    var top = bar ? bar.getBoundingClientRect().top : window.innerHeight;
    panel.style.bottom = Math.max(8, window.innerHeight - top + 8) + 'px';
  }

  function isOpen() { return !!panel && panel.classList.contains('open'); }

  function open() {
    if (!panel) build();
    sync();
    place();
    opener = document.activeElement;
    backdrop.classList.add('open');
    panel.classList.add('open');
    panel.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen()) return;
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  function toggle() { if (isOpen()) close(); else open(); }

  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.key === 'Esc') && isOpen()) close();
  });
  window.addEventListener('resize', function () { if (isOpen()) place(); });

  function wire() {
    var gear = document.getElementById('settings_button');
    if (!gear) return;
    gear.setAttribute('role', 'button');
    gear.setAttribute('tabindex', '0');
    gear.setAttribute('aria-controls', 'sg_prefs_panel');
    gear.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    gear.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }

  window.SGPrefsPanel = { open: open, close: close, toggle: toggle };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
