# Authorized Avatars — Live Contracts & Redemption Rules (v3, 2026-10-29)

## Authoritative addresses (Base mainnet)

| Contract | Address |
|---|---|
| **NFT** | `0x96b1394Bd272C36a2078D1cbb1Fc89F8F68b1Be2` |
| **Redeemer (instant)** | `0x0De77EE57C7e53cc8DA90381faa65Bab710201e8` |
| AASA token | `0xe4deD569fFf9bFD80b131b6aC0D6D0874dA5ABa3` |
| Treasury (100% of mint ETH) | `0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747` |
| Deployer | `0xB3C437558A30Dd92eD55a6A18DFd6c6540EFf4cB` |
| PoolTimelock (optional custody) | `0x4B89C6a405340f09aAf54319f4597dD7a6151569` |

Superseded, unused, hold nothing: NFT `0xe7b7eb91…3f92`, Redeemer `0x9345cb5E…85a2`, Redeemer `0x62F88B8b…E50E`.

## Redemption rules (final)

| Rule | Implementation |
|---|---|
| **Instant** | No phase gate, no 48h wait. Redeemable the moment the token is minted. |
| **Must hold it** | `require(nft.ownerOf(tokenId) == msg.sender)` — the connected wallet must own the token at claim time. |
| **One time per NFT** | `redeemed[tokenId]` is permanent and survives every transfer. |
| **Sellable on marketplaces** | Standard ERC-721 with EIP-2981 2.5% royalty. The NFT is never burned. |
| **Stakeable later** | Because it is never burned, every token remains stakeable when staking ships. |
| **Pool is one-way** | `rescue()` cannot touch AASA — the owner can never withdraw the pool. AASA leaves only through `redeem()`. |
| **Backing visible** | `redeemer.poolBalance()` is public; `claimable(tokenId)` shows the exact amount. |

### Behaviour on secondary sale
Redemption rights travel with the token: an **unredeemed** NFT sold on a marketplace lets the buyer redeem it. Once redeemed, the flag is permanent — the buyer of a redeemed NFT can never claim again. This is the one-time guarantee, independent of who holds it.

## Amounts per tier (fixed)

| Tier | Price | Redeem | Tranche for 200 |
|---|---|---|---|
| P1 | 0.0005 ETH | 115,000 AASA | 23,000,000 |
| P2 | 0.0012 ETH | 276,000 | 55,200,000 |
| P3 | 0.0029 ETH | 667,000 | 133,400,000 |
| P4 | 0.0070 ETH | 1,611,000 | 322,200,000 |
| P5 | 0.0168 ETH | 3,866,000 | 773,200,000 |
| **Total** | | | **1,307,000,000** |

Held at treasury: 1,234,684,226 → shortfall **72,315,774 AASA** (only matters when P5 sells out; redemptions pause rather than underpay).

## Funding — now a single direct transfer

Because redemption is instant, the pool must already be sitting in the redeemer **before** mints happen. No schedule, no delay:

```
treasury 0x1cEc --AASA.transfer(redeemer, amount)--> redeemer
```

Recommended sequence — fund one tier ahead, never the whole pool:

| When | Transfer to redeemer | Covers |
|---|---|---|
| Before mint opens | 23,000,000 | all 200 P1 redemptions |
| P1 reaches 80% (P2 opens) | +55,200,000 | P2 |
| P2 reaches 80% | +133,400,000 | P3 |
| P3 reaches 80% | +322,200,000 | P4 |
| P4 reaches 80% | +773,200,000 | P5 (needs the 72.3M top-up first) |

Peak exposure stays lower than funding everything up front, and because AASA cannot be pulled back out of the redeemer, each tranche is permanently committed to holders once sent — that is the credibility guarantee, without any waiting.

**If a tranche is not yet funded:** `redeem()` reverts with `InsufficientPool` and resumes working the instant AASA arrives. No funds are at risk; holders just retry.

## Optional timelock use
The PoolTimelock is no longer on the redemption path. Keep it only if you want a delayed-release reserve (e.g. the P5 tranche parked under a 48h schedule as a safety buffer). Otherwise it can sit unused.

## Still pending
- Basescan verification of NFT v2.1 and Redeemer v3 (integration credits exhausted until Nov 1).
- Site rebuild of authorized-avatars.vercel.app against `0x96b1394B…1Be2` + `0x0De77EE5…01e8`.
- Staking contract (stage 4).
