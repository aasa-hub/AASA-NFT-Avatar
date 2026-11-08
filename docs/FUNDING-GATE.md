# Funding gate (v3)

The v2.1 contract opens tier *n+1* the moment tier *n* reaches 160 of 200 mints. Nothing asks whether the redeemer can actually pay the next tier, and the Answer at launch was no: the pool held 23,000,000 $AASA (tier 1 exactly, 200 × 115,000) against 1,307,000,000 promised across the full ladder. Tier 2 alone needs 55,200,000, so the first holder to reach it would have hit `InsufficientPool` in `AvatarRedeemer.redeem`.

`contracts/AuthorizedAvatarsV3.sol` closes that hole. A tier now needs two conditions to open:

1. the previous tier crossed `advanceThresholdBps` (80%, unchanged), and
2. the pool holds every $AASA the new tier promises: `phaseRedeem[p] * (PER_PHASE - phaseMinted[p])`.

`aasaToken` and `redeemPool` are immutable, so the address the gate trusts cannot be redirected after deployment. `fundingRequiredFor(p)` and `fundingShortfallFor(p)` are public so a monitor can show the gap in dollars of $AASA rather than a boolean.

Opening is permissionless. The mint that crosses the threshold attempts the unlock and, if the pool is short, emits `PhaseUnlockDeferred(phase, required, available)` instead of opening. Anyone can call `unlockNextPhase()` once the pool is topped up, and it walks forward through consecutive tiers that are both crossed and funded. `setFundingGate(false)` is an owner-only escape hatch for a broken redeemer, and `sweepStuck()` rescues ETH from a mint whose fee forward failed, which v2.1 stranded forever.

## Test results

`npm install && npx hardhat test` — 13 passing:

```
✔ tier 1 opens at deploy, tier 2 does not
✔ 20 mints per wallet cap still applies on tier 1
✔ crossing 160 mints does NOT open tier 2 while the pool is short
✔ shouts PhaseUnlockDeferred on the crossing mint when short
✔ topping the pool then calling unlockNextPhase opens tier 2
✔ unlockNextPhase does nothing before the sales threshold, even with money
✔ only one tier opens per crossing; the next needs its own 160 mints
✔ gate can be switched off by the owner as an escape hatch
✔ only the owner can flip the gate or sweep
✔ mint fee lands in treasury and royalty is 2.5% to treasury
✔ underpay and overpay are refused
✔ constructor rejects a zero funding address
✔ tokenURI is baseURI + id and reverts for unminted ids
```

## Deploying

The gate changes `phaseOpen`, so it cannot be retro-fitted to the live contract: v3 is a new deployment. The collection has **0 mints**, so no holder is affected.

Two-step wiring, because the contracts reference each other and an immutable pair cannot be deployed in any order: the redeemer takes the NFT address in its constructor, and the NFT binds the pool afterwards with a one-shot `setRedeemPool` that only the owner can call and that can never be changed again.

```
node scripts/deploy-v3.js          # preflight: prints both gas estimates and the exact shortfall
node scripts/deploy-v3.js --go      # NFT, then redeemer, then the one-time pool binding
```

Constructor for the NFT is now `(treasury, royaltyReceiver, baseURI, aasaToken)`; the redeemer keeps `(nft, aasa)`.

**Before deploying, one thing has to be true:** the new redeemer must be funded, because the 23,000,000 $AASA that currently funds tier 1 sits in the *old* redeemer `0x0De77EE5…01e8` and cannot leave it. `redeem()` requires an old-NFT holder and `rescue()` explicitly refuses the AASA token, so once the NFT changes, that balance is unreachable unless someone mints the deprecated collection. Recovering it that way would cost 200 × 0.0005 = 0.1 ETH. Fund the replacement from the treasury wallet instead.

## Test results

`npm install && npx hardhat test` — 14 passing, including the one-shot pool binding.
