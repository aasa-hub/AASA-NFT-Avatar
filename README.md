# AASA NFT Avatar

Authorized Avatars: 1,000 PoW-minted avatar NFTs on Base. You mine an avatar by doing the work, then redeem it against the AASA token. Contracts, art engine, metadata and the mint site all live here.

**Live site** · https://authorized-avatars.vercel.app
**Collection gallery** · https://authorized-avatars.vercel.app/collection
**X** · [@aasa_avatar](https://x.com/aasa_avatar)

## Contracts (Base mainnet, chain 8453)

| role | address |
| --- | --- |
| NFT (ERC-721, live) | [`0x96b1394Bd272C36a2078D1cbb1Fc89F8F68b1Be2`](https://basescan.org/address/0x96b1394Bd272C36a2078D1cbb1Fc89F8F68b1Be2) |
| Redeemer (v3, live) | [`0x0De77EE57C7e53cc8DA90381faa65Bab710201e8`](https://basescan.org/address/0x0De77EE57C7e53cc8DA90381faa65Bab710201e8) |
| AASA token | [`0xe4deD569fFf9bFD80b131b6aC0D6D0874dA5ABa3`](https://basescan.org/address/0xe4deD569fFf9bFD80b131b6aC0D6D0874dA5ABa3) |
| Treasury | [`0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747`](https://basescan.org/address/0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747) |
| Pool timelock (48h) | [`0x4B89C6a405340f09aAf54319f4597dD7a6151569`](https://basescan.org/address/0x4B89C6a405340f09aAf54319f4597dD7a6151569) |

Retired: the first NFT deployment `0xe7b7eb917f395ba4aab89bF9AeFB0529474e3f92` with redeemer `0x9345cb5Ed3bd1A1C1E475D6C1A3C25875F8385a2` and the v2 redeemer `0x62F88B8b6A8fcc8Ab1BBd15E70C9E75eFF09E50E`. Deployment transactions are recorded in `deployment.json`, `deployment-v2.json` and `deployment-v3.json`.

## How minting works

Five tiers, 200 avatars each, minted in order: `maxSupply` 1,000, 2.5% royalty, and each tier unlocks when the one before it passes 160 mints. A mint costs ETH plus a fixed AASA redeem, both fixed per tier in `contracts/AuthorizedAvatars.sol`; tier 1 opens at 0.0005 ETH with a 115,000 AASA redeem. The redeemer holds the AASA it will pay out, so a redemption is a transfer of already-funded tokens rather than a new emission.

## Art

`art/gen.py` draws each avatar deterministically on a 64px canvas, upscaled 4x with nearest-neighbour, as a 4-frame animated GIF (180/180/420/180 ms, loop forever). Traits: tier, skin, shirt colour and pattern, glasses, earrings, headwear. The palette is taken from the AASA mark: near-black base, deep green, mint highlight, gold accents. `art/genall.py` walks the full collection, salts each token until its trait vector is unique, and writes `site/meta/<id>.json` plus `site/meta/img/<id>.gif`. All 1,000 metadata files are unique; regenerate and compare rather than trusting that sentence.

## Layout

```
contracts/    AuthorizedAvatars.sol, AvatarRedeemer.sol
build/        compiled ABI + bytecode for each contract
art/          gen.py, genall.py, logo.png, preview GIFs
site/         index.html (mint), collection.html (gallery), nft.html, vercel.json, meta/
*.js          compile, deploy, setbase, check, verify, sitetest scripts
```

The generated `site/meta/img/` GIFs are committed so the metadata in `site/meta/*.json` resolves to real files in the repo.

## Running the scripts

```
npm install          # ethers + solc
node compile.js      # rebuild build/*.json
node check.js        # read live contract state
```

Deployment scripts read a key from the environment; no key, seed phrase or RPC secret is committed here, and none should be. `site/.env.local` is ignored for that reason.

## License

MIT for the code. The artwork and the AASA mark belong to the project.
