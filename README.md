# More Settings for Firefox

(The popup is titled "Firefox Settings".)

A Firefox add-on with the privacy and tab extras that Firefox and uBlock Origin don't already do. It replaces a stack of popular add-ons (Chrome Mask, Don't Track Me Google, ClearURLs, Flagfox, PopUpOFF, Duplicate Tab Shortcut and the useful settings from Privacy Badger and DuckDuckGo) with one small add-on. Firefox 128+.

Keep **uBlock Origin** for ads and trackers, and set Firefox's **Enhanced Tracking Protection to Strict**.

## Features

| Feature | Default |
|---|---|
| **Remove tracking from links**: utm_*, fbclid, gclid, msclkid, Mailchimp, HubSpot, Spotify/YouTube `si=` and about 60 more, as each page opens | on |
| **Skip redirect links**: Google, Facebook, Instagram, Threads, YouTube, Reddit, Steam, Tumblr, Bing and DuckDuckGo go straight to the site | on |
| **Real pages instead of AMP** (Google AMP and ampproject.org links) | on |
| **Copy clean link** in the right-click menu | on |
| **Server country flag** in the address bar, from a built-in database (nothing is looked up online) | on |
| **Remove pop-ups** per site: cookie walls, sign-up boxes, dark overlays, scroll lock. Optional: also unstick headers and bars. "Clean this page once" button | off (per site) |
| **Pretend to be Chrome** per site, for sites that say Firefox isn't supported (headers and JavaScript both) | off (per site) |
| **Forget this site**: deletes its cookies, local storage, IndexedDB and service workers, then reloads | button |
| **Hide your local IP** from WebRTC (optional strict mode: only through a VPN/proxy) | on |
| **Block click pings** (`<a ping>`) | on |
| **Strong fingerprint protection** (Firefox's resistFingerprinting) | off |
| **Don't pre-load links** (privacy over speed) | off |
| **Duplicate tab** with **Alt+Shift+D** (works on several selected tabs, keeps pinned tabs pinned), duplicate to a new window, move to a new window, new tab to the right | on |
| **Check-up** of Firefox's own settings: tracking protection, cookie protection, HTTPS-Only, "do not sell or share" | – |

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
| FoxyProxy | Proxy switching | Not a privacy feature on its own |

All code is written from scratch. The country database is [ip-location-db geo-whois-asn-country](https://github.com/sapics/ip-location-db) (CC0), rebuilt with `python tools/build-ipdb.py <ipv4.csv> <ipv6.csv> data`.

## Try it

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** and pick `manifest.json` in this folder

Build: `npx web-ext build` (or lint: `npx web-ext lint`).
