# Pinning the collection to IPFS

Right now `baseURI` points at `authorized-avatars.vercel.app/meta/`, so the art and metadata stop resolving whenever that deployment moves or the domain lapses. For an NFT collection that is the one hosting decision worth getting right, because token URIs are supposed to outlive the website.

## What is already done

`scripts/ipfs/ipfs-prepare.js` builds two upload-ready directories from the v2.1 site files:

- `ipfs-build/img/` — 1,000 GIFs, 16 MB
- `ipfs-build/meta/` — 1,000 extension-less JSON files (tokenURI appends the id to `baseURI`, so `1` not `1.json`), with `image` and `animation_url` rewritten to `ipfs://<imageCID>/<id>.gif` and the dead `external_url` removed

Local CIDs, computed with the same UnixFS settings go-ipfs and Pinata use (CIDv0, dag-pb, 256 KiB chunks, rawLeaves off):

```
images    Qmb4xgW83VeuzTHztS8iHbzq4JyAb984R9CjqH2t4q4iqA
metadata  QmcH9ZLRzUZF1aTQZDdWupt2WDKheTAfxmEbLJGnzSo4Ax
```

## What is blocked

Pinning a 16 MB directory needs an account; Pinata's free tier covers it. No credential exists in this workspace, so the upload has not happened and those CIDs are **not** retrievable from any gateway yet. Anyone can verify that: request `https://ipfs.io/ipfs/QmcH9ZLRzUZF1aTQZDdWupt2WDKheTAfxmEbLJGnzSo4Ax/1` and it will not resolve until the pin exists.

## The moment a JWT exists

```
export PINATA_JWT=...
node scripts/ipfs/ipfs-pin.mjs          # dry run, prints what would upload
node scripts/ipfs/ipfs-pin.mjs --go     # pins images, rebuilds metadata against the real
                                        # image CID, pins metadata, updates ipfs-manifest.json
```

The script trusts the CID Pinata returns over the local computation. If they differ it rebuilds the metadata against the pinned image CID and re-uploads, so a token can never point at a directory nobody pinned.

Then switch the contract, which is dry by default and refuses a key that is not the owner:

```
node scripts/set-base-uri.js                            # prints the current baseURI
node scripts/set-base-uri.js --go ipfs://<metaCID>/      # owner tx
```

## Still to decide after pinning

Redundancy beyond one pinning provider (a second pin on a different service, or an Arweave copy), and whether the site keeps serving the same files from Vercel as a fast mirror. Keeping both is fine; what matters is that `baseURI` no longer depends on it.
