# Developer notes: More Settings for Firefox

Things learned while building this that aren't obvious from the code. For what the add-on does, see README.md.
For the plain-English explanation for Tim, see EXPLAINED.md. Tests and speed benchmarks: `tools/README.md`.

## Why it exists and what it's for

- Tim installed ~19 popular privacy add-ons only so they could be studied, then removed them. This add-on keeps
  only what **Firefox (Enhanced Tracking Protection set to Strict) and uBlock Origin don't already do**.
- Tim's main worry: **a site breaks and he can't tell which add-on did it.** So every change must be visible (the
  number on the toolbar icon), undoable ("Open original link", "Bring them back") and switchable off per site
  (the big site On/Off switch) or everywhere (the "On everywhere" pill).
- Maintained for Tim's own use. The public AMO release is a give-away, not a product to support.

## Decisions and why

| Kept / dropped | Why |
|---|---|
| Link cleaning (params, redirects, AMP), with the icon number + undo | Firefox only strips a few params and never `utm_`. Undo exists because a cleaned link is the one feature on by default that could break a site |
| Pop-up remover: **per site, off by default** | It guesses, so it can hide real content. Tim isn't bothered by cookie banners |
| Pretend to be Chrome: per site | Rarely needed, but nothing else fixes "Firefox not supported" |
| Hide local IP (WebRTC) + block click pings: on | Fixes real leaks, no visible downside |
| Strong fingerprinting (resistFingerprinting): off | Wrong time zone, no dark mode on sites, breakage. ETP Strict already has the lighter version |
| Duplicate tab: Alt+Shift+D, **only a shortcut recorder** in the popup, stays on the current tab | Tim's choice: no buttons, no other tab commands |
| Dropped: server country flag | Rarely useful (CDNs show the nearest copy), 5 MB database, extra permissions |
| Dropped: forget this site | Firefox has it: padlock › Clear cookies and site data |
| Dropped: don't pre-load links | Makes pages slower; Tim prefers speed |
| Dropped: strict WebRTC (VPN/proxy only) | Breaks video calls without a VPN |
| Dropped: local-network guard (Port Authority) | Firefox 153+ asks before sites reach the local network |
| Dropped: tracker lists, malware lists, NoScript, CanvasBlocker, Decentraleyes, UA switcher, FoxyProxy | Covered by uBlock / ETP Strict, or not privacy features. See README "What was left out" |
| Not added: Outlook/Teams safe-link skipping | Tim wants to keep Microsoft's phishing check |
| Not added: click-to-load videos | Tim wants to keep thumbnails |
| Google Docs dark mode (DocsAfterDark) | Belongs in the separate "More Settings for Google Apps" add-on |

Check-up tab: HTTPS-Only "never" is **not** a problem. Firefox has upgraded sites to HTTPS by default
(HTTPS-First) for a while, so that row always shows a tick and calls HTTPS-Only an optional stricter extra.

## Firefox facts checked (late 2026, Firefox 159)

Checked against the real code of popular add-ons or with web-checked lookups. Crouton (the free second-opinion
model) claimed several of these were impossible; it was wrong.

- `webRequest` blocking listeners still work in **MV3 on Firefox** (unlike Chrome). They need an event page
  (`background.scripts`), and listeners must be added at the top level.
- `details.ip` is available in `webRequest` events (Flagfox uses it). It can be missing for cached pages.
- `browser.privacy` **can set**: `network.webRTCIPHandlingPolicy`, `network.networkPredictionEnabled`,
  `websites.hyperlinkAuditingEnabled`, `websites.resistFingerprinting`. It **can only read**: `network.httpsOnlyMode`,
  `network.globalPrivacyControl`, `websites.trackingProtectionMode`, `websites.cookieConfig`.
- `page_action` works in MV3 on Firefox. The `dns` API exists (unused now).
- `scripting.registerContentScripts` supports `world: 'MAIN'`, `persistAcrossSessions`, `excludeMatches` and
  `matchOriginAsFallback` (Firefox 128+).
- DNR `modifyHeaders` can set `User-Agent`. `requestDomains` / `initiatorDomains` also match subdomains, so
  content-script patterns must be `*://host/*` **and** `*://*.host/*` to line up. Use `excludedRequestDomains` /
  `excludedInitiatorDomains` for paused sites.
- `declarativeNetRequestWithHostAccess` passes AMO lint and avoids the extra "block content" warning.
- When `webRequest` changes the User-Agent header, `navigator.userAgent` in the page follows. But
  `navigator.vendor`, `userAgentData` and `window.chrome` need a MAIN-world script.
- A MAIN-world content script **can't use `browser.*`** (no storage), so anything it needs (the Chrome version)
  is computed inside it. Keep that formula in sync with `chromeVersion()` in background.js.
- **Content scripts don't run in Firefox's JSON viewer.** Test JS-side spoofing on an HTML page, not a JSON URL.
- Firefox 153+ prompts before public sites reach localhost or the LAN (Local Network Access).
- Real Chrome has **no `chrome.runtime`** on a normal page. A fake one makes sites think an extension is installed.

## Gotchas found in review (all fixed; don't reintroduce)

- **Don't rebuild the query string** with `URLSearchParams` when removing params. It changes `%20` to `+` and `~`
  to `%7E`, which breaks signed links and payment returns. Remove matching `key=value` parts from the raw text.
- Google `/url`: the address can be in `url=` or `q=` (`q=` can be search text). Take whichever is a real http(s) URL.
- AMP: only `www.google.<tld>/amp/...` and `*.cdn.ampproject.org`, the first part must look like a domain, and
  always open over https.
- Per-site lists cover subdomains everywhere: the popup, background, content scripts and badge all use the same
  "host or parent domain" rule. Pausing a subdomain must beat a setting turned on for its parent.
- Pause, or Open original link, must reload the **original** link, not the cleaned one.
- Loop guard: if a site keeps adding a stripped param back, stop cleaning that tab for 15 s after 4 rounds.
- State that must survive the event page sleeping (the undo bypass) goes in `storage.session`, not memory.
- Only re-register scripts and rules when they actually changed, so a page loading at that moment never sees a gap.
- `elementsFromPoint` skips `pointer-events: none` elements. Fine for pop-ups (they take clicks), but keep in mind.

## Speed (measured 2026-11-10 with `tools/bench2.py`)

Medians from two headless Firefox instances taking turns on local pages:

| Case | Extra time |
|---|---|
| Normal page load | +1 to 4 ms |
| Link with tracking (cleaned and redirected) | +4 to 5 ms |
| First load after the add-on was idle | +3 to 20 ms (Firefox starting the event page) |
| Pop-up remover, one scan of a 24,000-element page | 2 to 6 ms |
| Animated page | no dropped frames |

What made the difference:
- Pop-up remover **samples a grid of points on screen** (`elementsFromPoint`, 9 columns, 9 rows plus 3 rows hugging
  the top and bottom edges for thin bars) instead of walking every element. ~250 ms -> ~3 ms. "Unstick headers" mode
  re-scans on scroll (throttled 400 ms) to catch sticky bars further down.
- Mutation re-checks: new elements are checked with their children (max 400), attribute changes only check
  that element, and `<html>`/`<body>` changes (often our own) are ignored.
- Per-site script and rule check runs **once per browser session** (flag in `storage.session`, 1.5 s after start),
  not on every event-page wake. Re-checking on every wake cost ~25 ms on the first page load after idle.
- Link cleaner: synchronous checks first. Storage is only touched when a URL actually changes.

Measuring tips: run both browsers at the same time and alternate loads, otherwise warm-up makes whichever runs
second look faster. Map a fake host with `network.dns.localDomains` (e.g. `bench.test`), because per-site features
reject `localhost` and IPs. Shorten `extensions.background.idle.timeout` to test wake-up cost quickly.

## Release status

- Local repo, public GitHub `TimWJT/more-settings-for-firefox`. Listed on AMO (see README for the link). Store text in STORE-LISTING.md.
- Before uploading: `npx web-ext lint`, run `tools/test_msf.py`, bump the manifest version.
