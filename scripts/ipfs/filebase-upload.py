"""Pin the AASA collection into Filebase (IPFS), phase 1 art then phase 2 metadata.

The bucket is private over S3, but every object is pinned to IPFS and resolves
publicly at https://ipfs.filebase.io/ipfs/<cid>, so each token's art gets a
permanent ipfs:// URI and the metadata files point at those CIDs.
"""
import os, sys, json, time, threading
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "/tmp")
from s3probe import signed_request
from datetime import datetime

BUCKET = "aasa-nft-avatar"
SRC = "/app/conversations/6acd9cee540df00fc33c4e3c/aa-v2/site/meta"
OUT = "/app/conversations/6ac7cee2e53924ef39e93934/filebase-manifest.json"
lock = threading.Lock()

def put(key, body, ctype):
    for attempt in range(4):
        s, h, b = signed_request("PUT", f"/{BUCKET}/{key}", body=body,
                                 extra_headers={"content-type": ctype})
        cid = h.get("X-Amz-Meta-Cid") or h.get("x-amz-meta-cid")
        if s == 200 and cid:
            return cid
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"PUT {key} failed: {s} {b[:200]!r}")

def run_phase(name, items, ctype, workers=16):
    done, total = [0], len(items)
    def work(it):
        key, body = it
        cid = put(key, body, ctype)
        with lock:
            done[0] += 1
            if done[0] % 100 == 0:
                print(f"  {name}: {done[0]}/{total}", flush=True)
        return key, cid
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return dict(ex.map(work, items))

def main():
    ids = sorted(int(f[:-5]) for f in os.listdir(SRC) if f.endswith(".json"))
    print(f"images: {len(ids)}")

    img_items = [(f"img/{i}.gif", open(os.path.join(SRC, "img", f"{i}.gif"), "rb").read()) for i in ids]
    img_cids = run_phase("img", img_items, "image/gif")
    print(f"images pinned: {len(img_cids)}")

    meta_items = []
    for i in ids:
        d = json.load(open(os.path.join(SRC, f"{i}.json")))
        uri = f"ipfs://{img_cids[f'img/{i}.gif']}"
        d["image"] = uri
        if "animation_url" in d:
            d["animation_url"] = uri
        d.pop("external_url", None)
        meta_items.append((f"meta/{i}", json.dumps(d).encode()))
    meta_cids = run_phase("meta", meta_items, "application/json")
    print(f"metadata pinned: {len(meta_cids)}")

    man = {"pinnedAt": datetime.utcnow().isoformat() + "Z", "provider": "filebase",
           "bucket": BUCKET, "gateway": "https://ipfs.filebase.io/ipfs/",
           "tokens": {str(i): {"image": img_cids[f"img/{i}.gif"], "metadata": meta_cids[f"meta/{i}"]} for i in ids}}
    json.dump(man, open(OUT, "w"))
    print("manifest:", OUT, "| sample token 1:", man["tokens"]["1"])

if __name__ == "__main__":
    main()
