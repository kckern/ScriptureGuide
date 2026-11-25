// Phone layout switch. Puts the class "sg-mobile" on <html> when the visitor is on a phone or the
// window is 700px or narrower; css/mobile.css lays out the page for it. Loaded in the head before
// prefs.js, so the first paint already has the right layout.
//
// A phone is told by the User-Agent Client Hints flag when the browser has one, otherwise by the
// User-Agent. Tablets are not phones: they get the desktop layout until their window is narrow.
// The server sets the same class from the request headers (middleware "device" in createApp.js),
// for the first byte and for visitors without scripts; this takes over once it runs, and follows
// the window as it is resized or rotated.
(function (root) {
  var PHONE = /Mobi|iPhone|iPod|Windows Phone|Android.+Mobile/i;
  var TABLET = /iPad|Tablet/i; // an iPad's User-Agent says Mobile too
  var NARROW = '(max-width: 700px)';

  function isPhone(nav) {
    var hints = nav && nav.userAgentData;
    if (hints && typeof hints.mobile === 'boolean') return hints.mobile;
    var ua = (nav && nav.userAgent) || '';
    return PHONE.test(ua) && !TABLET.test(ua);
  }

  var html = root.document && root.document.documentElement;
  var narrow = root.matchMedia ? root.matchMedia(NARROW) : null;

  function mobile() {
    return isPhone(root.navigator) || !!(narrow && narrow.matches);
  }

  function apply() {
    if (!html) return;
    html.classList.toggle('sg-mobile', mobile());
    // The one-column class follows this one (prefs.js)
    if (root.SGPrefs) root.SGPrefs.applyClasses(html);
  }

  root.SGDevice = { isPhone: isPhone, mobile: mobile };
  apply();
  if (narrow) {
    if (narrow.addEventListener) narrow.addEventListener('change', apply);
    else if (narrow.addListener) narrow.addListener(apply);
  }
})(window);
