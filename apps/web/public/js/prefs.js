// Scripture Guide preferences, kept in this browser only (localStorage "sg_prefs").
//
//   SGPrefs.get('twoColumn')        → true
//   SGPrefs.set('verseNumbers', true)
//   SGPrefs.reset()
//   SGPrefs.on(function (key, value, all) { ... })   → returns a function that removes the listener
//
// Stored as versioned JSON, {"v":2,"verseNumbers":false,...}. Missing, unknown or mistyped values
// fall back to the defaults. Every storage access is guarded, so a browser that blocks storage
// (private mode, disabled site data) gets the defaults and changes last for the page only.
//
// Loaded in the page head, before the body is parsed: it sets classes on <html> that the CSS
// reads (sg-no-parallel, sg-no-facsimile, sg-no-audio, sg-one-column, sg-vnums), so the page is drawn
// with the visitor's choices from the first paint.
(function (root) {
  var KEY = 'sg_prefs';
  var VERSION = 2;
  // Version 1 saved every key, so most returning visitors have facsimile and audio stored as on.
  // Version 2 keeps their other choices and puts these back to the default (off until the
  // facsimile and audio assets are ready).
  var RESET_FROM_V1 = { facsimile: true, audio: true };
  var DEFAULTS = {
    verseNumbers: false, // verse numbers before each verse
    twoColumn: true, // two columns for editions with one verse per paragraph (KJV, LDS)
    parallel: true, // "parallel passage" buttons on headings
    facsimile: false, // facsimile buttons on headings (off until the facsimile assets are ready)
    audio: false, // audio buttons on headings (off until the audio assets are ready)
    verpanel: 'ver', // what the verse panel (right-click on a verse) opens on: versions or references
    copyHint: true, // show "Shift-click to copy a range" on the copy buttons until the first copy
  };
  var CHOICES = { verpanel: ['ver', 'ref'] };
  // <html> class for each preference that is off, read by the CSS
  var OFF_CLASS = { parallel: 'sg-no-parallel', facsimile: 'sg-no-facsimile', audio: 'sg-no-audio', twoColumn: 'sg-one-column' };
  // and for each that is on
  var ON_CLASS = { verseNumbers: 'sg-vnums' };

  function copy(o) {
    var out = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    return out;
  }

  function valid(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return false;
    if (CHOICES[key]) return CHOICES[key].indexOf(value) !== -1;
    return typeof value === typeof DEFAULTS[key];
  }

  // The values in a stored object, over the defaults
  function clean(stored) {
    var out = copy(DEFAULTS);
    if (!stored || typeof stored !== 'object') return out;
    var fromV1 = stored.v === 1;
    if (stored.v !== VERSION && !fromV1) return out;
    for (var k in DEFAULTS) if (valid(k, stored[k]) && !(fromV1 && RESET_FROM_V1[k])) out[k] = stored[k];
    return out;
  }

  // storage: a Storage-like object, a function returning one, or null. Any call may throw.
  function create(storage) {
    var store = function () {
      try { return typeof storage === 'function' ? storage() : storage; } catch (e) { return null; }
    };
    var getItem = function (k) { try { var s = store(); return s ? s.getItem(k) : null; } catch (e) { return null; } };
    var setItem = function (k, v) { try { var s = store(); if (s) s.setItem(k, v); return !!s; } catch (e) { return false; } };
    var removeItem = function (k) { try { var s = store(); if (s) s.removeItem(k); } catch (e) { /* ignore */ } };

    function load() {
      var raw = getItem(KEY);
      if (raw != null) {
        try { return clean(JSON.parse(raw)); } catch (e) { return copy(DEFAULTS); }
      }
      // First visit with this store: bring over the verse-number toggle main.js kept in "verses"
      var prefs = copy(DEFAULTS);
      var verses = getItem('verses');
      if (verses === '1' || verses === '0') {
        prefs.verseNumbers = verses === '1';
        if (save(prefs)) removeItem('verses');
      }
      return prefs;
    }

    function save(prefs) {
      var out = { v: VERSION };
      for (var k in DEFAULTS) out[k] = prefs[k];
      return setItem(KEY, JSON.stringify(out));
    }

    var current = load();
    var listeners = [];

    function emit(changed) {
      for (var i = 0; i < changed.length; i++) {
        var all = copy(current);
        for (var j = 0; j < listeners.length; j++) {
          try { listeners[j](changed[i], current[changed[i]], all); } catch (e) { if (root.console) root.console.error(e); }
        }
      }
    }

    // Replace every value; listeners hear about each one that changed
    function replace(next) {
      var changed = [];
      for (var k in DEFAULTS) if (current[k] !== next[k]) changed.push(k);
      current = next;
      return changed;
    }

    var api = {
      KEY: KEY,
      defaults: function () { return copy(DEFAULTS); },
      all: function () { return copy(current); },
      get: function (key) { return current[key]; },
      set: function (key, value) {
        if (!valid(key, value)) throw new TypeError('sg_prefs: bad value for ' + key + ': ' + value);
        if (current[key] === value) return;
        var next = copy(current);
        next[key] = value;
        var changed = replace(next);
        save(current);
        emit(changed);
      },
      reset: function () {
        var changed = replace(copy(DEFAULTS));
        save(current);
        emit(changed);
      },
      // Another tab changed the store ("storage" event): take its values
      reload: function () { emit(replace(load())); },
      on: function (fn) {
        listeners.push(fn);
        return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
      },
      // Set the <html> classes the CSS reads
      applyClasses: function (el) {
        if (!el || !el.classList) return;
        for (var k in OFF_CLASS) el.classList.toggle(OFF_CLASS[k], current[k] === false);
        for (var j in ON_CLASS) el.classList.toggle(ON_CLASS[j], current[j] === true);
      },
    };
    return api;
  }

  var prefs = create(function () { return root.localStorage; });
  prefs.create = create;
  root.SGPrefs = prefs;

  var html = root.document && root.document.documentElement;
  prefs.applyClasses(html);
  prefs.on(function () { prefs.applyClasses(html); });
  if (root.addEventListener) {
    root.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) prefs.reload(); });
  }
})(window);
