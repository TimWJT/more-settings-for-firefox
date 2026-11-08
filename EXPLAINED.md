# How it all works, in plain English

## 1. How websites track you

There are five main tricks. Every privacy extension fights one or more of them.

| Trick | How it works | Example |
|---|---|---|
| **Third-party trackers** | A news site loads a small script from Google, Facebook or an ad company. That company's script runs on thousands of sites, so it sees you on all of them. | You read about shoes on one site, and shoe ads follow you everywhere |
| **Cookies** | Small files a site saves in your browser to recognise you next time. A tracker's cookie, seen on many sites, links your visits together. | The tracker's cookie says "this is user #8812" on every site |
| **Fingerprinting** | No cookie needed. The site measures your screen size, fonts, graphics card, time zone and so on. The combination is often unique, like a fingerprint. | Works even in private windows or after clearing cookies |
| **Link tracking** | Extra bits added to links (`?utm_source=newsletter&fbclid=...`) or links that go through a middleman first (`google.com/url?q=...`). | Google logs which result you clicked before sending you on |
| **Your IP address** | Every site sees the internet address you connect from. It shows your rough location and your home network. | Only a VPN hides this |

## 2. Why those extensions were popular, and why most aren't needed now

Most of them came out between 2010 and 2018. Back then browsers had almost no tracking protection, so extensions were the only defence. Millions installed them, they got recommended everywhere, and people still recommend them out of habit.

Since then Firefox has built most of it in:

| Year | Firefox added | Which extension it replaced |
|---|---|---|
| 2019 | **Enhanced Tracking Protection**, which blocks known trackers using Disconnect's own list | Disconnect, most of Privacy Badger |
| 2020 | **HTTPS-Only mode** | DuckDuckGo's HTTPS upgrade, HTTPS Everywhere |
| 2021 | **Separate cache per site** | Decentraleyes |
| 2022 | **Total Cookie Protection**: every site gets its own cookie jar, so a tracker's cookie can't link sites. **Query stripping** in Strict mode (removes `fbclid`, `gclid`, etc.) | Most cookie blockers, part of ClearURLs |
| 2023 | **Global Privacy Control** ("don't sell my data" signal) | Part of DuckDuckGo |
| 2024 | **Fingerprinting protection** in Strict mode, **SmartBlock** click-to-load embeds | Part of CanvasBlocker and Privacy Badger |
| 2026 (v153) | **Asks before sites reach your home network** | Port Authority |

**uBlock Origin** covers most of the rest. It blocks ads, trackers and malware sites from big shared lists that update daily, and it can turn off JavaScript per site.

### Why too many extensions is actually bad

- **Speed:** each one runs its own code on every page and every request. Ten blockers each check the same request ten times.
- **Security:** each one can see every page you visit, including your bank. If an extension gets sold or hacked (this happens a lot, especially to free VPNs), the new owner gets that access.
- **Breakage:** blockers fight each other. When a site breaks, you can't tell which one caused it.
- **Uniqueness:** an unusual mix of extensions can make your browser *more* recognisable to fingerprinting, not less.

## 3. Each extension you installed

| Extension | What it does | Why people liked it | Downsides | Verdict |
|---|---|---|---|---|
| **uBlock Origin** | Blocks ads, trackers and malware sites with filter lists | Fast, free, open source, no "acceptable ads" deals | Some sites detect it and complain | **Keep** |
| **Disconnect** | Blocks ~1,200 tracker domains, shows a graph | Simple, early pioneer | Firefox Strict uses the same list, and its list is older | Remove |
| **Privacy Badger** (EFF) | Learns trackers by watching who follows you across 3+ sites | Made by a trusted non-profit, no list needed | Learns slowly, sometimes breaks logins; uBlock + Strict already cover it | Remove. Its 2 useful settings are in our add-on |
| **DuckDuckGo Essentials** | Tracker blocking, HTTPS, link cleaning, Fire button | One-click, well-known brand | Mostly duplicates Firefox Strict; pushes DuckDuckGo search | Remove. Link cleaning and Forget are in ours |
| **Malwarebytes Browser Guard** | Blocks scam, phishing and malware sites | Big security brand | Closed source, heavy (34 MB), Firefox Safe Browsing + uBlock cover most of it | Remove |
| **Port Authority** | Stops sites (eBay was caught doing it) scanning your home network | Exposed a real abuse | Firefox 153+ now asks you instead | Remove |
| **Chrome Mask** | Makes a site think you use Chrome | Some sites wrongly block Firefox | Only needed on a few sites | In ours, per site |
| **Don't Track Me Google** | Makes Google results link straight to the site | Google logs every click | Small job | In ours |
| **Flagfox** | Flag of the country the site's server is in | Fun, spots dodgy sites hosted somewhere odd | Not really privacy; big sites use servers everywhere (CDNs) | In ours |
| **PopUpOFF** | Hides cookie banners and "subscribe!" pop-ups | Pop-ups are annoying | Can hide real parts of a page | In ours, per site |
| **ClearURLs** | Removes tracking bits from links | Clean links to share | Firefox Strict strips some; can break the odd link | In ours |
| **NoScript** | Blocks all JavaScript until you allow a site | Very strong security | Breaks almost every site until you set it up; hard work | Remove; uBlock has a per-site JavaScript switch |
| **CanvasBlocker** | Adds noise to fingerprinting tricks | Fights fingerprinting | Can break sites; the noise itself can stand out | Remove; Strict mode or our strong switch |
| **Decentraleyes** | Serves common code libraries from your PC instead of Google's CDN | Stopped CDNs tracking you | Pointless since Firefox separated caches per site | Remove |
| **User-Agent Switcher** | Pretends to be any browser | Testing websites, getting around blocks | Changing it all the time makes you *more* unique | Remove; our Chrome mode covers the real need |
| **FoxyProxy** | Switches between proxy servers | Handy if you use proxies | Does nothing by itself without a proxy | Remove unless you use proxies |
| **Duplicate Tab Shortcut** | Alt+Shift+D duplicates a tab | Firefox has no shortcut for it | Its own add-on just for one key | In ours, same key |

## 4. Your setup now (three layers)

1. **Firefox Strict mode**: blocks known trackers, gives each site its own cookie jar, strips some link tracking, fights fingerprinting.
2. **uBlock Origin**: blocks ads, more trackers and malware sites. The heavy lifting.
3. **More Settings for Firefox**: small extras the first two don't do.

## 5. How each part of More Settings for Firefox works

### Clean links
- **How:** when you open a page, Firefox lets the add-on look at the address first. If it has tracking bits (`utm_source`, `fbclid` and ~60 others), it removes them and opens the clean address instead. If it's a redirect link like `google.com/url?q=real-site`, it jumps straight to the real site. Only the page you open is checked, not every image or script, so it's fast.
- **Why:** those bits tell the site (and Google/Facebook) exactly where you came from. Firefox Strict only strips a few, and never `utm_`.
- **Pros:** cleaner, shorter links to share; less tracking. "Copy clean link" in the right-click menu for sharing.
- **Cons:** very rarely a site needs one of those bits (for example, some discount links). Turn the switch off if a link stops working.

### Server country flag
- **How:** when a page loads, Firefox tells the add-on the server's IP address. The add-on looks it up in a country list stored inside the add-on (5 MB, free CC0 data), so nothing goes online. The flag appears in the address bar.
- **Why:** a quick check. A "bank" hosted in an unexpected country is a warning sign.
- **Cons:** big sites use servers all over the world (CDNs), so it often shows the nearest copy, not the company's country. Treat it as a hint, not proof.

### Remove pop-ups (per site)
- **How:** on sites you turn it on for, it looks for boxes that float over the page (cookie walls, "sign up!" boxes, dark see-through backdrops), hides them, and lets the page scroll again. It skips anything you opened yourself in the last few seconds, and anything that holds the page's main content.
- **Why:** some sites block the whole page until you click a banner.
- **Pros:** cleaner reading. **Cons:** it guesses, so it can hide something you wanted. That's why it's off until you choose a site, and reloading brings everything back.
- **Note:** hiding a cookie banner isn't the same as saying "no". Your Strict mode's separate cookie jars are what actually protect you.

### Pretend to be Chrome (per site)
- **How:** every request tells sites which browser you use (the "user agent"). On sites you choose, the add-on swaps it to say Chrome, and also changes the JavaScript checks sites use, so both match.
- **Why:** some sites (some banks, Teams-style apps, ticket sites) say "Firefox not supported" even though Firefox works fine.
- **Cons:** occasionally a site sends Chrome-only code that doesn't work in Firefox. Turn it off for that site. Only use it where you need it.

### Forget this site
- **How:** one button deletes that site's cookies and saved data, then reloads.
- **Why:** quick way to stop a site recognising you, or fix a site that's acting weird.
- **Cons:** you'll be signed out of that site.

### Hide your local IP (WebRTC)
- **How:** WebRTC is the tech behind video calls in the browser. By default it can reveal your home network address, and sometimes your real IP even when using a VPN. This setting makes it use only your normal public connection.
- **Pros:** fixes a known leak, especially with a VPN. **Cons:** none for normal use. "Strict" mode can break video calls unless you're on a VPN, so it's off.

### Block click pings
- **How:** links can carry a hidden "ping" that reports each click to a tracking address. This turns that off in Firefox.
- **Pros:** less click tracking. **Cons:** none noticeable.

### Strong fingerprint protection (off by default)
- **How:** turns on Firefox's strongest anti-fingerprinting mode (the one Tor Browser uses). Sites see UTC time, light mode and a standard window size, so you look like everyone else using it.
- **Cons:** clocks on sites show the wrong time zone, dark mode stops working on sites, some sites break. Strict mode already has a lighter version, which is enough for most people.

### Don't pre-load links (off by default)
- **How:** Firefox normally guesses which link you'll click and starts connecting early, to save time. This stops that.
- **Pros:** slightly more private (sites you didn't visit don't get a connection). **Cons:** pages open a little slower. That's why it's off.

### Tabs
- **Alt+Shift+D** duplicates the tab (or all selected tabs). There are also buttons to duplicate to a new window and to move the tab to a new window. "Stay on this tab" keeps you where you are.

### Check-up
- Reads Firefox's own settings and shows a tick or a fix for each: Strict tracking protection, cookie protection, HTTPS-Only, and "Tell websites not to sell or share my data". Firefox doesn't let add-ons change these, so it tells you where to click.

## 6. Does it make Firefox faster?

- **Removing the ~15 extensions is the biggest speed-up.** Most of them ran code on every request on every page.
- **uBlock Origin makes pages faster**, because ads and trackers never download.
- **Our add-on** only runs a tiny check when you open a page. The Chrome swap is done by Firefox itself, not by code, and the pop-up remover only loads on sites you chose. So it shouldn't slow you down noticeably.
- The only setting that slows things is "Don't pre-load links", and it's off.
