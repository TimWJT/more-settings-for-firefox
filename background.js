'use strict';
// More Settings for Firefox - background (event page).
// Listeners are added at the top level so Firefox can wake this page for them.

let settings = null;
const settingsReady = browser.storage.local.get(MSF_DEFAULTS).then((s) => (settings = s));

// ---------- Links: clean tracking out of every page you open ----------
function cleanNavigation(details) {
  if (details.method !== 'GET') return {};
  const run = (s) => {
    const next = msfCleanOnce(details.url, s);
    return next ? { redirectUrl: next } : {};
  };
  return settings ? run(settings) : settingsReady.then(run);
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

// ---------- Server country flag ----------
const FLAG_KEY = (tabId) => `tab${tabId}`;

function flagEmoji(cc) {
  if (cc === 'LOCAL') return '🏠';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

function countryName(cc) {
  if (cc === 'LOCAL') return 'Your local network';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc;
  } catch {
    return cc;
  }
}

function flagImage(cc) {
  const images = {};
  for (const size of [16, 32]) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(size * 0.86)}px "Twemoji Mozilla", "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.fillText(flagEmoji(cc), size / 2, size / 2 + size * 0.06);
    images[size] = ctx.getImageData(0, 0, size, size);
  }
  return images;
}

async function rememberServer(tabId, url, ip) {
  let host;
  try { host = new URL(url).hostname; } catch { return; }
  if (!ip) {
    try {
      ip = (await browser.dns.resolve(host)).addresses[0];
    } catch {
      return;
    }
  }
  const cc = await msfIpdb.country(ip);
  const info = { host, ip, cc };
  await browser.storage.session.set({ [FLAG_KEY(tabId)]: info });
  return info;
}

async function showFlag(tabId, url) {
  await settingsReady;
  let host;
  try { host = new URL(url).hostname; } catch { host = null; }
  if (!settings.showFlag || !host || !/^https?:/.test(url)) {
    browser.pageAction.hide(tabId).catch(() => {});
    return;
  }
  let info = (await browser.storage.session.get(FLAG_KEY(tabId)))[FLAG_KEY(tabId)];
  if (!info || info.host !== host) info = await rememberServer(tabId, url, null);
  if (!info?.cc) {
    browser.pageAction.hide(tabId).catch(() => {});
    return;
  }
  try {
    await browser.pageAction.setIcon({ tabId, imageData: flagImage(info.cc) });
    await browser.pageAction.setTitle({ tabId, title: `${countryName(info.cc)} · ${info.ip}` });
    await browser.pageAction.show(tabId);
  } catch { /* tab closed */ }
}

browser.webRequest.onResponseStarted.addListener((d) => {
  if (d.tabId < 0) return;
  rememberServer(d.tabId, d.url, d.ip).then(() => showFlag(d.tabId, d.url));
}, { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] });

browser.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === 'complete') showFlag(tabId, tab.url);
});
browser.tabs.onRemoved.addListener((tabId) => browser.storage.session.remove(FLAG_KEY(tabId)));

// ---------- Firefox privacy settings ----------
async function applyPrivacy() {
  const p = browser.privacy;
  const set = (setting, on, value) => (on ? setting.set({ value }) : setting.clear({})).catch((e) => console.warn(e));
  await Promise.all([
    set(p.network.webRTCIPHandlingPolicy, settings.webrtcProtect,
      settings.webrtcStrict ? 'disable_non_proxied_udp' : 'default_public_interface_only'),
    set(p.websites.hyperlinkAuditingEnabled, settings.blockPing, false),
    set(p.websites.resistFingerprinting, settings.resistFingerprinting, true),
    set(p.network.networkPredictionEnabled, settings.noPrefetch, false),
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

const matchesFor = (hosts) => hosts.map((h) => `*://${h}/*`);

async function applySites() {
  const popupHosts = Object.keys(settings.popupSites);
  const chromeHosts = settings.chromeSites;

  const registered = (await browser.scripting.getRegisteredContentScripts()).map((s) => s.id);
  if (registered.length) await browser.scripting.unregisterContentScripts({ ids: registered });
  const scripts = [];
  if (popupHosts.length) {
    scripts.push({ id: 'popups', matches: matchesFor(popupHosts), js: ['content/popups.js'], runAt: 'document_idle', persistAcrossSessions: true });
  }
  if (chromeHosts.length) {
    scripts.push({ id: 'chrome-mask', matches: matchesFor(chromeHosts), js: ['content/chrome-mask.js'], runAt: 'document_start', allFrames: true, world: 'MAIN', persistAcrossSessions: true });
  }
  if (scripts.length) await browser.scripting.registerContentScripts(scripts);

  const old = (await browser.declarativeNetRequest.getDynamicRules()).map((r) => r.id);
  const rules = [];
  if (chromeHosts.length) {
    const action = { type: 'modifyHeaders', requestHeaders: await chromeHeaders() };
    rules.push({ id: 1, priority: 1, action, condition: { requestDomains: chromeHosts, resourceTypes: ALL_TYPES } });
    rules.push({ id: 2, priority: 1, action, condition: { initiatorDomains: chromeHosts, resourceTypes: ALL_TYPES } });
  }
  await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old, addRules: rules });
}

// ---------- Tabs: duplicate (Alt+Shift+D), duplicate to a new window, move to a new window, new tab to the right ----------
async function selectedTabs() {
  return browser.tabs.query({ currentWindow: true, highlighted: true });
}

async function duplicateTabs() {
  await settingsReady;
  const tabs = await selectedTabs();
  const last = tabs[tabs.length - 1];
  let index = last.index + 1;
  let firstCopy = null, activeCopy = null;
  for (const tab of tabs) {
    const copy = await browser.tabs.duplicate(tab.id, tab.pinned ? { active: false } : { index, active: false });
    if (tab.pinned) await browser.tabs.update(copy.id, { pinned: true });
    else index++;
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

const PRIVACY_KEYS = ['webrtcProtect', 'webrtcStrict', 'blockPing', 'resistFingerprinting', 'noPrefetch'];
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  settingsReady.then(() => {
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue ?? MSF_DEFAULTS[k];
    const parts = [];
    if (PRIVACY_KEYS.some((k) => k in changes)) parts.push('privacy');
    if ('popupSites' in changes || 'chromeSites' in changes) parts.push('sites');
    if ('cleanLinkMenu' in changes) parts.push('menu');
    if (parts.length) applyAll(parts);
    if ('showFlag' in changes) {
      browser.tabs.query({}).then((tabs) => tabs.forEach((t) => showFlag(t.id, t.url)));
    }
  });
});

browser.runtime.onInstalled.addListener(() => applyAll());
browser.runtime.onStartup.addListener(() => applyAll(['sites', 'menu']));
