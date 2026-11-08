'use strict';

const $ = (id) => document.getElementById(id);
const save = (obj) => browser.storage.local.set(obj);
let current = { ...MSF_DEFAULTS };
let tab = null;    // active tab
let host = null;   // its hostname, when it's a normal website

function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  n.append(...kids.filter((k) => k != null));
  return n;
}

// A switch row. get/set default to a stored setting with that key.
function switchRow({ key, label, hint, get, set, tag }) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.checked = get ? get() : !!current[key];
  input.addEventListener('change', () => (set ? set(input.checked) : save({ [key]: input.checked })));
  const row = h('label', { class: 'row' },
    h('span', { class: 'switch' }, input, h('span', { 'aria-hidden': 'true' })),
    h('span', { class: 'label' },
      h('span', { class: 'name' }, label, tag ? h('span', { class: 'tag' }, tag) : null),
      hint ? h('small', {}, hint) : null));
  row.input = input;
  return row;
}

function checkRow({ key, label, get, set }) {
  const input = h('input', { type: 'checkbox' });
  input.checked = get ? get() : !!current[key];
  input.addEventListener('change', () => (set ? set(input.checked) : save({ [key]: input.checked })));
  const row = h('label', { class: 'check' }, input, h('span', { class: 'box', 'aria-hidden': 'true' }), h('span', {}, label));
  row.input = input;
  return row;
}

const card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h2', {}, title) : null, ...kids);
const wide = (title, ...kids) => h('section', { class: 'card wide' }, title ? h('h2', {}, title) : null, ...kids);
const note = (text, warn) => h('p', { class: 'note' + (warn ? ' warn' : ''), role: 'status', 'aria-live': 'polite' }, text);

function countryName(cc) {
  if (cc === 'LOCAL') return 'Your local network';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc; } catch { return cc; }
}
const flagEmoji = (cc) => (cc === 'LOCAL' ? '🏠' : String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))));

// ---------- This site ----------
function sitePanel() {
  if (!host) {
    return [wide(null, h('p', { class: 'note' }, 'Open a website to see where it\'s hosted and change settings for it.'))];
  }

  // Where the server is
  const flag = h('span', { class: 'flag', 'aria-hidden': 'true' }, '🌐');
  const country = h('span', { class: 'country' }, 'Looking up…');
  const where = h('span', { class: 'where' }, host);
  browser.storage.session.get(`tab${tab.id}`).then((all) => {
    const info = all[`tab${tab.id}`];
    if (info?.host === host && info.cc) {
      flag.textContent = flagEmoji(info.cc);
      country.textContent = countryName(info.cc);
      where.textContent = `${host} · ${info.ip}`;
    } else {
      country.textContent = 'Unknown location';
      if (info?.ip) where.textContent = `${host} · ${info.ip}`;
    }
  });
  const server = wide('Server',
    h('div', { class: 'site' }, flag, country, where),
    switchRow({ key: 'showFlag', label: 'Flag in the address bar', hint: 'Shows the country of the server or the CDN it uses' }));

  // Pop-ups
  const status = note('Hides cookie walls, sign-up boxes and dark overlays.');
  const level = () => current.popupSites[host];
  const setLevel = (lvl) => {
    const sites = { ...current.popupSites };
    if (lvl) sites[host] = lvl; else delete sites[host];
    current.popupSites = sites;
    save({ popupSites: sites });
  };
  const all = checkRow({
    label: 'Also unstick headers and bars',
    get: () => level() === 'all',
    set: (on) => level() && setLevel(on ? 'all' : 'popups'),
  });
  const onSite = switchRow({
    label: 'Remove pop-ups here',
    hint: `Every time you open ${host}`,
    get: () => !!level(),
    set: (on) => {
      setLevel(on ? (all.input.checked ? 'all' : 'popups') : null);
      if (on) cleanNow();
      else status.textContent = 'Off. Reload the page to bring back anything hidden.';
    },
  });
  async function cleanNow() {
    try {
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/popups.js'] });
      const [res] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        args: [all.input.checked ? 'all' : 'popups'],
        func: (lvl) => window.msfPopups.start(lvl, true),
      });
      const n = res?.result || 0;
      status.textContent = n ? `Removed ${n} pop-up${n === 1 ? '' : 's'} on this page.` : 'Nothing to remove right now. It keeps watching.';
    } catch {
      status.textContent = 'Firefox doesn\'t let add-ons change this page.';
    }
  }
  const popups = card('Pop-ups', onSite, h('div', { class: 'checks' }, all),
    h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'btn secondary', onclick: cleanNow }, 'Clean this page once')),
    status);

  // Compatibility
  const chromeStatus = note('For sites that say Firefox isn\'t supported. The page reloads.');
  const chrome = card('Compatibility',
    switchRow({
      label: 'Pretend to be Chrome',
      hint: `Only on ${host}`,
      get: () => current.chromeSites.includes(host),
      set: async (on) => {
        const sites = current.chromeSites.filter((s) => s !== host);
        if (on) sites.push(host);
        current.chromeSites = sites;
        await save({ chromeSites: sites });
        chromeStatus.textContent = on ? 'Reloading as Chrome…' : 'Reloading as Firefox…';
        setTimeout(() => browser.tabs.reload(tab.id, { bypassCache: true }), 400);
      },
    }),
    chromeStatus);

  // Forget
  const forgetStatus = note('Deletes its cookies and saved data, then reloads. You\'ll be signed out of it.');
  const forget = card('Forget this site',
    h('div', { class: 'buttons' }, h('button', {
      type: 'button', class: 'btn primary',
      onclick: async (e) => {
        e.target.disabled = true;
        try {
          const parts = host.split('.');
          const base = parts.length > 2 && !/^(co|com|net|org|gov|edu|ac)$/.test(parts.at(-2)) ? parts.slice(-2).join('.') : parts.slice(-3).join('.');
          await browser.browsingData.remove({ hostnames: [...new Set([host, base])] },
            { cookies: true, localStorage: true, indexedDB: true, serviceWorkers: true });
          forgetStatus.textContent = `Forgot ${base}.`;
          browser.tabs.reload(tab.id);
        } catch (err) {
          forgetStatus.textContent = `Couldn't forget it: ${err.message}`;
          forgetStatus.classList.add('warn');
        } finally {
          e.target.disabled = false;
        }
      },
    }, 'Forget this site')),
    forgetStatus);

  return [server, popups, chrome, forget];
}

// ---------- Links ----------
function linksPanel() {
  return [
    wide('Clean links',
      switchRow({ key: 'cleanParams', label: 'Remove tracking from links', hint: 'utm_, fbclid, gclid, Spotify and YouTube si= and about 60 more' }),
      switchRow({ key: 'unwrapRedirects', label: 'Skip redirect links', hint: 'Google, Facebook, Instagram, YouTube, Reddit, Steam, Bing and DuckDuckGo go straight to the site' }),
      switchRow({ key: 'unwrapAmp', label: 'Real pages instead of AMP', hint: 'Google AMP links open the original page' }),
      switchRow({ key: 'cleanLinkMenu', label: 'Copy clean link', hint: 'Right-click any link to copy it without tracking' })),
  ];
}

// ---------- Privacy ----------
function controlNote(setting) {
  const n = note('');
  setting.get({}).then(({ levelOfControl }) => {
    if (levelOfControl === 'controlled_by_other_extensions') n.textContent = 'Another add-on controls this right now.';
    else if (levelOfControl === 'not_controllable') n.textContent = 'Locked by Firefox or your organisation.';
    if (n.textContent) n.classList.add('warn');
  }).catch(() => {});
  return n;
}

function privacyPanel() {
  const p = browser.privacy;
  return [
    card('Leaks',
      switchRow({ key: 'webrtcProtect', label: 'Hide your local IP', hint: 'Video-call tech (WebRTC) can\'t show sites your home network address' }),
      h('div', { class: 'checks' }, checkRow({ key: 'webrtcStrict', label: 'Strict: only through a VPN or proxy' })),
      controlNote(p.network.webRTCIPHandlingPolicy),
      switchRow({ key: 'blockPing', label: 'Block click pings', hint: 'Links can\'t quietly report each click to the site' }),
      controlNote(p.websites.hyperlinkAuditingEnabled)),
    card('Fingerprinting',
      switchRow({ key: 'resistFingerprinting', label: 'Strong protection', tag: 'can break sites', hint: 'Sites see UTC time, light mode and a standard window size, so you look like everyone else' }),
      controlNote(p.websites.resistFingerprinting)),
    card('Speed or privacy',
      switchRow({ key: 'noPrefetch', label: 'Don\'t pre-load links', hint: 'Firefox stops connecting early to links you might click. A bit more private, pages open a bit slower' }),
      controlNote(p.network.networkPredictionEnabled)),
  ];
}

// ---------- Tabs ----------
function tabsPanel() {
  const status = note('');
  const button = (label, command, primary) => h('button', {
    type: 'button', class: 'btn ' + (primary ? 'primary' : 'secondary'),
    onclick: async () => {
      try {
        await browser.runtime.sendMessage({ type: 'tabCommand', command });
        window.close();
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('warn');
      }
    },
  }, label);
  const keys = h('div', { class: 'check-row' });
  browser.commands.getAll().then((cmds) => {
    keys.replaceWith(h('div', { class: 'checkup' }, ...cmds.map((c) => h('div', { class: 'check-row' },
      h('span', { class: 'mark', 'aria-hidden': 'true' }, '⌨'),
      h('span', { class: 'name' }, c.description),
      h('small', {}, c.shortcut || 'No shortcut set')))));
  });
  return [
    card('Duplicate',
      h('div', { class: 'buttons' },
        button('Duplicate tab', 'duplicate-tab', true),
        button('Duplicate to new window', 'duplicate-to-new-window'),
        button('Move to new window', 'move-to-new-window')),
      status,
      switchRow({ key: 'dupBackground', label: 'Stay on this tab', hint: 'Copies open in the background' })),
    card('Shortcuts', keys,
      h('p', { class: 'note' }, 'Change them in about:addons › ⚙ › Manage Extension Shortcuts. Select several tabs with Ctrl+click to copy them all at once.')),
  ];
}

// ---------- Check-up ----------
function checkupPanel() {
  const list = h('div', { class: 'checkup' });
  const p = browser.privacy;
  const rows = [
    {
      name: 'Tracking protection', setting: p.websites.trackingProtectionMode,
      good: (v) => v === 'always', ok: 'Blocks trackers in every window',
      fix: 'Settings › Privacy & Security › Enhanced Tracking Protection › Strict',
    },
    {
      name: 'Cookie protection', setting: p.websites.cookieConfig,
      good: (v) => v?.behavior === 'reject_trackers_and_partition_foreign', ok: 'Each site gets its own cookie jar',
      fix: 'Set tracking protection to Strict',
    },
    {
      name: 'HTTPS-Only', setting: p.network.httpsOnlyMode,
      good: (v) => v === 'always', ok: 'Every site uses a secure connection',
      fix: 'Settings › Privacy & Security › HTTPS-Only Mode › Enable in all windows',
    },
    {
      name: 'Do not sell or share', setting: p.network.globalPrivacyControl,
      good: (v) => v === true, ok: 'Sites are told not to sell your data',
      fix: 'Settings › Privacy & Security › Website Privacy Preferences › tick "Tell websites not to sell or share my data"',
    },
  ];
  for (const r of rows) {
    if (!r.setting) continue;
    const mark = h('span', { class: 'mark', 'aria-hidden': 'true' }, '…');
    const small = h('small', {}, '');
    const row = h('div', { class: 'check-row' }, mark, h('span', { class: 'name' }, r.name), small);
    list.append(row);
    r.setting.get({}).then(({ value }) => {
      const good = r.good(value);
      row.classList.add(good ? 'good' : 'bad');
      mark.textContent = good ? '✓' : '!';
      small.textContent = good ? r.ok : `Turn on: ${r.fix}`;
    }).catch(() => row.remove());
  }
  return [
    wide('Firefox\'s own settings', list),
    wide('Works with uBlock Origin',
      h('p', { class: 'note' }, 'Keep uBlock Origin for blocking ads and trackers. This add-on only does what Firefox and uBlock don\'t.')),
  ];
}

// ---------- tabs ----------
const TABS = [
  { id: 'site', label: 'This site', build: sitePanel },
  { id: 'links', label: 'Links', build: linksPanel },
  { id: 'privacy', label: 'Privacy', build: privacyPanel },
  { id: 'tabs', label: 'Tabs', build: tabsPanel },
  { id: 'checkup', label: 'Check-up', build: checkupPanel },
];

function selectTab(id, focus = false) {
  for (const t of document.querySelectorAll('.tab')) {
    const on = t.dataset.id === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  }
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.dataset.id !== id;
  try { localStorage.setItem('msf-tab', id); } catch { /* ignore */ }
}

function render() {
  const tabs = $('tabs');
  const panels = $('panels');
  for (const t of TABS) {
    tabs.append(h('button', {
      type: 'button', class: 'tab', role: 'tab', id: 'tab-' + t.id, 'data-id': t.id,
      'aria-controls': 'panel-' + t.id, onclick: () => selectTab(t.id),
    }, t.label));
    panels.append(h('div', {
      class: 'panel', role: 'tabpanel', id: 'panel-' + t.id, 'data-id': t.id, 'aria-labelledby': 'tab-' + t.id,
    }, ...t.build()));
  }
  tabs.addEventListener('keydown', (e) => {
    const ids = TABS.map((t) => t.id);
    const i = ids.indexOf(document.activeElement?.dataset?.id);
    if (i < 0) return;
    if (e.key === 'ArrowRight') selectTab(ids[(i + 1) % ids.length], true);
    else if (e.key === 'ArrowLeft') selectTab(ids[(i - 1 + ids.length) % ids.length], true);
    else return;
    e.preventDefault();
  });
  let start = null;
  try { start = localStorage.getItem('msf-tab'); } catch { /* ignore */ }
  selectTab(TABS.some((t) => t.id === start) ? start : TABS[0].id);
}

async function checkAccess() {
  const all = { origins: ['<all_urls>'] };
  if (await browser.permissions.contains(all)) return;
  $('access').hidden = false;
  $('grant').addEventListener('click', async () => {
    if (await browser.permissions.request(all)) $('access').hidden = true;
  });
}

(async () => {
  [current, [tab]] = await Promise.all([
    browser.storage.local.get(MSF_DEFAULTS),
    browser.tabs.query({ active: true, currentWindow: true }),
  ]);
  try {
    const u = new URL(tab.url);
    if (u.protocol === 'http:' || u.protocol === 'https:') host = u.hostname;
  } catch { /* about: pages */ }
  render();
  checkAccess();
})();
