"""Second benchmark: two Firefox instances (without / with the add-on) open at once, loads alternated so
warm-up and machine noise hit both equally. Then a direct timing of the pop-up remover's full scan."""
import json, statistics as st, sys, time
sys.argv = [sys.argv[0], '0']
exec(open(__file__.replace('bench2.py', 'bench.py')).read().split('results = {}')[0])  # reuse server, pages, helpers

N = 40
a, b = browser(False), browser(True)
for d in (a, b):
    d.get(f"{BASE}/plain?warm"); d.get(f"{BASE}/plain?warm2")

def alt(urlfn, n, sleep=0):
    ra, rb = [], []
    for i in range(n):
        if sleep: time.sleep(sleep)
        order = (a, b) if i % 2 == 0 else (b, a)
        for d in order:
            w, _ = nav_ms(d, urlfn(i))
            (ra if d is a else rb).append(w)
    return med(ra), med(rb), round(med(rb) - med(ra), 1)

out = {}
out["normal page: without / with / difference (ms)"] = alt(lambda i: f"{BASE}/plain?i={i}", N)
out["link with tracking: without / with / difference (ms)"] = alt(lambda i: f"{BASE}/plain?i={i}&utm_source=news&fbclid=abc", N)
out["first load after background slept: without / with / difference (ms)"] = alt(lambda i: f"{BASE}/plain?w={i}", 16, sleep=3)
out["heavy page (24k elements), remover off: without / with / difference (ms)"] = alt(lambda i: f"{BASE}/heavy?i={i}", 15)

# Pop-up remover on: page load and one full scan, timed inside the page
set_storage(b, {"popupSites": {"bench.test": "popups"}})
loads = []
for i in range(15):
    w, _ = nav_ms(b, f"{BASE}/heavy?on={i}"); loads.append(w)
out["heavy page, remover ON (ms)"] = med(loads)
time.sleep(1)
out["cookie overlay hidden"] = b.execute_script("return getComputedStyle(document.getElementById('cookie-consent')).display") == "none"
main = b.current_window_handle; before = set(b.window_handles)
with b.context(b.CONTEXT_CHROME):
    b.execute_script("gBrowser.addTab(arguments[0], {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true})", f"moz-extension://{UUID}/popup.html")
time.sleep(1.2)
b.switch_to.window((set(b.window_handles) - before).pop())
for lvl in ("popups", "all"):
    scan = b.execute_async_script("""const done=arguments[arguments.length-1];(async()=>{
      const [t]=await browser.tabs.query({url:'*://bench.test/*'}); const times=[];
      for(let i=0;i<10;i++){const [x]=await browser.scripting.executeScript({target:{tabId:t.id},args:[arguments[0]],func:(lvl)=>{
        window.msfPopups.stop(); void document.body.offsetHeight; const s=performance.now(); window.msfPopups.start(lvl,false); return performance.now()-s;}}); times.push(x.result);}
      times.sort((p,q)=>p-q); return times.map(v=>Math.round(v*10)/10);})().then(done,e=>done(String(e)))""", lvl)
    out[f"one full scan of heavy page, level {lvl} (ms, 10 runs sorted)"] = scan
b.close(); b.switch_to.window(main)
b.get(f"{BASE}/anim"); time.sleep(1.5)
out["animated page frames with remover ON (median/p95/over 50ms)"] = frames(b, 5)
a.get(f"{BASE}/anim"); time.sleep(1.5)
out["animated page frames without add-on (median/p95/over 50ms)"] = frames(a, 5)
a.quit(); b.quit(); srv.shutdown()
print(json.dumps(out, indent=1))
