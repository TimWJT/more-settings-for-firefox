# Store listing: More Settings for Firefox

Copy these into the fields on addons.mozilla.org when you submit.

## Name
More Settings for Firefox

## Summary (max 250 characters)
Privacy extras Firefox and uBlock Origin don't have: clean links, remove pop-ups per site, pretend to be Chrome, server country flag, forget a site, Alt+Shift+D duplicate tab and hidden privacy settings.

## Description
(AMO joins plain lines into one paragraph, so the list uses Markdown "- " bullets with blank lines around it.)

The Firefox settings you wish it had, in one small add-on. Made to sit next to uBlock Origin, not replace it.

- **Clean links**: removes utm_, fbclid, gclid and other tracking, skips Google and Facebook redirect links, opens real pages instead of AMP
- **Remove pop-ups** on the sites you choose: cookie walls, sign-up boxes, scroll lock
- **Pretend to be Chrome** on sites that say Firefox isn't supported
- **Server country flag** in the address bar, looked up offline
- **Forget this site** in one click
- **Hidden privacy settings**: hide your local IP, block click pings, strong fingerprint protection
- **Duplicate tab** with Alt+Shift+D
- **Check-up** of Firefox's own privacy settings

No data collected. Nothing is sent anywhere. Not affiliated with Mozilla.

## Notes for reviewers
- All code is unminified and written for this add-on.
- `data/ip4.bin` and `data/ip6.bin` are built from the CC0 ip-location-db geo-whois-asn-country CSVs with `tools/build-ipdb.py` (in the source upload).
- `<all_urls>` + `webRequestBlocking`: removes tracking parameters and redirect wrappers from top-level navigations only, and reads the server IP of top-level pages for the flag.
- `declarativeNetRequest`: changes the User-Agent only on sites the user switches "Pretend to be Chrome" on for.
- `dns`: finds the server IP for the flag when a page came from the cache.

## Categories
Privacy & Security, Tabs

## Tags
privacy, tracking, clean urls, user agent, popup blocker, country flag, duplicate tab
