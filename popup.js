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

const onList = (sites) => sites.some((s) => host === s || host.endsWith('.' + s));

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
      list.append(activityRow('II', 'Paused on this site', 'This add-on changes nothing here.'));
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
      list.append(activityRow('✓', 'Link cleaned', act.notes.join('. ') + '.', h('span'), open));
    }
    if (onList(Object.keys(current.popupSites))) list.append(activityRow('✓', 'Pop-up remover is on', 'Set below.'));
    if (onList(current.chromeSites)) list.append(activityRow('✓', 'Pretending to be Chrome', 'Set below.'));
    if (!list.children.length) {
      list.append(activityRow('–', 'Nothing changed on this page', 'If it looks broken, it isn\'t this add-on. See "Something broken?"'));
    }
  })();
  const pause = switchRow({
    label: 'Pause on this site',
    hint: 'Turns this add-on off here. The page reloads.',
    get: () => onList(current.pausedSites),
    set: async (on) => {
      const sites = current.pausedSites.filter((s) => !(host === s || host.endsWith('.' + s)));
      if (on) sites.push(host);
      current.pausedSites = sites;
      await browser.runtime.sendMessage({ type: 'saveSites', changes: { pausedSites: sites } });
      browser.tabs.reload(tab.id);
      window.close();
    },
  });
  const activity = wide('On this page', list, pause);

  // Pop-ups
  const status = note('Hides cookie walls, sign-up boxes and dark overlays. Off until you turn it on for a site.');
  const level = () => current.popupSites[host];
  const setLevel = (lvl) => {
    const sites = { ...current.popupSites };
    if (lvl) sites[host] = lvl; else delete sites[host];
    current.popupSites = sites;
    return browser.runtime.sendMessage({ type: 'saveSites', changes: { popupSites: sites } });
  };
  const all = checkRow({
    label: 'Also unstick headers and bars',
    get: () => level() === 'all',
    set: (on) => level() && setLevel(on ? 'all' : 'popups'),
  });
  const popupSwitch = switchRow({
    label: 'Remove pop-ups here',
    hint: `Every time you open ${host}`,
    get: () => !!level(),
    set: (on) => {
      setLevel(on ? (all.input.checked ? 'all' : 'popups') : null);
      if (on) {
        cleanNow();
      } else {
        browser.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.msfPopups?.stop() }).catch(() => {});
        status.textContent = 'Off. Reload the page to bring back anything hidden.';
      }
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
      status.textContent = n ? `Removed ${n} pop-up${n === 1 ? '' : 's'}. Reload to bring them back.` : 'Nothing to remove right now. It keeps watching.';
    } catch {
      status.textContent = 'Firefox doesn\'t let add-ons change this page.';
    }
  }
  const popups = card('Pop-ups', popupSwitch, h('div', { class: 'checks' }, all),
    h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'btn secondary', onclick: cleanNow }, 'Clean this page once')),
    status);

  // Compatibility
  const chromeStatus = note('Only for sites that say Firefox isn\'t supported. The page reloads.');
  const chrome = card('Compatibility',
    switchRow({
      label: 'Pretend to be Chrome',
      hint: `Only on ${host}`,
      get: () => current.chromeSites.includes(host),
      set: async (on) => {
        const sites = current.chromeSites.filter((s) => s !== host);
        if (on) sites.push(host);
        current.chromeSites = sites;
        chromeStatus.textContent = on ? 'Reloading as Chrome…' : 'Reloading as Firefox…';
        await browser.runtime.sendMessage({ type: 'saveSites', changes: { chromeSites: sites } });
        browser.tabs.reload(tab.id, { bypassCache: true });
      },
    }),
    chromeStatus);

  // What to do when a site breaks
  const broken = wide('Something broken?',
    h('ol', { class: 'steps' },
      h('li', {}, h('b', {}, 'This add-on: '), 'the number on its icon shows what it changed. Use "Open original link" or "Pause on this site" above.'),
      h('li', {}, h('b', {}, 'uBlock Origin: '), 'click its icon, then the big power button to turn it off for this site.'),
      h('li', {}, h('b', {}, 'Firefox: '), 'click the shield left of the address bar and turn off Enhanced Tracking Protection for this site.')),
    note('Try them in that order and reload after each one. Whatever fixes it was the cause.'));

  return [activity, popups, chrome, broken];
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
