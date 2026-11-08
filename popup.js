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

// Per-site settings cover a site and its subdomains (example.com also covers www.example.com).
// matchOf returns the entry that applies to this page; the background and content scripts use the same rule.
const covers = (s) => host === s || host.endsWith('.' + s);
const matchOf = (sites) => sites.find(covers) || null;
const onList = (sites) => !!matchOf(sites);
// Per-site rules only work on normal domain names, not IP addresses or names like "localhost".
const siteOk = () => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) && !/^\d+(\.\d+){3}$/.test(host);

function activityRow(mark, name, detail, ...extra) {
  return h('div', { class: 'check-row' + (mark === '✓' ? ' good' : '') },
    h('span', { class: 'mark', 'aria-hidden': 'true' }, mark),
    h('span', { class: 'name' }, name),
    h('small', {}, detail),
    ...extra);
}

// ---------- This site ----------
function sitePanel() {
  if (!host) {
    return [wide(null, note('Open a website to see what this add-on does there.'))];
  }

  // What this add-on changed on the page, with undo
  const list = h('div', { class: 'checkup' });
  (async () => {
    if (onList(current.pausedSites)) {
      list.append(activityRow('–', 'Nothing changed on this page', 'Paused here.'));
      return;
    }
    const key = `act${tab.id}`;
    const act = (await browser.storage.session.get(key))[key];
    if (act?.page && act.page === tab.url) {
      const open = h('button', {
        type: 'button', class: 'btn secondary small',
        onclick: async () => {
          await browser.runtime.sendMessage({ type: 'openOriginal', tabId: tab.id });
          window.close();
        },
      }, 'Open original link');
      const what = Array.isArray(act.notes) ? act.notes.join('. ') + '.' : 'Tracking was removed from the address.';
      list.append(activityRow('✓', 'Link cleaned', what, h('span'), open));
    }
    if (onList(Object.keys(current.popupSites))) list.append(activityRow('✓', 'Pop-up remover is on', 'Set below.'));
    if (onList(current.chromeSites)) list.append(activityRow('✓', 'Pretending to be Chrome', 'Set below.'));
    if (!list.children.length) {
      list.append(activityRow('–', 'Nothing changed on this page', 'If it looks broken, it isn\'t this add-on. See "Something broken?"'));
    }
  })();
  // The big Pause button: the first thing to press when a site looks broken.
  const paused = onList(current.pausedSites);
  const pause = h('button', {
    type: 'button', class: 'pause' + (paused ? ' paused' : ''), 'aria-pressed': String(paused),
    onclick: async (e) => {
      e.currentTarget.disabled = true;
      const on = !paused;
      const sites = current.pausedSites.filter((s) => !covers(s));
      if (on) sites.push(host);
      current.pausedSites = sites;
      await browser.runtime.sendMessage({ type: 'saveSites', changes: { pausedSites: sites } });
      // If the link to this page was cleaned, reload the original link, not the cleaned one.
      const key = `act${tab.id}`;
      const act = (await browser.storage.session.get(key))[key];
      if (on && act?.page === tab.url) await browser.runtime.sendMessage({ type: 'openOriginal', tabId: tab.id });
      else browser.tabs.reload(tab.id);
      window.close();
    },
  },
  h('span', { class: 'pause-icon', 'aria-hidden': 'true' }, paused ? '▶' : '❚❚'),
  h('span', { class: 'pause-text' },
    h('span', { class: 'pause-title' }, paused ? 'Resume on this site' : 'Pause on this site'),
    h('span', { class: 'pause-sub' }, paused
      ? `Paused on ${matchOf(current.pausedSites)}. This add-on changes nothing here.`
      : 'Site looks broken? Turn this add-on off here. The page reloads as it was.')));
  const activity = wide('On this page', list);

  // Pop-ups
  const status = note('Hides cookie walls, sign-up boxes and dark overlays. Off until you turn it on for a site.');
  const popupEntry = () => matchOf(Object.keys(current.popupSites));
  const level = () => current.popupSites[popupEntry()] || null;
  const setLevel = (lvl) => {
    const sites = { ...current.popupSites };
    const entry = popupEntry() || host;
    if (lvl) sites[entry] = lvl; else delete sites[entry];
    current.popupSites = sites;
    return browser.runtime.sendMessage({ type: 'saveSites', changes: { popupSites: sites } });
  };
  const all = checkRow({
    label: 'Also unstick headers and bars',
    get: () => level() === 'all',
    set: async (on) => {
      if (!level()) return;
      await setLevel(on ? 'all' : 'popups');
      runOnPage((lvl) => window.msfPopups?.start(lvl, true), on ? 'all' : 'popups');
    },
  });
  all.input.disabled = !level();
  const popupSwitch = switchRow({
    label: 'Remove pop-ups here',
    hint: `Every time you open ${popupEntry() || host}`,
    get: () => !!level(),
    set: async (on) => {
      await setLevel(on ? (all.input.checked ? 'all' : 'popups') : null);
      all.input.disabled = !on;
      if (on) cleanNow();
      else showAgain('Off.');
    },
  });
  const runOnPage = (func, ...args) => browser.scripting.executeScript({ target: { tabId: tab.id }, func, args });
  async function cleanNow() {
    try {
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/popups.js'] });
      const [res] = await runOnPage((lvl) => window.msfPopups.start(lvl, true), all.input.checked ? 'all' : 'popups');
      const n = res?.result || 0;
      status.textContent = n ? `Hid ${n} pop-up${n === 1 ? '' : 's'}. "Show them again" puts them back.` : 'Nothing to hide right now. It keeps watching.';
    } catch {
      status.textContent = 'Firefox doesn\'t let add-ons change this page.';
    }
  }
  async function showAgain(prefix = '') {
    try {
      const [res] = await runOnPage(() => window.msfPopups?.stop() ?? 0);
      const n = res?.result || 0;
      status.textContent = `${prefix} ${n ? `Showed ${n} hidden thing${n === 1 ? '' : 's'} again.` : 'Nothing was hidden on this page.'}`.trim();
    } catch {
      status.textContent = `${prefix} Reload the page to bring back anything hidden.`.trim();
    }
  }
  const popupControls = siteOk()
    ? [popupSwitch, h('div', { class: 'checks' }, all)]
    : [note('Only the button works here: per-site settings need a normal web address.')];
  const popups = card('Pop-ups', ...popupControls,
    h('div', { class: 'buttons two' },
      h('button', { type: 'button', class: 'btn secondary', onclick: cleanNow }, 'Clean this page once'),
      h('button', { type: 'button', class: 'btn secondary', onclick: () => showAgain() }, 'Show them again')),
    status);

  // Compatibility
  const chromeStatus = note(siteOk()
    ? 'Only for sites that say Firefox isn\'t supported. The page reloads.'
    : 'Needs a normal web address, not an IP address or a name like "localhost".');
  const chrome = card('Compatibility',
    siteOk() ? switchRow({
      label: 'Pretend to be Chrome',
      hint: `Only on ${matchOf(current.chromeSites) || host}`,
      get: () => onList(current.chromeSites),
      set: async (on) => {
        const sites = current.chromeSites.filter((s) => !covers(s));
        if (on) sites.push(host);
        current.chromeSites = sites;
        chromeStatus.textContent = on ? 'Reloading as Chrome…' : 'Reloading as Firefox…';
        await browser.runtime.sendMessage({ type: 'saveSites', changes: { chromeSites: sites } });
        browser.tabs.reload(tab.id, { bypassCache: true });
      },
    }) : null,
    chromeStatus);

  // What to do when a site breaks
  const broken = wide('Something broken?',
    h('ol', { class: 'steps' },
      h('li', {}, h('b', {}, 'This add-on: '), 'the number on its icon shows what it changed. Use "Open original link" or "Pause on this site" above.'),
      h('li', {}, h('b', {}, 'uBlock Origin: '), 'click its icon, then the big power button to turn it off for this site.'),
      h('li', {}, h('b', {}, 'Firefox: '), 'click the shield left of the address bar and turn off Enhanced Tracking Protection for this site.')),
    note('Try them in that order and reload after each one. Whatever fixes it was the cause.'));

  return [pause, activity, popups, chrome, broken];
}

// ---------- Links ----------
function linksPanel() {
  return [
    wide('Clean links',
      switchRow({ key: 'cleanParams', label: 'Remove tracking from links', hint: 'utm_, fbclid, gclid, Spotify and YouTube si= and about 60 more' }),
      switchRow({ key: 'unwrapRedirects', label: 'Skip redirect links', hint: 'Google, Facebook, Instagram, YouTube, Reddit, Steam, Bing and DuckDuckGo go straight to the site. This also skips their "you are leaving" warning pages' }),
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
      controlNote(p.network.webRTCIPHandlingPolicy),
      switchRow({ key: 'blockPing', label: 'Block click pings', hint: 'Links can\'t quietly report each click to the site' }),
      controlNote(p.websites.hyperlinkAuditingEnabled)),
    card('Fingerprinting',
      switchRow({ key: 'resistFingerprinting', label: 'Strong protection', tag: 'can break sites', hint: 'Sites see UTC time, light mode and a standard window size, so you look like everyone else' }),
      controlNote(p.websites.resistFingerprinting)),
  ];
}

// ---------- Tabs ----------
// Turns a key press into Firefox's shortcut format ("Alt+Shift+D"), or null while only modifiers are held.
const KEY_NAMES = {
  ',': 'Comma', '.': 'Period', ' ': 'Space', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  Insert: 'Insert', Delete: 'Delete', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
};
function shortcutFrom(e) {
  let key = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(e.key)) key = e.key;
  else key = KEY_NAMES[e.key] || null;
  if (!key) return null;
  const mac = /Mac/.test(navigator.platform);
  const mods = [];
  if (e.ctrlKey) mods.push(mac ? 'MacCtrl' : 'Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.metaKey && mac) mods.push('Command');
  if (e.shiftKey) mods.push('Shift');
  return [...mods, key].join('+');
}

function tabsPanel() {
  const status = note('Click the box, then press the keys you want.');
  const box = h('button', { type: 'button', class: 'keybox', 'aria-label': 'Duplicate tab shortcut. Click, then press new keys.' }, '…');
  let recording = false;
  const show = async () => {
    const cmd = (await browser.commands.getAll()).find((c) => c.name === 'duplicate-tab');
    box.textContent = cmd?.shortcut || 'None';
  };
  const stopRecording = () => { recording = false; box.classList.remove('recording'); };
  box.addEventListener('click', () => {
    recording = true;
    box.classList.add('recording');
    box.textContent = 'Press keys…';
    status.classList.remove('warn');
    status.textContent = 'Use Ctrl or Alt with a letter or number, e.g. Alt+Shift+D. Esc cancels.';
  });
  box.addEventListener('blur', () => { if (recording) { stopRecording(); show(); } });
  box.addEventListener('keydown', async (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { stopRecording(); show(); status.textContent = 'Not changed.'; return; }
    const combo = shortcutFrom(e);
    if (!combo) return;  // still holding modifiers
    stopRecording();
    try {
      await browser.commands.update({ name: 'duplicate-tab', shortcut: combo });
      status.textContent = `Saved. ${combo} now duplicates the tab.`;
    } catch {
      status.classList.add('warn');
      status.textContent = `${combo} can't be used. Include Ctrl or Alt, plus a letter, number or F-key.`;
    }
    show();
  });
  const reset = h('button', {
    type: 'button', class: 'btn secondary small',
    onclick: async () => {
      await browser.commands.reset('duplicate-tab');
      status.classList.remove('warn');
      status.textContent = 'Back to Alt+Shift+D.';
      show();
    },
  }, 'Reset to Alt+Shift+D');
  show();
  return [
    wide('Duplicate tab',
      h('div', { class: 'keyrow' }, h('span', { class: 'name' }, 'Shortcut'), box, reset),
      status,
      switchRow({ key: 'dupBackground', label: 'Stay on this tab', hint: 'The copy opens next to it in the background. Select several tabs with Ctrl+click to copy them all.' })),
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
      // Firefox already upgrades sites to HTTPS when it can (HTTPS-First, on by default), so HTTPS-Only is optional.
      name: 'Secure connections', setting: p.network.httpsOnlyMode,
      good: () => true,
      ok: (v) => (v === 'always'
        ? 'HTTPS-Only is on: Firefox warns before any site that isn\'t secure'
        : 'Firefox switches sites to a secure connection when it can. Optional, stricter: HTTPS-Only in Settings › Privacy & Security'),
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
      small.textContent = good ? (typeof r.ok === 'function' ? r.ok(value) : r.ok) : `Turn on: ${r.fix}`;
    }).catch(() => row.remove());
  }
  return [
    wide('Firefox\'s own settings', list),
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
