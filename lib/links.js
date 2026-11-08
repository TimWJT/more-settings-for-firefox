// Link cleaning: skip redirect wrappers, open real pages instead of AMP, remove tracking parameters.
// Each step takes a URL string and returns { url, note } (the new address and what was done), or null when nothing changed.

const MSF_TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid', 'msclkid',
  'yclid', 'ysclid', 'twclid', 'ttclid', 'li_fat_id', 'igshid', 'igsh', 'epik', 'srsltid',
  'mc_cid', 'mc_eid', 'mkt_tok', '_hsenc', '_hsmi', '__hstc', '__hssc', '__hsfp', 'hsctatracking',
  '_ga', '_gl', '_kx', 'ml_subscriber', 'ml_subscriber_hash', 'rb_clickid', 's_cid', 'sc_cid',
  'wickedid', 'irclickid', 'vgo_ee', 'oly_anon_id', 'oly_enc_id', 'vero_conv', 'vero_id',
  'ref_src', 'ref_url', 'cmpid', 'spm', 'scm',
]);
// Removed only on these sites (elsewhere they can mean something real).
const MSF_SITE_PARAMS = [
  [/(^|\.)(youtube\.com|youtu\.be)$/, ['si', 'pp', 'feature']],
  [/(^|\.)spotify\.com$/, ['si']],
  [/(^|\.)(x|twitter)\.com$/, ['s', 't']],
  [/(^|\.)instagram\.com$/, ['ig_rid', 'img_index']],
  [/(^|\.)tiktok\.com$/, ['_r', '_t', 'is_from_webapp', 'sender_device', 'sender_web_id', 'share_app_id', 'share_link_id']],
  [/(^|\.)amazon\.[a-z.]+$/, ['pd_rd_r', 'pd_rd_w', 'pd_rd_wg', 'pf_rd_p', 'pf_rd_r', 'pd_rd_i', 'ref_', 'qid', 'sprefix', 'crid', 'dib', 'dib_tag']],
  [/(^|\.)linkedin\.com$/, ['trackingId', 'refId', 'trk', 'lipi']],
];
const MSF_PARAM_PREFIXES = ['utm_', 'pk_', 'mtm_', 'hmb_', 'ga_', 'stm_'];

function msfParse(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function msfHttp(raw) {
  const u = raw && msfParse(raw);
  return u ? u.href : null;
}

// Redirect wrappers: the real address is inside the link.
function msfUnwrap(raw) {
  const u = msfParse(raw);
  if (!u) return null;
  const h = u.hostname, p = u.pathname, q = (k) => u.searchParams.get(k);
  let target = null;
  // Google puts the address in url= or q= (q= can also be search text, so take whichever is a real link).
  if (/(^|\.)google\.[a-z.]+$/.test(h) && p === '/url') target = [q('url'), q('q')].find((t) => msfHttp(t));
  else if (/^(l|lm)\.(facebook|messenger)\.com$/.test(h) && p === '/l.php') target = q('u');
  else if (/^l\.(instagram\.com|threads\.net|threads\.com)$/.test(h)) target = q('u');
  else if (/(^|\.)youtube\.com$/.test(h) && p === '/redirect') target = q('q');
  else if (h === 'out.reddit.com') target = q('url');
  else if (/(^|\.)steamcommunity\.com$/.test(h) && p.startsWith('/linkfilter')) target = q('u') || q('url');
  else if (h === 't.umblr.com' && p === '/redirect') target = q('z');
  else if (h === 'www.bing.com' && p === '/ck/a') {
    const enc = q('u');
    if (enc && enc.startsWith('a1')) {
      try {
        const bin = atob(enc.slice(2).replace(/-/g, '+').replace(/_/g, '/'));
        target = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      } catch { /* not base64 */ }
    }
  } else if (h === 'www.google.com' && p === '/imgres') target = q('imgrefurl');
  else if (/(^|\.)duckduckgo\.com$/.test(h) && p === '/l/') target = q('uddg');
  // Outlook/Teams "safe links" are left alone on purpose: they re-check the link for phishing when you click.
  let name = null;
  if (!target && /(^|\.)linkedin\.com$/.test(h) && (p === '/redir/redirect' || p === '/safety/go')) target = q('url');
  else if (!target && h === 'slack-redir.net' && p === '/link') { target = q('url'); name = 'Slack'; }
  const out = msfHttp(target);
  return out && out !== u.href ? { url: out, note: `Skipped the ${name || h.replace(/^www\./, '')} redirect` } : null;
}

// AMP: google.com/amp/s/site/page and site-com.cdn.ampproject.org/c/s/site/page.
function msfUnAmp(raw) {
  const u = msfParse(raw);
  if (!u) return null;
  // Only Google search's own AMP viewer (www.google.<tld>), not other Google sites with an /amp/ path.
  // The first part after /amp/ must look like a domain. Always open over https.
  let m = null;
  if (/^www\.google\.[a-z.]+$/.test(u.hostname)) m = u.pathname.match(/^\/amp\/(?:s\/)?([^/]+\.[^/]+(?:\/.*)?)$/);
  else if (u.hostname.endsWith('.cdn.ampproject.org')) m = u.pathname.match(/^\/[cv]\/(?:s\/)?([^/]+\.[^/]+(?:\/.*)?)$/);
  if (!m) return null;
  const out = msfHttp('https://' + m[1] + u.search + u.hash);
  return out ? { url: out, note: 'Opened the real page instead of AMP' } : null;
}

function msfStripParams(raw) {
  const u = msfParse(raw);
  if (!u || !u.search) return null;
  const extra = MSF_SITE_PARAMS.filter(([re]) => re.test(u.hostname)).flatMap(([, list]) => list);
  const isTracking = (key) => {
    const k = key.toLowerCase();
    return MSF_TRACKING_PARAMS.has(k) || extra.includes(key) || MSF_PARAM_PREFIXES.some((pre) => k.startsWith(pre));
  };
  // Work on the raw text so everything that stays keeps its exact bytes, order and encoding
  // (signed links and payment returns break if "+" or "%20" get rewritten).
  const removed = [];
  const kept = u.search.slice(1).split('&').filter((part) => {
    let key = part.split('=')[0];
    try { key = decodeURIComponent(key.replace(/\+/g, ' ')); } catch { /* keep the raw key */ }
    if (!isTracking(key)) return true;
    if (!removed.includes(key)) removed.push(key);
    return false;
  });
  if (!removed.length) return null;
  u.search = kept.length ? '?' + kept.join('&') : '';
  return { url: u.href, note: `Removed ${removed.join(', ')}` };
}

// One step of cleaning with the given settings: { url, note }, or null when nothing to do.
function msfCleanOnce(raw, s) {
  return (s.unwrapRedirects && msfUnwrap(raw))
    || (s.unwrapAmp && msfUnAmp(raw))
    || (s.cleanParams && msfStripParams(raw))
    || null;
}

// Clean fully (for "Copy clean link"): repeat until nothing changes. Returns { url, notes } (what was done).
function msfCleanFullyWithNotes(raw) {
  const all = { unwrapRedirects: true, unwrapAmp: true, cleanParams: true };
  let url = raw;
  const notes = [];
  for (let i = 0; i < 5; i++) {
    const next = msfCleanOnce(url, all);
    if (!next) break;
    url = next.url;
    notes.push(next.note);
  }
  return { url, notes };
}
const msfCleanFully = (raw) => msfCleanFullyWithNotes(raw).url;
