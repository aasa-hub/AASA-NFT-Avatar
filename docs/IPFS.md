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

## Lighthouse (tried 2026-11-08)

Setup needs no email: GET `api.lighthouse.storage/api/auth/get_message?publicKey=<addr>`, sign that string with the owner wallet, POST `/api/auth/create_api_key` with `{publicKey, signedMessage, keyName}`. The response body is a bare string, not JSON. Free quota is 5 GiB.

Packing and importing work:

```
npx ipfs-car pack collection --output collection.car     # collection/{img,meta}
curl -X POST -H "Authorization: Bearer <key>" \
     -H "Origin: https://files.lighthouse.storage" -H "Referer: https://files.lighthouse.storage/" \
     -F "file=@collection.car" https://upload.lighthouse.storage/api/v0/dag/import
```

Uploads answer a plain `403` when those Origin/Referer headers are missing, even with a valid key.

Retrieval is the problem. `gateway.lighthouse.storage` returns `402 Payment required` for our root, with and without the owner key, and independent gateways report `no providers found for the CID` after a 55 second wait. The blocks are stored and counted against quota but never advertised, so nothing outside can read them. Only one metadata file ever returned 200, which reads as gateway cache. That is why `baseURI` still points at the commit-pinned directory.

The imported root is `bafybeid2igs5nkyp6knbt5uftrpukqfwk6t2dsdnnsacv7imhqxeaeyi24` (CIDv1, since ipfs-car does not emit CIDv0). It holds `img/` and `meta/`, and every metadata file points `image` at `ipfs://bafybeiblqplmvlmwvmprryntwys4yoly3igpqwtq6flok7fadpscmur6vy/<id>.gif`. The DAG is correct and final, so buying a plan that actually serves content needs no re-upload, only the baseURI switch.

## What is blocked

**Both free tiers tested cap at 500 pins.** Pinata rejects the folder upload with "The number of files being added would exceed your account's pin limit". Filebase, reached through its S3 keys, failed at object 494 of 2,000 with "Free accounts are limited to 500 IPFS pins" — after pinning 493 GIFs, which do resolve: `https://ipfs.filebase.io/ipfs/QmaVEsvqEytq1WgprkhNiQ5ephnBxov4giEqRsPJo2m2jY` returns the real 11,839-byte four-frame GIF. A 1,000-token collection cannot fit a 500-object budget at one object per token, so the metadata half never uploaded.

Filebase also cannot produce a directory CID: S3 writes pin one object at a time, so there is no parent node for `baseURI` to point at even with unlimited quota. That is the reason the collection moved to a commit-pinned metadata directory instead, with `baseURI` set to it on 2026-11-08.

## Original analysis (still accurate, kept for the record)

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
