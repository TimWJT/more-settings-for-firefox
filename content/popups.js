// Pop-up remover. Runs on sites you switched it on for, or once when you press "Hide pop-ups now".
// Hides overlays that float over the page (cookie walls, sign-up boxes, dark backdrops) and lets the page scroll again.
// Level "popups": only big overlays, and cookie/newsletter boxes.
// Level "all": also unsticks headers and hides every bar that floats over the page.
// Every change is remembered, so stop() puts the page back exactly as it was.
(() => {
  if (window.msfPopups) {
    window.msfPopups.boot();
    return;
  }

  // Words that on their own mean "this is a cookie box, sign-up box or paywall".
  const STRONG = /cookie|consent|gdpr|privacy[ -]?(choices|preferences|settings)|newsletter|subscribe|sign[ -]?up|paywall|adblock|onetrust|didomi|\bcmp\b/i;
  // Words that only count together with a big overlay ("modal" is also used for menus and dialogs you open).
  const GENERIC = /modal|overlay|popup|pop-up|lightbox|backdrop|interstitial/i;
  const TEXT = /\b(cookies?|consent|accept all|reject all|we use|newsletter|subscribe|sign up|sign in to continue|disable your ad ?blocker|turn off your ad ?blocker)\b/i;

  let level = null;   // null = off
  let hidden = 0;
  let lastUserAction = 0;
  let observer = null;
  let timer = 0;
  let bodyText = 0;   // page text length, measured once per scan
  const changes = []; // [element, property, old value, old priority] for undo

  addEventListener('pointerdown', () => { lastUserAction = Date.now(); }, true);
  addEventListener('keydown', () => { lastUserAction = Date.now(); }, true);

  function setStyle(el, prop, value) {
    changes.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, value, 'important');
  }

  function hide(el) {
    setStyle(el, 'display', 'none');
    el.setAttribute('data-msf', 'hidden');
    hidden++;
  }

  const visibleArea = (r) => {
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  };

  // Things that are clearly part of the page or something you're using: never hidden.
  function isPageUi(el) {
    if (el.querySelector('main, article, [role="main"], video, canvas, input[type="password"], [contenteditable="true"]')) return true;
    const active = document.activeElement;
    if (active && active !== document.body && el.contains(active)) return true;
    // The page's text length is only measured when needed, once per scan (it walks the whole page).
    if (bodyText < 0) bodyText = document.body.textContent.length;
    const own = el.textContent.length;
    return bodyText > 500 && own > bodyText * 0.5;
  }

  function check(el) {
    if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return;
    if (el.hasAttribute('data-msf')) return;
    // Fast skip (measured: a full scan of a 24,000-element page went from ~250 ms to a few ms).
    // offsetParent is null only for fixed elements, hidden ones and body/html, so every other element
    // can't be a floating box. Sticky elements do have an offsetParent, so "all" mode checks everything.
    if (level !== 'all') {
      if (el.offsetParent !== null) return;
      const p = el.parentElement;
      if (p && p !== document.body && p !== document.documentElement && p.offsetParent === null) return;  // inside a hidden part
    }
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
    if (document.fullscreenElement && (el.contains(document.fullscreenElement) || document.fullscreenElement.contains(el))) return;
    // Something that appeared soon after you clicked or typed is probably a menu or dialog you opened.
    if (Date.now() - lastUserAction < 4000) return;

    const r = el.getBoundingClientRect();
    const area = visibleArea(r);
    if (!area) return;

    if (cs.position === 'sticky') {
      if (level === 'all') {
        setStyle(el, 'position', 'static');
        el.setAttribute('data-msf', 'unstuck');
      }
      return;
    }
    if (isPageUi(el)) return;

    const name = `${el.id} ${el.className} ${el.getAttribute('role') || ''} ${el.getAttribute('aria-label') || ''}`;
    // A slim bar along the top is usually the site's header, which often has a Subscribe or Sign up link.
    const header = r.top <= 2 && r.height < 130;
    const text = el.textContent.length < 2000 && TEXT.test(el.textContent);
    const strong = !header && (STRONG.test(name) || text);
    const big = area >= innerWidth * innerHeight * 0.25;
    // A big overlay counts only if it's see-through or nearly empty (a backdrop), or says it's a pop-up.
    const bg = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
    const alpha = bg ? Number(bg[1].split(',')[3] ?? 1) : 1;
    const backdrop = (alpha > 0 && alpha < 1) || Number(cs.opacity) < 1 || el.textContent.length < 400;
    // Small boxes need a strong sign and the shape of a banner (wide) or a box in the middle of the screen.
    const bannerShape = r.width >= innerWidth * 0.5 || Math.abs((r.left + r.right) / 2 - innerWidth / 2) < innerWidth * 0.15;

    if (big ? (backdrop || strong || GENERIC.test(name)) : (strong && bannerShape)) {
      hide(el);
    } else if (level === 'all') {
      if (header && r.height < innerHeight * 0.3) {
        setStyle(el, 'position', 'absolute');
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
        setStyle(el, 'overflow', 'auto');
        setStyle(el, 'overflow-y', 'auto');
      }
      if (el === document.body && cs.position === 'fixed') setStyle(el, 'position', 'static');
    }
    for (const el of document.body?.children || []) {
      const f = getComputedStyle(el).filter;
      if (f && f.includes('blur')) setStyle(el, 'filter', 'none');
    }
  }

  // Elements under a grid of points across the screen, plus their parents. A pop-up only matters if it covers
  // part of the screen, so this finds them without walking the whole page. Extra rows hug the top and bottom
  // edges so thin bars (a slim header, a cookie strip) are never missed between grid rows.
  function onScreen() {
    const found = new Set();
    const ys = [3, 15, 30];
    for (let j = 0; j < 9; j++) ys.push((j + 0.5) * innerHeight / 9);
    ys.push(innerHeight - 30, innerHeight - 15, innerHeight - 3);
    for (let i = 0; i < 9; i++) {
      for (const y of ys) {
        for (const hit of document.elementsFromPoint((i + 0.5) * innerWidth / 9, y)) {
          for (let el = hit; el && el !== document.body && el !== document.documentElement && !found.has(el); el = el.parentElement) {
            found.add(el);
          }
        }
      }
    }
    return found;
  }

  // Only looks at what's on screen (measured on a 24,000-element page: whole-page walk ~250 ms, this ~5 ms).
  // In "all" mode, sticky headers further down are caught as you scroll to them (see the scroll listener).
  function scanAll() {
    if (!level || !document.body) return;
    bodyText = -1;
    for (const el of onScreen()) check(el);
    unlock();
  }
  let scrollTimer = 0;
  addEventListener('scroll', () => {
    if (level !== 'all' || scrollTimer) return;
    scrollTimer = setTimeout(() => { scrollTimer = 0; scanAll(); }, 400);
  }, { passive: true });

  function scanSome(nodes) {
    if (!level || !document.body) return;
    bodyText = -1;
    let n = 0;
    for (const [node, deep] of nodes) {
      check(node);
      if (deep) {
        for (const el of node.getElementsByTagName('*')) {
          check(el);
          if (++n > 400) break;
        }
      }
      if (++n > 400) break;
    }
    unlock();
  }

  // Watches for pop-ups that appear later. New elements are checked with their children;
  // a class or style change only checks that one element. Changes to <html> and <body> (often our own) are ignored.
  let pending = new Map();
  function watch() {
    if (observer) return;
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') {
          if (r.target !== document.documentElement && r.target !== document.body && !pending.has(r.target)) pending.set(r.target, false);
        } else {
          for (const n of r.addedNodes) if (n instanceof HTMLElement) pending.set(n, true);
        }
      }
      if (timer || !pending.size) return;
      timer = setTimeout(() => {
        timer = 0;
        const nodes = pending;
        pending = new Map();
        scanSome(nodes);
      }, 300);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open'] });
  }

  function start(newLevel, keepWatching) {
    const firstWatch = keepWatching && !observer;
    level = newLevel;
    scanAll();
    if (firstWatch) {
      watch();
      setTimeout(scanAll, 1500);
      setTimeout(scanAll, 4000);
    }
    return hidden;
  }

  // Turn off and put back everything that was hidden or changed.
  function stop() {
    level = null;
    observer?.disconnect();
    observer = null;
    clearTimeout(timer); timer = 0;
    clearTimeout(scrollTimer); scrollTimer = 0;
    pending = new Map();
    for (const [el, prop, value, priority] of changes.reverse()) {
      if (value) el.style.setProperty(prop, value, priority); else el.style.removeProperty(prop);
      el.removeAttribute('data-msf');
    }
    changes.length = 0;
    const n = hidden;
    hidden = 0;
    return n;
  }

  // The entry for this site, or its parent domain's (example.com also covers www.example.com).
  function onList(list) {
    const parts = location.hostname.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      const site = parts.slice(i).join('.');
      if (Array.isArray(list) ? list.includes(site) : list[site]) return Array.isArray(list) ? true : list[site];
    }
    return null;
  }

  function boot() {
    browser.storage.local.get({ enabled: true, popupSites: {}, pausedSites: [] }).then(({ enabled, popupSites, pausedSites }) => {
      if (!enabled || onList(pausedSites)) return;
      const lvl = onList(popupSites);
      if (lvl) start(lvl, true);
    });
  }

  // Turning the add-on off (everywhere or on this site) puts hidden pop-ups back straight away, no reload.
  // Turning it back on hides them again. A one-off "Hide pop-ups now" on an unlisted site is left alone.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('enabled' in changes || 'pausedSites' in changes)) return;
    browser.storage.local.get({ enabled: true, popupSites: {}, pausedSites: [] }).then(({ enabled, popupSites, pausedSites }) => {
      if (!enabled || onList(pausedSites)) { if (level) stop(); return; }
      const lvl = onList(popupSites);
      if (lvl && lvl !== level) start(lvl, true);
    });
  });

  window.msfPopups = { start, stop, boot, count: () => hidden };
  boot();
})();
