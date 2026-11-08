/**
 * Pin the avatar collection to IPFS (Pinata) and write the authoritative CIDs.
 *
 *   PINATA_JWT=... node ipfs-pin.mjs            # dry run: show what would upload
 *   PINATA_JWT=... node ipfs-pin.mjs --go       # upload img dir, rebuild metadata, upload meta dir
 *
 * Pinata returns a directory CID for a wrapped folder upload. We compare it with the
 * locally computed CID; if they differ, the metadata is rebuilt against the REAL image
 * CID and re-uploaded, so the JSON never points at a CID nobody pinned.
 */
import fs from "fs";
import path from "path";

const GO = process.argv.includes("--go");
const JWT = process.env.PINATA_JWT;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BUILD = path.join(HERE, "ipfs-build");

async function pinFolder(dir, name) {
  const files = fs.readdirSync(dir).sort();
  const form = new FormData();
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    form.append("file", new Blob([buf]), `${name}/${f}`);
  }
  form.append("pinataMetadata", JSON.stringify({ name: `aasa-${name}` }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 0, wrapWithDirectory: true }));
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${JWT}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`pin ${name} failed: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return { cid: body.IpfsHash, count: files.length };
}

(async () => {
  const manifestPath = path.join(HERE, "ipfs-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log(`image dir ${fs.readdirSync(path.join(BUILD, "img")).length} files, local CID ${manifest.imageCid}`);
  console.log(`meta  dir ${fs.readdirSync(path.join(BUILD, "meta")).length} files, local CID ${manifest.metaCid}`);
  if (!GO) { console.log("\ndry run: pass --go with PINATA_JWT set to pin for real"); return; }
  if (!JWT) throw new Error("PINATA_JWT is not set");

  const img = await pinFolder(path.join(BUILD, "img"), "img");
  console.log(`pinned images -> ${img.cid} (${img.count} files)`);
  if (img.cid !== manifest.imageCid) {
    console.log(`NOTE: Pinata CID differs from the local computation; rebuilding metadata against ${img.cid}`);
    const { execFileSync } = await import("child_process");
    execFileSync("node", [path.join(HERE, "ipfs-prepare.js"),
      "/app/conversations/6acd9cee540df00fc33c4e3c/aa-v2/site/meta", BUILD, img.cid], { stdio: "inherit" });
  }
  const meta = await pinFolder(path.join(BUILD, "meta"), "meta");
  console.log(`pinned metadata -> ${meta.cid} (${meta.count} files)`);

  const out = { ...manifest, imageCid: img.cid, metaCid: meta.cid,
    tokenUriPrefix: `ipfs://${meta.cid}/`, imageUriPrefix: `ipfs://${img.cid}/`,
    pinnedAt: new Date().toISOString() };
  fs.writeFileSync(manifestPath, JSON.stringify(out, null, 2));
  console.log(`\nmanifest updated. baseURI to set: ipfs://${meta.cid}/`);
  console.log(`check a gateway first: https://ipfs.io/ipfs/${meta.cid}/1`);
})();
