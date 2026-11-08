// Runs in the page (MAIN world) on sites where "Pretend to be Chrome" is on.
// The request headers are changed by a declarativeNetRequest rule; this makes the JavaScript side match.
(() => {
  const weeks = (Date.now() - Date.UTC(2025, 5, 24)) / (7 * 864e5);
  const v = String(138 + Math.max(0, Math.floor(weeks / 4) - 1));
  const mac = /Mac/.test(navigator.platform);
  const ua = mac
    ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`
    : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
  const platform = mac ? 'macOS' : 'Windows';
  const brands = [
    { brand: 'Chromium', version: v },
    { brand: 'Google Chrome', version: v },
    { brand: 'Not/A)Brand', version: '99' },
  ];

  const getter = (obj, name, value) => {
    try {
      Object.defineProperty(obj, name, { get: () => value, configurable: true, enumerable: true });
    } catch { /* already locked */ }
  };
  const nav = Navigator.prototype;
  getter(nav, 'userAgent', ua);
  getter(nav, 'appVersion', ua.replace('Mozilla/', ''));
  getter(nav, 'vendor', 'Google Inc.');
  getter(nav, 'platform', mac ? 'MacIntel' : 'Win32');
  getter(nav, 'oscpu', undefined);
  getter(nav, 'buildID', undefined);
  getter(nav, 'productSub', '20030107');

  const uaData = {
    brands,
    mobile: false,
    platform,
    getHighEntropyValues: async (hints) => {
      const all = {
        brands, mobile: false, platform,
        platformVersion: mac ? '15.0.0' : '15.0.0',
        architecture: 'x86', bitness: '64', model: '', wow64: false,
        uaFullVersion: `${v}.0.0.0`,
        fullVersionList: brands.map((b) => ({ brand: b.brand, version: b.brand === 'Not/A)Brand' ? '99.0.0.0' : `${v}.0.0.0` })),
      };
      const out = { brands, mobile: false, platform };
      for (const h of hints || []) if (h in all) out[h] = all[h];
      return out;
    },
    toJSON: () => ({ brands, mobile: false, platform }),
  };
  getter(nav, 'userAgentData', uaData);

  if (!window.chrome) {
    window.chrome = { app: { isInstalled: false }, csi() {}, loadTimes() {}, runtime: {} };
  }
})();
