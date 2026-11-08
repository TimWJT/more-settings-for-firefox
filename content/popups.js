// Pop-up remover. Runs on sites you switched it on for, or once when you press "Clean this page".
// Hides overlays that float over the page (cookie walls, sign-up boxes, dark backdrops) and lets the page scroll again.
// Level "popups": only big overlays and ones that look like cookie/newsletter boxes.
// Level "all": also unsticks headers and hides every bar that floats over the page.
(() => {
  if (window.msfPopups) {
    window.msfPopups.boot();
    return;
  }

  const WORDS = /cookie|consent|gdpr|privacy[ -]?(choices|preferences|settings)|newsletter|subscribe|sign[ -]?up|paywall|modal|overlay|popup|pop-up|lightbox|backdrop|interstitial|adblock|onetrust|didomi|\bcmp\b/i;
  const TEXT = /\b(cookies?|consent|accept all|reject all|we use|newsletter|subscribe|sign up|sign in to continue|disable your ad ?blocker|turn off your ad ?blocker)\b/i;

  let level = null;   // null = off
  let hidden = 0;
  let lastUserAction = 0;
  let observer = null;
  let timer = 0;

  addEventListener('pointerdown', () => { lastUserAction = Date.now(); }, true);
  addEventListener('keydown', () => { lastUserAction = Date.now(); }, true);

  const visibleArea = (r) => {
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  };

  function hide(el) {
    el.style.setProperty('display', 'none', 'important');
    el.setAttribute('data-msf', 'hidden');
    hidden++;
  }

  function check(el) {
    if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return;
    if (el.hasAttribute('data-msf')) return;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
    if (document.fullscreenElement && (el.contains(document.fullscreenElement) || document.fullscreenElement.contains(el))) return;
    // Something that appeared right after you clicked is probably a menu or dialog you opened.
    if (Date.now() - lastUserAction < 1500) return;

    const r = el.getBoundingClientRect();
    const area = visibleArea(r);
    if (!area) return;
    const screen = innerWidth * innerHeight;

    if (cs.position === 'sticky') {
      if (level === 'all') {
        el.style.setProperty('position', 'static', 'important');
        el.setAttribute('data-msf', 'unstuck');
      }
      return;
    }

    const big = area >= screen * 0.25;
    const named = WORDS.test(`${el.id} ${el.className} ${el.getAttribute('role') || ''} ${el.getAttribute('aria-label') || ''}`);
    // A slim bar along the top is usually the site's header, which often has a Subscribe or Sign up link.
    const header = r.top <= 2 && r.height < 130;
    const text = !big && !header && (el.innerText || '').length < 2000 && TEXT.test(el.innerText || '');

    if (big || named || text) {
      hide(el);
    } else if (level === 'all') {
      if (r.top <= 2 && r.height < innerHeight * 0.3) {
        el.style.setProperty('position', 'absolute', 'important');
        el.setAttribute('data-msf', 'unstuck');
      } else {
        hide(el);
      }
    }
  }

  // After hiding something, undo the scroll lock and blur that usually come with it.
  function unlock() {
    if (!hidden) return;
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.overflowY === 'hidden' || cs.overflow === 'hidden') {
        el.style.setProperty('overflow', 'auto', 'important');
        el.style.setProperty('overflow-y', 'auto', 'important');
      }
      if (el === document.body && cs.position === 'fixed') {
        el.style.setProperty('position', 'static', 'important');
      }
    }
    for (const el of document.body?.children || []) {
      const f = getComputedStyle(el).filter;
      if (f && f.includes('blur')) el.style.setProperty('filter', 'none', 'important');
    }
  }

  function scanAll() {
    if (!level || !document.body) return;
    for (const el of document.body.getElementsByTagName('*')) check(el);
    unlock();
  }

  function scanSome(nodes) {
    let n = 0;
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      check(node);
      for (const el of node.getElementsByTagName('*')) {
        check(el);
        if (++n > 800) break;
      }
      if (n > 800) break;
    }
    unlock();
  }

  let pending = new Set();
  function watch() {
    if (observer) return;
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') pending.add(r.target);
        else for (const n of r.addedNodes) pending.add(n);
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = 0;
        const nodes = pending;
        pending = new Set();
        scanSome(nodes);
      }, 250);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open'] });
  }

  function start(newLevel, keepWatching) {
    level = newLevel;
    scanAll();
    if (keepWatching) {
      watch();
      setTimeout(scanAll, 1500);
      setTimeout(scanAll, 4000);
    }
    return hidden;
  }

  function boot() {
    browser.storage.local.get({ popupSites: {} }).then(({ popupSites }) => {
      const lvl = popupSites[location.hostname];
      if (lvl) start(lvl, true);
    });
  }

  window.msfPopups = { start, boot, count: () => hidden };
  boot();
})();
