import fs from "fs";
import path from "path";
import { importer } from "ipfs-unixfs-importer";
import { MemoryBlockstore } from "blockstore-core";

const dir = process.argv[2];
const blockstore = new MemoryBlockstore();
const files = fs.readdirSync(dir).sort().map(name => {
  const p = path.join(dir, name);
  return fs.statSync(p).isFile() ? { path: name, content: fs.readFileSync(p) } : null;
}).filter(Boolean);
let root, count = 0, bytes = 0;
for await (const f of importer(files, blockstore, { cidVersion: 0, rawLeaves: false })) { root = f; count++; bytes += Number(f.size || 0n); }
console.log(root.cid.toString());
console.error(`  ${files.length} files, root ${root.cid.toString()}`);
