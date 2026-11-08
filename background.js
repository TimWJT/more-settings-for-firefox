'use strict';
// More Settings for Firefox - background (event page).
// Listeners are added at the top level so Firefox can wake this page for them.

let settings = null;
const settingsReady = browser.storage.local.get(MSF_DEFAULTS).then((s) => (settings = s));

// ---------- Site helpers ----------
// True when host is one of the sites in the list, or a subdomain of one.
const onSite = (sites, host) => !!host && sites.some((s) => host === s || host.endsWith('.' + s));
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
const isPaused = (host) => onSite(settings.pausedSites, host);

// ---------- Links: clean tracking out of every page you open ----------
// What was cleaned is kept per tab (storage.session "act<tabId>") so the badge and the popup can show it.
const ACT_KEY = (tabId) => `act${tabId}`;
const bypassTabs = new Map();  // tabId -> time until which that tab's links aren't cleaned ("Open original link")

async function cleanNavigation(details) {
  if (details.method !== 'GET') return {};
  await settingsReady;
  if ((bypassTabs.get(details.tabId) || 0) > Date.now()) return {};
  if (isPaused(hostOf(details.url))) return {};
  const next = msfCleanOnce(details.url, settings);
  if (!next) return {};
  if (details.tabId >= 0) {
    const key = ACT_KEY(details.tabId);
    const prev = (await browser.storage.session.get(key))[key];
    // A redirect that was skipped and then had tracking removed counts as one change.
    const chained = prev && prev.url === details.url && Date.now() - prev.time < 15000;
    await browser.storage.session.set({
      [key]: {
        from: chained ? prev.from : details.url,
        url: next.url,
        notes: chained ? [...prev.notes, next.note] : [next.note],
        time: Date.now(),
        page: null,
      },
    });
  }
  return { redirectUrl: next.url };
}
browser.webRequest.onBeforeRequest.addListener(cleanNavigation, { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] }, ['blocking']);

browser.menus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'copy-clean-link' || !info.linkUrl) return;
  await navigator.clipboard.writeText(msfCleanFully(info.linkUrl));
});

function updateMenu() {
  browser.menus.remove('copy-clean-link').catch(() => {}).finally(() => {
    if (!settings.cleanLinkMenu) return;
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
  if (act?.page && act.page === url) items.push(`Link cleaned: ${act.notes.join('; ')}`);
  if (onSite(Object.keys(settings.popupSites), host)) items.push('Pop-up remover is on');
  if (onSite(settings.chromeSites, host)) items.push('Pretending to be Chrome');
  return { paused: false, items };
}

async function updateBadge(tabId, url) {
  const { paused, items } = await pageActivity(tabId, url);
  const title = paused
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
      if (act.page === null && Date.now() - act.time < 15000) {
        act.page = change.url;  // the page the cleaned link ended up on
        await browser.storage.session.set({ [key]: act });
      } else if (act.page !== change.url) {
        await browser.storage.session.remove(key);  // you've moved on to another page
      }
    }
  }
  if (change.url || change.status === 'complete') updateBadge(tabId, tab.url);
});
browser.tabs.onRemoved.addListener((tabId) => {
  bypassTabs.delete(tabId);
  browser.storage.session.remove(ACT_KEY(tabId));
});

const updateAllBadges = () => browser.tabs.query({ discarded: false }).then((tabs) => tabs.forEach((t) => updateBadge(t.id, t.url)));

// ---------- Firefox privacy settings ----------
async function applyPrivacy() {
  const p = browser.privacy;
  const set = (setting, on, value) => (on ? setting.set({ value }) : setting.clear({})).catch((e) => console.warn(e));
  await Promise.all([
    set(p.network.webRTCIPHandlingPolicy, settings.webrtcProtect,
      settings.webrtcStrict ? 'disable_non_proxied_udp' : 'default_public_interface_only'),
    set(p.websites.hyperlinkAuditingEnabled, settings.blockPing, false),
    set(p.websites.resistFingerprinting, settings.resistFingerprinting, true),
  ]);
}

// ---------- Per-site: pop-up remover and Chrome mask ----------
const ALL_TYPES = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest',
  'ping', 'media', 'websocket', 'other'];

function chromeVersion() {
  // Chrome 138 shipped 2025-06-24 and a new major comes out every 4 weeks. One behind is safest.
  const weeks = (Date.now() - Date.UTC(2025, 5, 24)) / (7 * 864e5);
  return 138 + Math.max(0, Math.floor(weeks / 4) - 1);
}

async function chromeHeaders() {
  const v = chromeVersion();
  const os = (await browser.runtime.getPlatformInfo()).os;
  const ua = os === 'mac'
    ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`
    : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
  return [
    { header: 'User-Agent', operation: 'set', value: ua },
    { header: 'Sec-CH-UA', operation: 'set', value: `"Chromium";v="${v}", "Google Chrome";v="${v}", "Not/A)Brand";v="99"` },
    { header: 'Sec-CH-UA-Mobile', operation: 'set', value: '?0' },
    { header: 'Sec-CH-UA-Platform', operation: 'set', value: os === 'mac' ? '"macOS"' : '"Windows"' },
  ];
}

// Only plain domain names (no IP addresses or ports) are used for per-site rules.
const validHost = (h) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(h) && !/^\d+(\.\d+){3}$/.test(h);
// The host and its subdomains, to match the DNR rules (requestDomains also covers subdomains).
const matchesFor = (hosts) => hosts.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);

async function registerScript(id, hosts, options) {
  try {
    await browser.scripting.unregisterContentScripts({ ids: [id] });
  } catch { /* wasn't registered */ }
  if (hosts.length) await browser.scripting.registerContentScripts([{ id, matches: matchesFor(hosts), persistAcrossSessions: true, ...options }]);
}

async function applySites() {
  // Paused sites get nothing from this add-on.
  const active = (h) => validHost(h) && !isPaused(h);
  const popupHosts = Object.keys(settings.popupSites).filter(active);
  const chromeHosts = settings.chromeSites.filter(active);
  const steps = [
    () => registerScript('popups', popupHosts, { js: ['content/popups.js'], runAt: 'document_idle' }),
    () => registerScript('chrome-mask', chromeHosts, {
      js: ['content/chrome-mask.js'], runAt: 'document_start', allFrames: true, matchOriginAsFallback: true, world: 'MAIN',
    }),
    async () => {
      const old = (await browser.declarativeNetRequest.getDynamicRules()).map((r) => r.id);
      const rules = [];
      if (chromeHosts.length) {
        const action = { type: 'modifyHeaders', requestHeaders: await chromeHeaders() };
        rules.push({ id: 1, priority: 1, action, condition: { requestDomains: chromeHosts, resourceTypes: ALL_TYPES } });
        // Requests the site makes to other servers, but not pages you open from it.
        const sub = ALL_TYPES.filter((t) => t !== 'main_frame' && t !== 'sub_frame');
        rules.push({ id: 2, priority: 1, action, condition: { initiatorDomains: chromeHosts, resourceTypes: sub } });
      }
      await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old, addRules: rules });
    },
  ];
  // Each step on its own, so one failure doesn't leave the others half done.
  for (const step of steps) {
    try { await step(); } catch (e) { console.error('More Settings for Firefox:', e); }
  }
}

// ---------- Tabs: duplicate (Alt+Shift+D), duplicate to a new window, move to a new window, new tab to the right ----------
async function selectedTabs() {
  return browser.tabs.query({ currentWindow: true, highlighted: true });
}

async function duplicateTabs() {
  await settingsReady;
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

async function toNewWindow(copy) {
  await settingsReady;
  const tabs = await selectedTabs();
  const current = await browser.windows.getCurrent();
  const ids = [];
  for (const tab of tabs) ids.push(copy ? (await browser.tabs.duplicate(tab.id)).id : tab.id);
  const win = await browser.windows.create({ tabId: ids[0], incognito: current.incognito, focused: !(copy && settings.dupBackground) });
  if (ids.length > 1) await browser.tabs.move(ids.slice(1), { windowId: win.id, index: -1 });
  for (const [i, tab] of tabs.entries()) if (tab.pinned) await browser.tabs.update(ids[i], { pinned: true });
  if (copy && settings.dupBackground) await browser.windows.update(current.id, { focused: true });
}

async function newTabRight() {
  const [tab] = await browser.tabs.query({ currentWindow: true, active: true });
  await browser.tabs.create({ index: tab.index + 1, openerTabId: tab.id });
}

const TAB_COMMANDS = {
  'duplicate-tab': duplicateTabs,
  'duplicate-to-new-window': () => toNewWindow(true),
  'move-to-new-window': () => toNewWindow(false),
  'new-tab-to-the-right': newTabRight,
};
browser.commands.onCommand.addListener((command) => TAB_COMMANDS[command]?.());

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'tabCommand' && TAB_COMMANDS[msg.command]) return TAB_COMMANDS[msg.command]().then(() => true);
  // Popup: save per-site lists and wait until the rules are in place (so a reload uses them).
  if (msg?.type === 'saveSites') {
    return settingsReady.then(async () => {
      await browser.storage.local.set(msg.changes);
      Object.assign(settings, msg.changes);
      await applyAll(['sites']);
      await updateAllBadges();
      return true;
    });
  }
  // Popup: "Open original link" loads the address as it was, without cleaning, in that tab only.
  if (msg?.type === 'openOriginal') {
    return (async () => {
      const key = ACT_KEY(msg.tabId);
      const act = (await browser.storage.session.get(key))[key];
      if (!act) return false;
      bypassTabs.set(msg.tabId, Date.now() + 10000);
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
    if (parts.includes('menu')) updateMenu();
  }).catch((e) => console.error('More Settings for Firefox:', e));
  return applying;
}

const PRIVACY_KEYS = ['webrtcProtect', 'webrtcStrict', 'blockPing', 'resistFingerprinting'];
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  settingsReady.then(() => {
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue ?? MSF_DEFAULTS[k];
    const parts = [];
    if (PRIVACY_KEYS.some((k) => k in changes)) parts.push('privacy');
    if ('popupSites' in changes || 'chromeSites' in changes || 'pausedSites' in changes) parts.push('sites');
    if ('cleanLinkMenu' in changes) parts.push('menu');
    if (parts.length) applyAll(parts).then(updateAllBadges);
  });
});

browser.runtime.onInstalled.addListener(() => applyAll());
browser.runtime.onStartup.addListener(() => applyAll(['sites', 'menu']));
