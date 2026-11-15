import json, sys, time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

EXT = str(__import__("pathlib").Path(__file__).resolve().parent.parent)  # the add-on folder
OUT = __import__("tempfile").gettempdir()  # screenshots go here
UUID = "4b6a3f1e-6d2c-4a77-9a3e-1f0c2b7d9e11"
ID = "more-settings-for-firefox@timwjt"

o = Options()
o.add_argument("-headless")
o.set_preference("extensions.webextensions.uuids", json.dumps({ID: UUID}))
from selenium.webdriver.firefox.service import Service
d = webdriver.Firefox(options=o, service=Service(service_args=["--allow-system-access"]))
d.set_window_size(1200, 900)
results = []
def check(name, ok, info=""):
    results.append((name, ok)); print(("PASS " if ok else "FAIL ") + name, info)

try:
    d.install_addon(EXT, temporary=True)
    time.sleep(2)
    print("Firefox", d.capabilities.get("browserVersion"))
    POP = f"moz-extension://{UUID}/popup.html"

    def ext_js(script):
        """Run async JS in an extension page (has browser.* APIs)."""
        handles = d.window_handles
        d.switch_to.window(ext_handle)
        r = d.execute_async_script("const done = arguments[arguments.length-1];(async()=>{" + script + "})().then(done, e=>done('ERR '+e))")
        d.switch_to.window(web_handle)
        return r

    web_handle = d.current_window_handle
    before = set(d.window_handles)
    with d.context(d.CONTEXT_CHROME):
        d.execute_script("gBrowser.addTab(arguments[0], {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()})", POP)
    time.sleep(1.5)
    ext_handle = (set(d.window_handles) - before).pop()
    d.switch_to.window(web_handle)

    # 1 link cleaning
    d.get("https://example.com/?utm_source=x&fbclid=1&keep=2"); time.sleep(1)
    check("strip params", d.current_url == "https://example.com/?keep=2", d.current_url)
    d.get("https://www.google.com/url?q=https://example.com/landed&sa=D"); time.sleep(2)
    d.get("https://example.com/?token=abc+def&name=a%20b~c&gclid=1"); time.sleep(1)
    check("encoding kept", d.current_url == "https://example.com/?token=abc+def&name=a%20b~c", d.current_url)
    d.get("https://www.google.com/url?q=https://example.com/landed&sa=D"); time.sleep(2)
    check("unwrap google redirect", d.current_url.startswith("https://example.com/landed"), d.current_url)

    # 2 privacy settings applied
    r = ext_js("""const p=browser.privacy; return JSON.stringify({
      webrtc:(await p.network.webRTCIPHandlingPolicy.get({})).value,
      ping:(await p.websites.hyperlinkAuditingEnabled.get({})).value,
      tp:(await p.websites.trackingProtectionMode.get({})).value,
      https:(await p.network.httpsOnlyMode?.get({}))?.value,
      gpc:(await p.network.globalPrivacyControl?.get({}))?.value});""")
    print("privacy:", r)
    j = json.loads(r)
    check("webrtc protected", j["webrtc"] == "default_public_interface_only")
    check("ping off", j["ping"] is False)

    # 3 link activity: badge, note, open original, pause
    d.get("https://example.com/?utm_source=x&fbclid=1"); time.sleep(1.5)
    r = ext_js("""const t=(await browser.tabs.query({url:'https://example.com/*'}))[0];
      const a=(await browser.storage.session.get('act'+t.id))['act'+t.id];
      return JSON.stringify({badge: await browser.action.getBadgeText({tabId:t.id}), title: await browser.action.getTitle({tabId:t.id}), act:a, id:t.id});""")
    print("activity:", r)
    j = json.loads(r)
    check("badge shows 1 change", j["badge"] == "1" and "utm_source" in j["title"], j["title"])
    ext_js(f"await browser.runtime.sendMessage({{type:'openOriginal',tabId:{j['id']}}}); return 1;")
    time.sleep(1.5)
    check("open original link", "utm_source=x" in d.current_url, d.current_url)
    ext_js("await browser.runtime.sendMessage({type:'saveSites',changes:{pausedSites:['example.com']}}); return 1;")
    d.get("https://example.com/?utm_source=y"); time.sleep(1.5)
    b2 = ext_js(f"return await browser.action.getBadgeText({{tabId:{j['id']}}})")
    check("paused site not cleaned", "utm_source=y" in d.current_url and b2 == "off", f"{d.current_url} badge={b2}")
    ext_js("await browser.runtime.sendMessage({type:'saveSites',changes:{pausedSites:[]}}); return 1;")
    d.get("https://example.com/"); time.sleep(1)

    # 4 pop-up remover on a fake overlay
    d.execute_script("""
      const o=document.createElement('div'); o.id='cookie-consent';
      o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999';
      o.textContent='We use cookies. Accept all'; document.body.append(o);
      document.documentElement.style.overflow='hidden';
      const hdr=document.createElement('div'); hdr.style.cssText='position:fixed;top:0;left:0;right:0;height:50px';
      hdr.textContent='Site header Subscribe'; hdr.id='hdr'; document.body.append(hdr);
      const app=document.createElement('div'); app.id='app'; app.style.cssText='position:fixed;inset:0;z-index:1;background:#fff';
      app.innerHTML='<main>'+'Real page text. '.repeat(80)+'</main>'; document.body.prepend(app);""")
    time.sleep(2)
    r = ext_js("""const t=(await browser.tabs.query({url:'https://example.com/*'}))[0];
      await browser.scripting.executeScript({target:{tabId:t.id}, files:['content/popups.js']});
      const [x]=await browser.scripting.executeScript({target:{tabId:t.id}, func:()=>window.msfPopups.start('popups', true)});
      return x.result;""")
    hidden = d.execute_script("return getComputedStyle(document.getElementById('cookie-consent')).display")
    hdr = d.execute_script("return getComputedStyle(document.getElementById('hdr')).display")
    ov = d.execute_script("return getComputedStyle(document.documentElement).overflowY")
    app = d.execute_script("return getComputedStyle(document.getElementById('app')).display")
    check("app root kept", app != "none", app)
    r2 = ext_js("""const t=(await browser.tabs.query({url:'https://example.com/*'}))[0];
      const [x]=await browser.scripting.executeScript({target:{tabId:t.id}, func:()=>window.msfPopups.stop()});
      return x.result;""")
    back = d.execute_script("return [getComputedStyle(document.getElementById('cookie-consent')).display, document.documentElement.style.overflow]")
    check("show them again restores", back[0] != "none" and back[1] == "hidden", f"restored={r2} {back}")
    check("overlay hidden, header kept, scroll unlocked", hidden == "none" and hdr != "none" and ov == "auto", f"removed={r} overlay={hidden} header={hdr} overflow={ov}")

    # 5 chrome mask
    ext_js("await browser.runtime.sendMessage({type:'saveSites',changes:{chromeSites:['httpbin.org']}}); return 1;")
    print("registered:", ext_js("return JSON.stringify(await browser.scripting.getRegisteredContentScripts())"))
    d.get("https://httpbin.org/headers"); time.sleep(2)
    body = d.find_element("tag name", "body").text
    d.get("https://httpbin.org/html"); time.sleep(2)
    js = d.execute_script("return [navigator.userAgent, navigator.vendor, !!window.chrome, navigator.userAgentData && navigator.userAgentData.brands[1].brand]")
    check("chrome UA header", "Chrome/" in body and "Firefox" not in body, body[body.find('User-Agent'):][:140])
    oscpu = d.execute_script("return 'oscpu' in navigator")
    check("no oscpu", oscpu is False)
    check("chrome JS", "Chrome/" in js[0] and js[1] == "Google Inc." and js[2], str(js))
    ext_js("await browser.runtime.sendMessage({type:'saveSites',changes:{pausedSites:['www.httpbin.org']}}); return 1;")
    d.get("https://www.httpbin.org/headers"); time.sleep(2)
    sub = d.find_element("tag name", "body").text
    d.get("https://httpbin.org/headers"); time.sleep(2)
    par = d.find_element("tag name", "body").text
    check("pausing a subdomain overrides parent", "Firefox" in sub and "Chrome/" in par, "")
    ext_js("await browser.runtime.sendMessage({type:'saveSites',changes:{chromeSites:[], pausedSites:[]}}); return 1;")
    d.get("https://httpbin.org/headers"); time.sleep(2)
    check("chrome mask off again", "Firefox" in d.find_element("tag name", "body").text)

    # 7 duplicate tab
    with d.context(d.CONTEXT_CHROME):
        before = d.execute_script("gBrowser.selectedTab = gBrowser.tabs[0]; return gBrowser.tabs.length")
        d.execute_script("const {ExtensionParent}=ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs'); ExtensionParent.GlobalManager.getExtension('more-settings-for-firefox@timwjt').shortcuts.onCommand('duplicate-tab', window);")
        time.sleep(1.5)
        after, sel = d.execute_script("return [gBrowser.tabs.length, gBrowser.tabs.indexOf(gBrowser.selectedTab)]")
    check("duplicate tab", after == before + 1, f"{before} -> {after}")
    check("stays on original tab", sel == 0, f"selected index {sel}")
    r = ext_js("await browser.commands.update({name:'duplicate-tab', shortcut:'Alt+Shift+K'}); const a=(await browser.commands.getAll())[0].shortcut; await browser.commands.reset('duplicate-tab'); const b=(await browser.commands.getAll())[0].shortcut; return a+'|'+b;")
    check("rebind and reset shortcut", r == "Alt+Shift+K|Alt+Shift+D", r)
    cmds = ext_js("return JSON.stringify((await browser.commands.getAll()).map(c=>[c.name,c.shortcut]))")
    check("only duplicate command, Alt+Shift+D", cmds == '[["duplicate-tab","Alt+Shift+D"]]', cmds)

    # 7b site panel screenshot: popup opened as a background tab next to a cleaned page
    d.switch_to.window(web_handle)
    ext_js("await browser.runtime.sendMessage({type:'saveSites',changes:{popupSites:{'example.com':'popups'}}}); return 1;")
    with d.context(d.CONTEXT_CHROME):
        d.execute_script("gBrowser.selectedTab = gBrowser.tabs[0]")
    d.get("https://example.com/?utm_source=news&fbclid=2"); time.sleep(2)
    before = set(d.window_handles)
    with d.context(d.CONTEXT_CHROME):
        d.execute_script("gBrowser.addTab(arguments[0], {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true})", POP)
    time.sleep(2)
    bg = (set(d.window_handles) - before).pop()
    d.switch_to.window(bg)
    d.set_window_size(560, 1000)
    d.execute_script("document.getElementById('tab-site').click()"); time.sleep(0.8)
    d.save_screenshot(rf"{OUT}\popup-site-real.png")
    d.execute_script("return browser.storage.local.set({pausedSites:['example.com']})")
    d.close(); d.switch_to.window(web_handle)
    with d.context(d.CONTEXT_CHROME):
        d.execute_script("gBrowser.selectedTab = gBrowser.tabs[0]")
    before = set(d.window_handles)
    with d.context(d.CONTEXT_CHROME):
        d.execute_script("gBrowser.addTab(arguments[0], {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true})", POP)
    time.sleep(2)
    bg = (set(d.window_handles) - before).pop(); d.switch_to.window(bg)
    d.execute_script("document.getElementById('tab-site').click()"); time.sleep(0.5)
    d.save_screenshot(OUT + r"\popup-site-paused.png")
    d.execute_script("return browser.storage.local.set({pausedSites:[]})")
    pass

    # 8 popup screenshots
    d.switch_to.window(ext_handle)
    d.set_window_size(560, 900)
    for tab in ["site", "links", "privacy", "tabs", "checkup"]:
        d.execute_script(f"document.getElementById('tab-{tab}').click()")
        time.sleep(0.6)
        d.save_screenshot(rf"{OUT}\popup-{tab}.png")
    errs = d.execute_script("return window.__errs || null")
finally:
    print("SUMMARY", sum(ok for _, ok in results), "/", len(results))
    d.quit()
