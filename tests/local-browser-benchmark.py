"""Controlled local Chromium lifecycle benchmark. Does not touch live websites."""
from playwright.sync_api import sync_playwright
from time import perf_counter
from statistics import median
import json

URL='data:text/html,<html><body><main>TrafficGen fixture</main></body></html>'
N=3

def browser(p):
 return p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

def one_visit(b):
 c=b.new_context();page=c.new_page();page.set_content('<html><body><main>TrafficGen fixture</main></body></html>');assert page.locator('main').inner_text()=='TrafficGen fixture';c.close()

with sync_playwright() as p:
 cold=[]
 for _ in range(N):
  t=perf_counter();b=browser(p);one_visit(b);b.close();cold.append((perf_counter()-t)*1000)
 t=perf_counter();b=browser(p)
 for _ in range(N):one_visit(b)
 b.close();shared=(perf_counter()-t)*1000
 report={'fixture':'local Chromium HTML fixture, 3 isolated sessions',
   'system':'container, not DGX', 'cold_per_session_ms':[round(x,2) for x in cold],
   'cold_total_ms':round(sum(cold),2),'reused_browser_total_ms':round(shared,2),
   'relative_speedup_for_this_fixture':round(sum(cold)/shared,2)}
 print(json.dumps(report,indent=2))
 with open('/mnt/data/trafficgen-dev/docs/LOCAL-BROWSER-BENCHMARK.json','w') as f:json.dump(report,f,indent=2)
