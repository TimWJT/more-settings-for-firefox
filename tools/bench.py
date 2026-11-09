"""Performance benchmark for More Settings for Firefox.

Runs headless Firefox twice (without and with the add-on) against local test pages and reports medians.
Pages are served from a local server under the name bench.test (mapped to 127.0.0.1) so per-site
features accept the host.
"""
import json, statistics as st, sys, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

EXT = r"C:\Users\Tim\Documents\Coding\Browser Extensions\more-settings-for-firefox"
ID = "more-settings-for-firefox@timwjt"
UUID = "4b6a3f1e-6d2c-4a77-9a3e-1f0c2b7d9e11"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 30

# ---------- test pages ----------
FRAME_PROBE = """<script>
window.__frames=[];let last=performance.now();
function f(t){__frames.push(t-last);last=t;requestAnimationFrame(f)}requestAnimationFrame(f);
</script>"""

def page(body, extra=""):
    return f"<!doctype html><meta charset=utf-8><title>t</title>{FRAME_PROBE}{extra}<body>{body}</body>".encode()

PLAIN = page("<main>" + "".join(f"<p>Paragraph {i} <a href='/x{i}'>link</a></p>" for i in range(300)) + "</main>")
HEAVY = page("<main>" + "".join(f"<div class='row r{i}'><span>Item {i}</span><b>{i}</b><i>x</i></div>" for i in range(6000)) + "</main>"
             + "<div id='cookie-consent' style='position:fixed;inset:0;background:rgba(0,0,0,.6)'>We use cookies. Accept all</div>")
ANIM = page("<main>" + "".join(f"<div class='row'><span>Item {i}</span></div>" for i in range(2000)) + "</main>"
            + "<div id='ticker' style='position:fixed;bottom:0;left:0;width:200px;height:20px'>tick</div>"
            + "<script>let k=0;(function step(){document.getElementById('ticker').className='t'+(k++%2);"
            + "document.querySelectorAll('.row')[k%2000].style.color=k%2?'red':'blue';requestAnimationFrame(step)})();</script>")

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        body = {'/plain': PLAIN, '/heavy': HEAVY, '/anim': ANIM}.get(path, PLAIN)
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

srv = ThreadingHTTPServer(('127.0.0.1', 0), H)
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://bench.test:{PORT}"

def browser(with_ext):
    o = Options()
    o.add_argument("-headless")
    o.set_preference("network.dns.localDomains", "bench.test")
    o.set_preference("extensions.webextensions.uuids", json.dumps({ID: UUID}))
    # Unload an idle background page after 2 s instead of 30 s, to measure the wake-up cost quickly.
    o.set_preference("extensions.background.idle.timeout", 2000)
    d = webdriver.Firefox(options=o, service=Service(service_args=["--allow-system-access"]))
    d.set_window_size(1280, 900)
    if with_ext:
        d.install_addon(EXT, temporary=True)
        time.sleep(2)
    return d

def nav_ms(d, url):
    """Load url; return (wall ms for d.get, navigation-timing ms from start to load end)."""
    t = time.perf_counter()
    d.get(url)
    wall = (time.perf_counter() - t) * 1000
    nt = d.execute_script("const n=performance.getEntriesByType('navigation')[0]; return n ? n.loadEventEnd : null")
    return wall, nt

def frames(d, secs):
    """Frame gaps measured in the page for secs seconds: (median ms, 95th pct ms, frames over 50 ms)."""
    d.execute_script("window.__frames=[]")
    time.sleep(secs)
    f = d.execute_script("return window.__frames.slice(1)")
    f.sort()
    return round(st.median(f), 1), round(f[int(len(f) * .95)], 1), sum(x > 50 for x in f)

def med(xs): return round(st.median(xs), 1)

def set_storage(d, obj):
    """Write add-on settings from an extension page opened with system privileges."""
    main = d.current_window_handle
    before = set(d.window_handles)
    with d.context(d.CONTEXT_CHROME):
        d.execute_script("gBrowser.addTab(arguments[0], {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true})",
                         f"moz-extension://{UUID}/popup.html")
    time.sleep(1.2)
    h = (set(d.window_handles) - before).pop()
    d.switch_to.window(h)
    d.execute_async_script("const done=arguments[arguments.length-1]; browser.runtime.sendMessage({type:'saveSites',changes:arguments[0]}).then(()=>done(1),e=>done(String(e)))", obj)
    d.close()
    d.switch_to.window(main)

results = {}
for label, with_ext in (("without add-on", False), ("with add-on", True)):
    d = browser(with_ext)
    r = results[label] = {}
    d.get(f"{BASE}/plain?warm")  # warm-up
    # A. normal page loads
    walls, nts = [], []
    for i in range(N):
        w, n = nav_ms(d, f"{BASE}/plain?i={i}")
        walls.append(w); nts.append(n)
    r["normal page load (wall ms)"] = med(walls)
    r["normal page load (page timing ms)"] = med(nts)
    # B. tracking link (with the add-on this one gets cleaned and redirected)
    walls, nts = [], []
    for i in range(N):
        w, n = nav_ms(d, f"{BASE}/plain?i={i}&utm_source=news&fbclid=abc")
        walls.append(w); nts.append(n)
    r["link with tracking (wall ms)"] = med(walls)
    r["link with tracking (page timing ms)"] = med(nts)
    # C. first load after the background page went to sleep (idle timeout 2 s)
    walls = []
    for i in range(max(5, N // 5)):
        time.sleep(3)
        w, _ = nav_ms(d, f"{BASE}/plain?wake={i}")
        walls.append(w)
    r["first load after idle (wall ms)"] = med(walls)
    # D. heavy page (6000 rows + cookie overlay): load time and frame smoothness
    walls = []
    for i in range(max(5, N // 3)):
        w, _ = nav_ms(d, f"{BASE}/heavy?i={i}")
        walls.append(w)
    r["heavy page load, pop-up remover off (wall ms)"] = med(walls)
    r["heavy page frames, remover off (median/p95/over50)"] = frames(d, 4)
    d.get(f"{BASE}/anim")
    r["animated page frames, remover off (median/p95/over50)"] = frames(d, 5)
    if with_ext:
        set_storage(d, {"popupSites": {"bench.test": "popups"}})
        walls, scans = [], []
        for i in range(max(5, N // 3)):
            w, _ = nav_ms(d, f"{BASE}/heavy?on={i}")
            walls.append(w)
            time.sleep(0.5)
            # Time one full scan of the page directly
            scans.append(d.execute_script("""
              const before = performance.now();
              return null;"""))
        r["heavy page load, pop-up remover ON (wall ms)"] = med(walls)
        hidden = d.execute_script("return getComputedStyle(document.getElementById('cookie-consent')).display")
        r["cookie overlay hidden on heavy page"] = hidden == "none"
        r["heavy page frames, remover ON (median/p95/over50)"] = frames(d, 4)
        d.get(f"{BASE}/anim")
        time.sleep(1)
        r["animated page frames, remover ON (median/p95/over50)"] = frames(d, 5)
        # Direct timing of one full scan of the heavy page, via the add-on's own content script
        main = d.current_window_handle
        before = set(d.window_handles)
        d.get(f"{BASE}/heavy?scan")
        time.sleep(1)
        with d.context(d.CONTEXT_CHROME):
            d.execute_script("gBrowser.addTab(arguments[0], {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true})",
                             f"moz-extension://{UUID}/popup.html")
        time.sleep(1.2)
        h = (set(d.window_handles) - before).pop()
        d.switch_to.window(h)
        scan = d.execute_async_script("""const done=arguments[arguments.length-1];(async()=>{
          const [t]=await browser.tabs.query({url:'*://bench.test/*'});
          const times=[];
          for(let i=0;i<10;i++){
            const [x]=await browser.scripting.executeScript({target:{tabId:t.id},func:()=>{
              window.msfPopups.stop(); const a=performance.now(); window.msfPopups.start('popups', false); return performance.now()-a;}});
            times.push(x.result);
          }
          times.sort((a,b)=>a-b); return times;})().then(done,e=>done(String(e)))""")
        r["one full scan of heavy page (ms, 10 runs sorted)"] = [round(x, 1) for x in scan] if isinstance(scan, list) else scan
        d.close(); d.switch_to.window(main)
    d.quit()

srv.shutdown()
print(json.dumps(results, indent=1))
