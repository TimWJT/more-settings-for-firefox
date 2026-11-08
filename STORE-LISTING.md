# Store listing: More Settings for Firefox

Copy these into the fields on addons.mozilla.org when you submit.

## Name
More Settings for Firefox

## Summary (max 250 characters)
Privacy extras Firefox and uBlock Origin don't have: clean links (and see when it happens), remove pop-ups per site, pretend to be Chrome, hidden privacy settings and Alt+Shift+D duplicate tab.

## Description
(AMO joins plain lines into one paragraph, so the list uses Markdown "- " bullets with blank lines around it.)

The Firefox settings you wish it had, in one small add-on. Made to sit next to uBlock Origin, not replace it.

- **Clean links**: removes utm_, fbclid, gclid and other tracking, skips Google and Facebook redirect links, opens real pages instead of AMP
- **Remove pop-ups** on the sites you choose: cookie walls, sign-up boxes, scroll lock
- **Pretend to be Chrome** on sites that say Firefox isn't supported
- **See everything it changed**: a number on the icon, one-click undo and a pause switch per site
- **Hidden privacy settings**: hide your local IP, block click pings, strong fingerprint protection
- **Duplicate tab** with Alt+Shift+D
- **Check-up** of Firefox's own privacy settings

On install it hides your local IP from WebRTC and blocks click pings. Both are switches you can turn off.

No data collected. Nothing is sent anywhere. Not affiliated with Mozilla.

## Notes for reviewers
- All code is unminified and written for this add-on.
- `<all_urls>` + `webRequestBlocking`: removes tracking parameters and redirect wrappers from top-level navigations only.
- `declarativeNetRequest`: changes the User-Agent only on sites the user switches "Pretend to be Chrome" on for.
- `privacy`: on install it turns on two settings, both shown as switches in the popup and undone when switched off or when the add-on is removed: WebRTC only uses the public network interface, and `<a ping>` is off.

## Categories
Privacy & Security, Tabs

## Tags
privacy, tracking, clean urls, user agent, popup blocker, duplicate tab
