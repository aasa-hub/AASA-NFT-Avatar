/**
 * Build two IPFS-ready directories from the v2.1 site metadata:
 *   ipfs-build/img/<id>.gif     the animated art
 *   ipfs-build/meta/<id>        the token metadata, image fields rewritten to ipfs://<imgCID>/
 * JSON files are extension-less because tokenURI() returns baseURI + id.
 */
const fs = require("fs");
const path = require("path");

const SRC = process.argv[2] || "/app/conversations/6acd9cee540df00fc33c4e3c/aa-v2/site/meta";
const OUT = process.argv[3] || path.join(__dirname, "ipfs-build");
const IMG_CID = process.argv[4] || "IMG_CID_PENDING";

const ids = fs.readdirSync(SRC).filter(f => /^\d+\.json$/.test(f)).map(f => parseInt(f)).sort((a, b) => a - b);
if (ids.length !== 1000) throw new Error(`expected 1000 metadata files, found ${ids.length}`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "img"), { recursive: true });
fs.mkdirSync(path.join(OUT, "meta"), { recursive: true });

let bytes = 0, missing = 0;
for (const id of ids) {
  const gif = path.join(SRC, "img", `${id}.gif`);
  if (!fs.existsSync(gif)) { missing++; continue; }
  const buf = fs.readFileSync(gif);
  fs.writeFileSync(path.join(OUT, "img", `${id}.gif`), buf);
  bytes += buf.length;

  const meta = JSON.parse(fs.readFileSync(path.join(SRC, `${id}.json`), "utf8"));
  const uri = `ipfs://${IMG_CID}/${id}.gif`;
  meta.image = uri;
  if (meta.animation_url) meta.animation_url = uri;
  delete meta.external_url;                    // no dangling links to a host that may move
  fs.writeFileSync(path.join(OUT, "meta", String(id)), JSON.stringify(meta));
}
console.log(`prepared ${ids.length - missing} tokens, ${missing} missing art, ${(bytes / 1048576).toFixed(1)} MB, image CID placeholder ${IMG_CID}`);
