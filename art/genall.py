#!/usr/bin/env python3
import os, json, time
from gen import save_gif, metadata, traits_for, TIERS

BASE = "https://authorized-avatars.vercel.app/meta/"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site", "meta")
IMG = os.path.join(ROOT, "img")
os.makedirs(IMG, exist_ok=True)

t0 = time.time()
rows = []
seen = set()
for i in range(1, 1001):
    salt = 0
    while True:
        tr = traits_for(i, salt)
        combo = (tr[0], tr[1][0], tr[2][0], tr[3], tr[4], tr[5], tr[6])
        if combo not in seen:
            seen.add(combo)
            break
        salt += 1
    save_gif(i, os.path.join(IMG, f"{i}.gif"), salt)
    md = metadata(i, BASE, salt)
    with open(os.path.join(ROOT, f"{i}.json"), "w") as f:
        json.dump(md, f, separators=(",", ":"))
    t = md["attributes"][0]["value"]
    rows.append((i, t, md["attributes"][2]["value"], md["attributes"][4]["value"]))
print(f"generated 1000 in {time.time()-t0:.1f}s")

# gallery contact sheet
cells = "\n".join(
    f'<a class="c" href="/meta/img/{i}.gif" target="_blank"><img loading="lazy" src="/meta/img/{i}.gif" alt="#{i}"><span>#{i} · {t}</span></a>'
    for i, t, sk, de in rows
)
html = f"""<!doctype html><html><head><meta charset="utf-8"><title>AASA — Collection</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{{--ink:#080a08;--deep:#163e12;--mint:#7cff4d;--dim:#8d998c}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--ink);color:#eaf2e8;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}}
header{{padding:28px 20px 10px;border-bottom:1px solid #1c2a1a}}
h1{{margin:0;font-size:18px;letter-spacing:.18em;text-transform:uppercase}}
p.sub{{color:var(--dim);margin:6px 0 0}}
main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:16px}}
.c{{display:block;border:1px solid #1c2a1a;border-radius:8px;overflow:hidden;text-decoration:none;color:inherit;background:#0d110c}}
.c:hover{{border-color:var(--mint)}}
.c img{{width:100%;display:block;image-rendering:pixelated;aspect-ratio:1}}
.c span{{display:block;padding:6px 8px;font-size:11px;color:var(--dim)}}
</style></head><body>
<header><h1>Authorized Avatars</h1><p class="sub">1,000 animated avatars · 5 tiers · instant one-time $AASA redemption</p></header>
<main>{cells}</main></body></html>"""
with open(os.path.join(ROOT, "..", "collection.html"), "w") as f:
    f.write(html)
print("gallery written")
