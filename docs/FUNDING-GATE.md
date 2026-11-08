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

The gate changes `phaseOpen`, so it cannot be retro-fitted to the live contract: v3 is a new deployment, and the collection has **0 mints**, which makes that free of user impact.

```
constructor(
  treasury_        = 0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747
  royaltyReceiver_ = 0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747
  baseURI_         = ipfs://<metaCID>/   (after pinning)
  aasaToken_       = 0xe4deD569fFf9bFD80b131b6aC0D6D0874dA5ABa3
  redeemPool_      = 0x0De77EE57C7e53cc8DA90381faa65Bab710201e8
)
```

After deploying: re-verify on Basescan, point the redeemer at the new NFT (its `nft` is set at construction, so the redeemer is redeployed too), update `deployment-v3.json`, the site's hardcoded addresses, and this README. Left undone deliberately: nothing here touches the old contracts, which stay readable and unfunded at 0 mints.
