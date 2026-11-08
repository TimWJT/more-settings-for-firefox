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
  noPrefetch: false,
  // Tabs
  dupBackground: false,
  // This site
  showFlag: true,
  popupSites: {},   // { "example.com": "popups" | "all" }
  chromeSites: [],  // ["example.com"]
};
