#!/usr/bin/env python3
"""The site at rest on the tab in front reads in order: "en." then
"wikipedia.org", the dot after its label. The grey part is cut from its left
with direction: rtl, and inside that box an LTR run ending in a dot put the
dot first (".en"): <bdi> keeps the run's own direction."""
import time
import bench as b

b.use("tab-rest-order")
b.launch()
t = b.T()

# A host that never needs the network: .test is reserved, the page fails at
# once and the tab keeps its address.
b.cmd("tab.new", url="https://en.example.test/")
b.wait_for(lambda: "en.example.test" in (b.active() or {}).get("url", ""), what="the tab's address")
time.sleep(1.2)

seen = b.ui("""(() => {
  const lead = document.querySelector('.row.live .rest-lead');
  if (!lead) return null;
  const walk = document.createTreeWalker(lead, NodeFilter.SHOW_TEXT);
  const text = walk.nextNode();
  if (!text) return null;
  const at = i => { const r = document.createRange(); r.setStart(text, i); r.setEnd(text, i + 1); return r.getBoundingClientRect().left; };
  return { text: text.data, first: at(0), last: at(text.data.length - 1) };
})()""")
t.ok(seen and seen["text"] == "en.", f"the grey part is the subdomain and its dot: {seen}")
t.ok(seen and seen["last"] > seen["first"], f"the dot comes after the label, not before it: {seen}")

# A long one still gives way from its left, and its end (the dot, next to the
# site's name) stays in sight.
b.cmd("tab.new", url="https://a-very-long-subdomain-for-the-column.and-another-label.example.test/")
b.wait_for(lambda: "a-very-long" in (b.active() or {}).get("url", ""), what="the long address")
time.sleep(1.2)
long = b.ui("""(() => {
  const lead = document.querySelector('.row.live .rest-lead');
  const text = document.createTreeWalker(lead, NodeFilter.SHOW_TEXT).nextNode();
  const r = document.createRange(); r.setStart(text, text.data.length - 1); r.setEnd(text, text.data.length);
  const dot = r.getBoundingClientRect(), box = lead.getBoundingClientRect();
  return { cut: lead.scrollWidth > lead.clientWidth, dotRight: dot.right, boxRight: box.right, boxLeft: box.left };
})()""")
t.ok(long["cut"] and long["dotRight"] <= long["boxRight"] + 0.5 and long["dotRight"] > long["boxLeft"], f"a long subdomain is cut on its left, its dot still in sight: {long}")

b.quit()
t.done()
