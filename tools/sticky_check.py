import sys, time
sys.argv = [sys.argv[0], '0']
src = open(__file__.replace('sticky_check.py', 'bench.py')).read().split('results = {}')[0]
src = src.replace("{'/plain': PLAIN, '/heavy': HEAVY, '/anim': ANIM}", "{'/plain': PLAIN, '/heavy': HEAVY, '/anim': ANIM, '/sticky': STICKY}")
src = src.replace("class H(", "STICKY = page('<main>' + '<p>text</p>'*400 + \"<div id='bar' style='position:sticky;top:0;background:#eee'>Section bar</div>\" + '<p>more</p>'*400 + '</main>')\nclass H(")
exec(src)
b = browser(True)
b.get(f"{BASE}/plain")
set_storage(b, {"popupSites": {"bench.test": "all"}})
b.get(f"{BASE}/sticky"); time.sleep(5)
before = b.execute_script("return document.getElementById('bar').style.position")
b.execute_script("document.getElementById('bar').scrollIntoView()"); time.sleep(1.2)
after = b.execute_script("return document.getElementById('bar').getAttribute('data-msf') + ' ' + document.getElementById('bar').style.position")
print("before scroll:", repr(before), "| after scroll:", after)
b.quit(); srv.shutdown()
