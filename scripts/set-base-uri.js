/**
 * Point AuthorizedAvatars.baseURI at the pinned metadata directory.
 *
 *   node set-base-uri.js                                  # dry run, reads current value
 *   node set-base-uri.js --go ipfs://<metaCID>/           # owner tx from the burner key
 */
const fs = require("fs");
const { ethers } = require("ethers");

const NFT = process.env.NFT || "0x96b1394Bd272C36a2078D1cbb1Fc89F8F68b1Be2";
const ABI = ["function baseURI() view returns (string)", "function owner() view returns (address)",
             "function setBaseURI(string) external", "function tokenURI(uint256) view returns (string)"];
const KEY_FILE = "/app/conversations/6ac7cee2e53924ef39e93934/aasa-base/deploy/burner.json";

(async () => {
  const args = process.argv.slice(2);
  const go = args.includes("--go");
  const uri = args.find(a => a.startsWith("ipfs://"));
  const p = new ethers.JsonRpcProvider("https://mainnet.base.org");
  const n = new ethers.Contract(NFT, ABI, p);
  console.log("current baseURI:", await n.baseURI());
  console.log("contract owner :", await n.owner());
  if (!uri) { console.log("\nno ipfs:// argument given, nothing to do"); return; }
  if (!go) { console.log(`\ndry run: would set baseURI to ${uri}`); return; }

  const raw = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
  const key = raw.privateKey || raw.private_key || raw.key;
  const w = new ethers.Wallet(key.startsWith("0x") ? key : "0x" + key, p);
  const owner = await n.owner();
  if (w.address.toLowerCase() !== owner.toLowerCase()) throw new Error(`key ${w.address} is not the owner ${owner}`);
  const c = n.connect(w);
  const tx = await c.setBaseURI(uri);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("new baseURI:", await n.baseURI());
  const next = (await n.nextId()) - 1n;
  if (next >= 1n) console.log("tokenURI(1):", await n.tokenURI(1));
})();
