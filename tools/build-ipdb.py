"""Build data/ip4.bin and data/ip6.bin from the CC0 sapics geo-whois-asn-country CSVs.

Usage: python tools/build-ipdb.py <ipv4.csv> <ipv6.csv> <out-dir>
Source: https://cdn.jsdelivr.net/npm/@ip-location-db/geo-whois-asn-country/ (CC0-1.0)

File format (big-endian):
  u32 count, then count x key (ip4: u32; ip6: u32 hi + u32 lo = top 64 bits), then count x 2-byte ASCII country.
  Each key starts a range that runs until the next key. Country "--" means unknown.
"""
import csv, ipaddress, struct, sys

def build(path, v6):
    rows = []
    with open(path, newline='', encoding='utf-8') as f:
        for start, end, cc in csv.reader(f):
            s = int(ipaddress.ip_address(start)); e = int(ipaddress.ip_address(end))
            if v6:
                s >>= 64; e >>= 64
            rows.append((s, e, cc.upper()[:2] if len(cc) >= 2 else '--'))
    rows.sort()
    out = []  # (start, cc)
    nxt = 0
    for s, e, cc in rows:
        if s > nxt:
            out.append((nxt, '--'))
        if s < nxt:  # overlap from 64-bit truncation: start where the previous range ended
            s = nxt
            if s > e:
                continue
        if out and out[-1][1] == cc:
            pass
        else:
            out.append((s, cc))
        nxt = e + 1
    out.append((nxt, '--'))
    keys = b''.join(struct.pack('>II', k >> 32, k & 0xffffffff) if v6 else struct.pack('>I', k) for k, _ in out)
    codes = ''.join(cc for _, cc in out).encode('ascii')
    return struct.pack('>I', len(out)) + keys + codes, len(out)

if __name__ == '__main__':
    v4, v6, outdir = sys.argv[1:4]
    for name, path, is6 in (('ip4.bin', v4, False), ('ip6.bin', v6, True)):
        data, n = build(path, is6)
        open(f'{outdir}/{name}', 'wb').write(data)
        print(name, n, 'ranges', len(data), 'bytes')
