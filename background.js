'use strict';
// More Settings for Firefox - background (event page).
// Listeners are added at the top level so Firefox can wake this page for them.

let settings = null;
// If storage can't be read, run on the defaults rather than failing every page load.
const settingsReady = browser.storage.local.get(MSF_DEFAULTS).then((s) => (settings = s), () => (settings = { ...MSF_DEFAULTS }));

// ---------- Site helpers ----------
// True when host is one of the sites in the list, or a subdomain of one.
const onSite = (sites, host) => !!host && sites.some((s) => host === s || host.endsWith('.' + s));
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
// Off everywhere (the popup's power button) counts as paused on every site.
const isPaused = (host) => !settings.enabled || onSite(settings.pausedSites, host);

// ---------- Links: clean tracking out of every page you open ----------
// What was cleaned is kept per tab (storage.session "act<tabId>") so the badge and the popup can show it.
const ACT_KEY = (tabId) => `act${tabId}`;
// "Open original link" (and the loop guard) stop cleaning in a tab for a few seconds.
// Kept in storage.session so it survives this page being unloaded in between.
const BYPASS_KEY = (tabId) => `bypass${tabId}`;
const setBypass = (tabId, ms) => browser.storage.session.set({ [BYPASS_KEY(tabId)]: Date.now() + ms });

async function cleanNavigation(details) {
  if (details.method !== 'GET') return {};
  if (!settings) await settingsReady;
  // Cheap checks first: most pages need no change and never touch storage.
  if (isPaused(hostOf(details.url))) return {};
  const next = msfCleanOnce(details.url, settings);
  if (!next) return {};
  if (details.tabId < 0) return { redirectUrl: next.url };

  const key = ACT_KEY(details.tabId), bkey = BYPASS_KEY(details.tabId);
  const stored = await browser.storage.session.get([key, bkey]);
  if ((stored[bkey] || 0) > Date.now()) return {};
  const prev = stored[key];
  const now = Date.now();
  // A redirect that was skipped and then had tracking removed counts as one change.
  const chained = prev && prev.page === null && now - prev.time < 10000;
  // The page loaded and then sent you straight back to the same tracked address (a script putting it back).
  const again = prev && prev.from === details.url && now - prev.time < 10000;
  const count = chained || again ? (prev.count || 1) + 1 : 1;
  // Loop guard: if the site keeps adding the parameter back, stop cleaning this tab for a bit,
  // and forget the last cleaning so the page that loads now isn't shown as cleaned.
  if (count > 4) {
    await setBypass(details.tabId, 15000);
    await browser.storage.session.remove(key);
    return {};
  }
  await browser.storage.session.set({
    [key]: {
      from: chained ? prev.from : details.url,
      url: next.url,
      notes: chained ? [...new Set([...prev.notes, next.note])] : [next.note],
      time: now,
      page: null,
      count,
    },
  });
  return { redirectUrl: next.url };
}
browser.webRequest.onBeforeRequest.addListener(cleanNavigation, { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] }, ['blocking']);

browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'copy-clean-link' || !info.linkUrl) return;
  const { url, notes } = msfCleanFullyWithNotes(info.linkUrl);
  let ok = true;
  try { await navigator.clipboard.writeText(url); } catch { ok = false; }
  // Always say what happened, so a link that works differently once shared isn't a mystery.
  const title = !ok ? "Couldn't copy the link" : notes.length ? 'Copied clean link' : 'Copied link';
  const detail = !ok ? 'Try again.' : notes.length ? notes.join('. ') + '.' : 'It had no tracking to remove.';
  if (tab?.id >= 0) browser.scripting.executeScript({ target: { tabId: tab.id }, func: showCopyToast, args: [title, detail] }).catch(() => {});
});

// A small note in the corner of the page for 4 seconds. Runs inside the page, in its own shadow root so the
// site's styles can't change it.
function showCopyToast(title, detail) {
  document.getElementById('msf-copy-toast')?.remove();
  const host = document.createElement('div');
  host.id = 'msf-copy-toast';
  const root = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('div');
  box.setAttribute('role', 'status');
  box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:340px;padding:12px 16px;'
    + 'border-radius:14px;background:#1f1f1f;color:#ececec;box-shadow:0 6px 24px #0008;font:14px/1.35 system-ui,sans-serif;'
    + 'transition:opacity .2s ease-out';
  const b = document.createElement('b');
  b.textContent = '✓ ' + title;
  b.style.cssText = 'display:block;color:#8dd28d;font-weight:700';
  const p = document.createElement('div');
  p.textContent = detail;
  p.style.cssText = 'margin-top:2px;color:#a8a8a8;font-size:12.5px';
  box.append(b, p);
  root.append(box);
  document.documentElement.append(host);
  setTimeout(() => { box.style.opacity = '0'; setTimeout(() => host.remove(), 200); }, 4000);
}

function updateMenu() {
  return browser.menus.remove('copy-clean-link').catch(() => {}).finally(() => {
    if (!settings.enabled || !settings.cleanLinkMenu) return;
    browser.menus.create({ id: 'copy-clean-link', title: 'Copy clean link', contexts: ['link'] }, () => void browser.runtime.lastError);
  });
}

// ---------- Badge: how many things this add-on is doing on the page ----------
// The number on the toolbar icon. Hover it for the list; open the popup for details and undo.
async function pageActivity(tabId, url) {
  await settingsReady;
  const host = hostOf(url);
  const items = [];
  if (isPaused(host)) return { paused: true, items };
  const act = (await browser.storage.session.get(ACT_KEY(tabId)))[ACT_KEY(tabId)];
  if (act?.page && act.page === url && Array.isArray(act.notes)) items.push(`Link cleaned: ${act.notes.join('; ')}`);
  if (onSite(Object.keys(settings.popupSites), host)) items.push('Pop-up remover is on');
  if (onSite(settings.chromeSites, host)) items.push('Pretending to be Chrome');
  return { paused: false, items };
}

async function updateBadge(tabId, url) {
  const { paused, items } = await pageActivity(tabId, url);
  const title = !settings.enabled
    ? 'More Settings for Firefox: off everywhere'
    : paused
    ? 'More Settings for Firefox: paused on this site'
    : items.length ? `More Settings for Firefox:\n• ${items.join('\n• ')}` : 'More Settings for Firefox: nothing changed on this page';
  try {
    await browser.action.setBadgeText({ tabId, text: paused ? 'off' : items.length ? String(items.length) : '' });
    await browser.action.setBadgeBackgroundColor({ tabId, color: paused ? '#5b5b66' : '#8dd28d' });
    await browser.action.setBadgeTextColor({ tabId, color: paused ? '#ffffff' : '#102010' });
    await browser.action.setTitle({ tabId, title });
  } catch { /* tab closed */ }
}

browser.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (tab.discarded) return;
  if (change.url) {
    const key = ACT_KEY(tabId);
    const act = (await browser.storage.session.get(key))[key];
    if (act) {
      if (act.page === null && Date.now() - act.time < 30000) {
        act.page = change.url;  // the page the cleaned link ended up on
        await browser.storage.session.set({ [key]: act });
      } else if (act.page !== change.url) {
        await browser.storage.session.remove(key);  // you've moved on to another page
      }
    }
  }
  if (change.url || change.status === 'complete') updateBadge(tabId, tab.url);
});
browser.tabs.onRemoved.addListener((tabId) => browser.storage.session.remove([ACT_KEY(tabId), BYPASS_KEY(tabId)]));

const updateAllBadges = () => browser.tabs.query({ discarded: false }).then((tabs) => tabs.forEach((t) => updateBadge(t.id, t.url)));

// ---------- Firefox privacy settings ----------
async function applyPrivacy() {
  const p = browser.privacy;
  // Off everywhere: hand every setting back to Firefox.
  const set = (setting, on, value) => (on && settings.enabled ? setting.set({ value }) : setting.clear({})).catch((e) => console.warn(e));
  await Promise.all([
    set(p.network.webRTCIPHandlingPolicy, settings.webrtcProtect, 'default_public_interface_only'),
    set(p.websites.hyperlinkAuditingEnabled, settings.blockPing, false),
    set(p.websites.resistFingerprinting, settings.resistFingerprinting, true),
  ]);
}

// ---------- Per-site: pop-up remover and Chrome mask ----------
const ALL_TYPES = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest',
  'ping', 'media', 'websocket', 'other'];

function chromeVersion() {
  // Chrome 138 shipped 2025-06-24. Releases are 4-6 weeks apart, so count one per 5 weeks and stay one behind:
  // a slightly old version is normal, an unreleased one looks fake. Same formula in content/chrome-mask.js.
  const weeks = (Date.now() - Date.UTC(2025, 5, 24)) / (7 * 864e5);
  return 138 + Math.max(0, Math.floor(weeks / 5) - 1);
}

async function chromeHeaders() {
  const v = chromeVersion();
  // Chrome on the same kind of computer: Mac, Linux, else Windows. Same choice in content/chrome-mask.js.
  const os = (await browser.runtime.getPlatformInfo()).os;
  const system = os === 'mac' ? 'Macintosh; Intel Mac OS X 10_15_7' : os === 'linux' ? 'X11; Linux x86_64' : 'Windows NT 10.0; Win64; x64';
  const ua = `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
  return [
    { header: 'User-Agent', operation: 'set', value: ua },
    { header: 'Sec-CH-UA', operation: 'set', value: `"Chromium";v="${v}", "Google Chrome";v="${v}", "Not/A)Brand";v="99"` },
    { header: 'Sec-CH-UA-Mobile', operation: 'set', value: '?0' },
    { header: 'Sec-CH-UA-Platform', operation: 'set', value: os === 'mac' ? '"macOS"' : os === 'linux' ? '"Linux"' : '"Windows"' },
  ];
}

// Only plain domain names (no IP addresses or ports) are used for per-site rules.
const validHost = (h) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(h) && !/^\d+(\.\d+){3}$/.test(h);
// The host and its subdomains, to match the DNR rules (requestDomains also covers subdomains).
const matchesFor = (hosts) => hosts.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);

// Registers (or removes) a content script, but only touches Firefox when something actually changed,
// so a page loading at the same moment never sees a gap.
async function registerScript(id, hosts, paused, options) {
  const existing = (await browser.scripting.getRegisteredContentScripts({ ids: [id] }))[0];
  const wanted = hosts.length
    ? { id, matches: matchesFor(hosts), excludeMatches: paused.length ? matchesFor(paused) : undefined, persistAcrossSessions: true, ...options }
    : null;
  const same = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
  // Unset options are compared as Firefox's defaults.
  const opts = (o) => [o.runAt || 'document_idle', !!o.allFrames, o.world || 'ISOLATED', !!o.matchOriginAsFallback].join();
  if (existing && wanted && same(existing.matches, wanted.matches) && same(existing.excludeMatches, wanted.excludeMatches)
    && same(existing.js, wanted.js) && opts(existing) === opts(wanted)) return;
  if (existing) await browser.scripting.unregisterContentScripts({ ids: [id] });
  if (wanted) await browser.scripting.registerContentScripts([wanted]);
}

async function applySites() {
  // Off everywhere: no scripts, no header rules.
  const popupHosts = settings.enabled ? Object.keys(settings.popupSites).filter(validHost) : [];
  const chromeHosts = settings.enabled ? settings.chromeSites.filter(validHost) : [];
  // Paused sites get nothing, even when the setting is on for their parent domain (pause shop.example.com, keep example.com).
  const paused = settings.pausedSites.filter(validHost);
  const steps = [
    () => registerScript('popups', popupHosts, paused, { js: ['content/popups.js'], runAt: 'document_idle' }),
    () => registerScript('chrome-mask', chromeHosts, paused, {
      js: ['content/chrome-mask.js'], runAt: 'document_start', allFrames: true, matchOriginAsFallback: true, world: 'MAIN',
    }),
    async () => {
      const old = await browser.declarativeNetRequest.getDynamicRules();
      const rules = [];
      if (chromeHosts.length) {
        const action = { type: 'modifyHeaders', requestHeaders: await chromeHeaders() };
        const skip = paused.length ? { excludedRequestDomains: paused, excludedInitiatorDomains: paused } : {};
        rules.push({ id: 1, priority: 1, action, condition: { requestDomains: chromeHosts, resourceTypes: ALL_TYPES, ...skip } });
        // Requests the site makes to other servers, but not pages you open from it.
        const sub = ALL_TYPES.filter((t) => t !== 'main_frame' && t !== 'sub_frame');
        rules.push({ id: 2, priority: 1, action, condition: { initiatorDomains: chromeHosts, resourceTypes: sub, ...skip } });
      }
      const key = (list) => JSON.stringify([...list].sort((a, b) => a.id - b.id).map((r) => [r.id, r.priority, r.condition, r.action]));
      if (key(old) === key(rules)) return;
      await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map((r) => r.id), addRules: rules });
    },
  ];
  // Each step on its own, so one failure doesn't leave the others half done.
  for (const step of steps) {
    try { await step(); } catch (e) { console.error('More Settings for Firefox:', e); }
  }
}

// Turned back on: open tabs on pop-up sites that never loaded the remover (opened while it was off) get it now.
// Tabs that already have it update themselves (content/popups.js listens for the change).
async function wakePopupTabs() {
  if (!settings.enabled) return;
  const sites = Object.keys(settings.popupSites).filter(validHost);
  if (!sites.length) return;
  const tabs = await browser.tabs.query({ url: matchesFor(sites), discarded: false });
  for (const t of tabs) {
    if (isPaused(hostOf(t.url))) continue;
    browser.scripting.executeScript({ target: { tabId: t.id }, files: ['content/popups.js'] }).catch(() => {});
  }
}

// ---------- Tabs: duplicate with a keyboard shortcut (Alt+Shift+D unless changed in the popup) ----------
async function selectedTabs() {
  return browser.tabs.query({ currentWindow: true, highlighted: true });
}

async function duplicateTabs() {
  await settingsReady;
  if (!settings.enabled) return;
  const tabs = await selectedTabs();
  // Unpinned copies go after the last selected tab, in order. Pinned copies stay with the pinned tabs.
  let anchor = tabs.filter((t) => !t.pinned).at(-1)?.id;
  let firstCopy = null, activeCopy = null;
  for (const tab of tabs) {
    let copy;
    if (tab.pinned) {
      copy = await browser.tabs.duplicate(tab.id, { active: false });
      await browser.tabs.update(copy.id, { pinned: true });
    } else {
      const index = (await browser.tabs.get(anchor)).index + 1;
      copy = await browser.tabs.duplicate(tab.id, { index, active: false });
      anchor = copy.id;
    }
    firstCopy ??= copy;
    if (tab.active) activeCopy = copy;
  }
  const target = activeCopy || firstCopy;
  if (!settings.dupBackground && target) await browser.tabs.update(target.id, { active: true });
}

browser.commands.onCommand.addListener((command) => {
  if (command === 'duplicate-tab') duplicateTabs();
});

browser.runtime.onMessage.addListener((msg) => {
  // Popup: save per-site lists and wait until the rules are in place (so a reload uses them).
  if (msg?.type === 'saveSites') {
    // Only the per-site lists can be saved this way.
    const changes = Object.fromEntries(Object.entries(msg.changes || {})
      .filter(([k]) => ['popupSites', 'chromeSites', 'pausedSites'].includes(k)));
    return settingsReady.then(async () => {
      await browser.storage.local.set(changes);
      Object.assign(settings, changes);
      await applyAll(['sites']);
      await updateAllBadges();
      return true;
    });
  }
  // Popup: after turning the add-on off or on here, can this page catch up without a reload?
  // Chrome mode (the browser name was already sent) and link cleaning (the address already loaded) can't.
  if (msg?.type === 'reloadNeeded') {
    return settingsReady.then(async () => {
      const host = hostOf(msg.url);
      if (validHost(host) && onSite(settings.chromeSites, host)) return true;
      if (msg.active) return !!msfCleanOnce(msg.url, settings);
      const act = (await browser.storage.session.get(ACT_KEY(msg.tabId)))[ACT_KEY(msg.tabId)];
      return act?.page === msg.url;
    });
  }
  // Popup: "Open original link" loads the address as it was, without cleaning, in that tab only.
  if (msg?.type === 'openOriginal') {
    if (!Number.isInteger(msg.tabId) || msg.tabId < 0) return Promise.resolve(false);
    return (async () => {
      const key = ACT_KEY(msg.tabId);
      const act = (await browser.storage.session.get(key))[key];
      if (!act) return false;
      await setBypass(msg.tabId, 10000);
      await browser.storage.session.remove(key);
      await browser.tabs.update(msg.tabId, { url: act.from });
      return true;
    })();
  }
});

// ---------- Apply everything ----------
let applying = Promise.resolve();
function applyAll(parts = ['privacy', 'sites', 'menu']) {
  applying = applying.then(async () => {
    await settingsReady;
    if (parts.includes('privacy')) await applyPrivacy();
    if (parts.includes('sites')) await applySites();
    if (parts.includes('menu')) await updateMenu();
  }).catch((e) => console.error('More Settings for Firefox:', e));
  return applying;
}

const PRIVACY_KEYS = ['webrtcProtect', 'blockPing', 'resistFingerprinting'];
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  settingsReady.then(() => {
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue ?? MSF_DEFAULTS[k];
    const parts = 'enabled' in changes ? ['privacy', 'sites', 'menu'] : [];
    if (PRIVACY_KEYS.some((k) => k in changes)) parts.push('privacy');
    if ('popupSites' in changes || 'chromeSites' in changes || 'pausedSites' in changes) parts.push('sites');
    if ('cleanLinkMenu' in changes) parts.push('menu');
    if (parts.length) applyAll(parts).then(updateAllBadges);
    if ('enabled' in changes || 'pausedSites' in changes) wakePopupTabs();
  });
});

browser.runtime.onInstalled.addListener(() => applyAll());
// Check the per-site scripts and rules are in place once per browser session (browser start, add-on
// re-enabled or updated), not on every wake-up: storage.session is empty again after each of those.
// Measured: re-checking on every wake added ~25 ms to the first page load after the add-on had been idle.
// It also waits a moment so it never competes with the page load that woke this page up.
browser.runtime.onStartup.addListener(() => applyAll(['menu']));
setTimeout(async () => {
  if ((await browser.storage.session.get('sitesChecked')).sitesChecked) return;
  await applyAll(['sites']);
  await browser.storage.session.set({ sitesChecked: true });
}, 1500);
// Website access granted later (from the popup's Allow button): set everything up now.
browser.permissions.onAdded.addListener(() => applyAll());
