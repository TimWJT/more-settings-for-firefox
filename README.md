# More Settings for Firefox

(The popup is titled "Firefox Settings".)

A Firefox add-on with the privacy and tab extras that Firefox and uBlock Origin don't already do. It replaces a stack of popular add-ons (Chrome Mask, Don't Track Me Google, ClearURLs, PopUpOFF, Duplicate Tab Shortcut and the useful settings from Privacy Badger and DuckDuckGo) with one small add-on. Everything it does is visible: the number on its icon counts what it changed on the page, and each change can be undone. Firefox 128+.

Keep **uBlock Origin** for ads and trackers, and set Firefox's **Enhanced Tracking Protection to Strict**.

## Features

| Feature | Default |
|---|---|
| **Remove tracking from links**: utm_*, fbclid, gclid, msclkid, Mailchimp, HubSpot, Spotify/YouTube `si=` and about 60 more, as each page opens | on |
| **Skip redirect links**: Google, Facebook, Instagram, Threads, YouTube, Reddit, Steam, Tumblr, Bing, DuckDuckGo, LinkedIn and Slack go straight to the site | on |
| **Real pages instead of AMP** (Google AMP and ampproject.org links) | on |
| **Copy clean link** in the right-click menu, with a short note on the page saying what it removed | on |
| **See what changed**: the toolbar icon shows a number when the add-on changed something on the page (hover for the list). The popup shows what was removed, with **Open original link** to load it as it was | on |
| **Pause on this site**: the big On/Off switch at the top of the popup, turns link cleaning, pop-up removal and Chrome mode off for one site (the Privacy tab settings apply to every site; turn those off there). Open pages change straight away; a Reload page button only appears when something can't change without one (Chrome mode, a cleaned link) | – |
| **On everywhere** button right of the title: one click turns the whole add-on off on every site (link cleaning, pop-ups, Chrome mode, privacy settings, right-click menu, shortcut). Firefox gets its own settings back | on |
| **Remove pop-ups** per site: cookie walls, sign-up boxes, dark overlays, scroll lock. Optional: also hide bars that follow you as you scroll. "Hide pop-ups now" and "Bring them back" buttons | off (per site) |
| **Pretend to be Chrome** per site, for sites that say Firefox isn't supported (headers and JavaScript both) | off (per site) |
| **Hide your local IP** from WebRTC | on |
| **Block click pings** (`<a ping>`) | on |
| **Strong fingerprint protection** (Firefox's resistFingerprinting) | off |
| **Duplicate tab** with **Alt+Shift+D** (change the keys in the popup; stays on the current tab; works on several selected tabs) | on |
| **Check-up** of Firefox's own settings: tracking protection, cookie protection, secure connections, "do not sell or share" | – |

Performance: the only code that runs per request is a check on each page you open (not on images, scripts or other files). The Chrome headers are changed by a Firefox rule, not by code. Pop-up removal and the Chrome mask only load on sites you switch them on for.

## What was left out, and why

| From | Left out | Because |
|---|---|---|
| Disconnect, Privacy Badger, DuckDuckGo, Malwarebytes | Tracker and malware blocklists | uBlock Origin, Enhanced Tracking Protection (Strict) and Safe Browsing already do it. Malwarebytes' list is closed source |
| Port Authority | Blocking sites from scanning your network | Firefox 153+ asks before a site can reach your local network |
| Privacy Badger | Social button click-to-load | ETP Strict's SmartBlock embeds |
| DuckDuckGo | HTTPS upgrade, Global Privacy Control | Firefox settings (see Check-up) |
| NoScript | Blocking JavaScript per site | uBlock Origin's `</>` switch in its popup |
| CanvasBlocker | Canvas noise | ETP Strict fingerprinting protection, or the Strong protection switch here |
| Decentraleyes | Local copies of CDN libraries | Firefox keeps each site's cache separate, so CDNs can't follow you across sites that way any more |
| User-Agent Switcher | Picking any browser | Pretend to be Chrome covers the case that matters |
| Flagfox | Server country flag | Rarely useful: big sites use servers everywhere, so it mostly shows the nearest copy |
| DuckDuckGo | Forget this site | Firefox has it: padlock in the address bar › Clear cookies and site data |
| FoxyProxy | Proxy switching | Not a privacy feature on its own |

All code is written from scratch.

## Try it

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** and pick `manifest.json` in this folder

Build: `npx web-ext build` (or lint: `npx web-ext lint`).
