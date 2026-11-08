// Default settings, shared by background.js, popup.js and the content scripts.
const MSF_DEFAULTS = {
  // Links
  cleanParams: true,
  unwrapRedirects: true,
  unwrapAmp: true,
  cleanLinkMenu: true,
  // Privacy (Firefox settings changed through browser.privacy)
  webrtcProtect: true,
  webrtcStrict: false,
  blockPing: true,
  resistFingerprinting: false,
  // Tabs
  dupBackground: true,  // stay on the current tab after duplicating
  // Per site
  popupSites: {},   // { "example.com": "popups" | "all" }
  chromeSites: [],  // ["example.com"]
  pausedSites: [],  // ["example.com"]: this add-on does nothing there
};
