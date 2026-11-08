// Offline IP -> country lookup using data/ip4.bin and data/ip6.bin (built by tools/build-ipdb.py from a CC0 database).
// Nothing is sent anywhere: the lookup happens inside the add-on.

const msfIpdb = (() => {
  const dbs = {};

  async function load(name, wide) {
    if (dbs[name]) return dbs[name];
    dbs[name] = (async () => {
      const buf = await (await fetch(browser.runtime.getURL(`data/${name}.bin`))).arrayBuffer();
      const view = new DataView(buf);
      const n = view.getUint32(0);
      const width = wide ? 2 : 1;
      const keys = new Uint32Array(n * width);
      for (let i = 0; i < n * width; i++) keys[i] = view.getUint32(4 + i * 4);
      const codes = new Uint8Array(buf, 4 + n * width * 4, n * 2);
      return { n, keys, codes, wide };
    })();
    return dbs[name];
  }

  // Index of the last range whose start <= target.
  function search(db, hi, lo) {
    let a = 0, b = db.n - 1, found = 0;
    while (a <= b) {
      const mid = (a + b) >> 1;
      let cmp;
      if (db.wide) {
        const kh = db.keys[mid * 2], kl = db.keys[mid * 2 + 1];
        cmp = kh !== hi ? (kh < hi ? -1 : 1) : (kl < lo ? -1 : kl > lo ? 1 : 0);
      } else {
        cmp = db.keys[mid] < hi ? -1 : db.keys[mid] > hi ? 1 : 0;
      }
      if (cmp <= 0) { found = mid; a = mid + 1; } else { b = mid - 1; }
    }
    const code = String.fromCharCode(db.codes[found * 2], db.codes[found * 2 + 1]);
    return code === '--' ? null : code;
  }

  function v4ToInt(ip) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((x) => !(x >= 0 && x <= 255))) return null;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  }

  // Top 64 bits of an IPv6 address as [hi, lo] 32-bit numbers.
  function v6Top(ip) {
    let [head, tail] = ip.split('::');
    const a = head ? head.split(':') : [];
    const b = tail !== undefined ? (tail ? tail.split(':') : []) : null;
    let groups = b ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
    if (groups.length !== 8) return null;
    const g = groups.map((x) => parseInt(x || '0', 16));
    return [((g[0] << 16) >>> 0) + g[1], ((g[2] << 16) >>> 0) + g[3]];
  }

  // Private, loopback and other non-internet addresses.
  function isLocal(ip) {
    if (ip.includes(':')) {
      const l = ip.toLowerCase();
      return l === '::1' || /^f[cd]/.test(l) || /^fe[89ab]/.test(l);
    }
    const n = v4ToInt(ip);
    if (n === null) return false;
    const inRange = (base, bits) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits));
    return inRange('10.0.0.0', 8) || inRange('127.0.0.0', 8) || inRange('172.16.0.0', 12)
      || inRange('192.168.0.0', 16) || inRange('169.254.0.0', 16) || inRange('100.64.0.0', 10) || n === 0;
  }

  async function country(ip) {
    if (!ip) return null;
    if (isLocal(ip)) return 'LOCAL';
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) ip = mapped[1];
    if (ip.includes(':')) {
      const top = v6Top(ip);
      return top ? search(await load('ip6', true), top[0], top[1]) : null;
    }
    const n = v4ToInt(ip);
    return n === null ? null : search(await load('ip4', false), n, 0);
  }

  return { country };
})();
