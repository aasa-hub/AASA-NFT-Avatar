const { expect } = require("chai");
const { ethers } = require("hardhat");

const P = [500000000000000n, 1200000000000000n, 2900000000000000n, 7000000000000000n, 16800000000000000n];
const R = [115000n, 276000n, 667000n, 1611000n, 3866000n].map(x => x * 10n ** 18n);

describe("AuthorizedAvatars v3 funding gate", () => {
  let nft, aasa, pool, owner, treasury, buyers;

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    [owner, treasury] = signers;
    pool = signers[19];                       // stands in for the redeemer contract
    buyers = signers.slice(2, 12);            // 10 wallets x 20 cap = 200 tier-1 mints
    const M = await ethers.getContractFactory("MockAASA");
    aasa = await M.deploy();
    const N = await ethers.getContractFactory("AuthorizedAvatarsV3");
    nft = await N.deploy(treasury.address, treasury.address, "https://x/meta/", await aasa.getAddress(), pool.address);
  });

  // mint n tier-1 tokens, respecting the 20-per-wallet cap; returns the last tx
  const mintTier1 = async (n) => {
    let last;
    for (let i = 0; i < n; i++) last = await nft.connect(buyers[Math.floor(i / 20)]).mint(0, { value: P[0] });
    return last;
  };

  it("tier 1 opens at deploy, tier 2 does not", async () => {
    expect(await nft.phaseOpen(0)).to.equal(true);
    expect(await nft.phaseOpen(1)).to.equal(false);
  });

  it("20 mints per wallet cap still applies on tier 1", async () => {
    for (let i = 0; i < 20; i++) await nft.connect(buyers[0]).mint(0, { value: P[0] });
    await expect(nft.connect(buyers[0]).mint(0, { value: P[0] }))
      .to.be.revertedWithCustomError(nft, "WalletCapReached");
  });

  it("crossing 160 mints does NOT open tier 2 while the pool is short", async () => {
    await aasa.mint(pool.address, 23000000n * 10n ** 18n);      // exactly tier-1 money
    await mintTier1(160);
    expect(await nft.phaseMinted(0)).to.equal(160);
    expect(await nft.phaseOpen(1)).to.equal(false);
    expect(await nft.fundingShortfallFor(1)).to.equal(R[1] * 200n - 23000000n * 10n ** 18n);
    await expect(nft.connect(buyers[0]).mint(1, { value: P[1] }))
      .to.be.revertedWithCustomError(nft, "PhaseNotOpen");
  });

  it("shouts PhaseUnlockDeferred on the crossing mint when short", async () => {
    await aasa.mint(pool.address, 23000000n * 10n ** 18n);
    const tx = await mintTier1(160);
    const rc = await tx.wait();
    const ev = rc.logs.map(l => { try { return nft.interface.parseLog(l); } catch { return null; } })
      .find(e => e && e.name === "PhaseUnlockDeferred");
    expect(ev, "PhaseUnlockDeferred should fire on the 160th mint").to.not.equal(undefined);
    expect(ev.args[0]).to.equal(1n);
    expect(ev.args[1]).to.equal(R[1] * 200n);
    expect(ev.args[2]).to.equal(23000000n * 10n ** 18n);
  });

  it("topping the pool then calling unlockNextPhase opens tier 2", async () => {
    await aasa.mint(pool.address, 23000000n * 10n ** 18n);
    await mintTier1(160);
    await aasa.mint(pool.address, R[1] * 200n);                 // top up 55.2M
    await expect(nft.connect(buyers[3]).unlockNextPhase()).to.emit(nft, "PhaseOpened").withArgs(1);
    expect(await nft.phaseOpen(1)).to.equal(true);
    await nft.connect(buyers[0]).mint(1, { value: P[1] });
    expect(await nft.phaseMinted(1)).to.equal(1);
  });

  it("unlockNextPhase does nothing before the sales threshold, even with money", async () => {
    await aasa.mint(pool.address, 500000000n * 10n ** 18n);
    await mintTier1(100);
    await expect(nft.unlockNextPhase()).to.not.emit(nft, "PhaseOpened");
    expect(await nft.phaseOpen(1)).to.equal(false);
  });

  it("only one tier opens per crossing; the next needs its own 160 mints", async () => {
    await aasa.mint(pool.address, (R[1] + R[2]) * 200n);
    await mintTier1(160);
    await nft.unlockNextPhase();
    expect(await nft.phaseOpen(1)).to.equal(true);
    expect(await nft.phaseOpen(2)).to.equal(false);
  });

  it("gate can be switched off by the owner as an escape hatch", async () => {
    await nft.setFundingGate(false);
    await mintTier1(160);
    expect(await nft.phaseOpen(1)).to.equal(true);
  });

  it("only the owner can flip the gate or sweep", async () => {
    await expect(nft.connect(buyers[0]).setFundingGate(false)).to.be.revertedWithCustomError(nft, "NotOwner");
    await expect(nft.connect(buyers[0]).sweepStuck()).to.be.revertedWithCustomError(nft, "NotOwner");
  });

  it("mint fee lands in treasury and royalty is 2.5% to treasury", async () => {
    const before = await ethers.provider.getBalance(treasury.address);
    await nft.connect(buyers[0]).mint(0, { value: P[0] });
    expect(await ethers.provider.getBalance(treasury.address)).to.equal(before + P[0]);
    const [recv, amt] = await nft.royaltyInfo(1, ethers.parseEther("1"));
    expect(recv).to.equal(treasury.address);
    expect(amt).to.equal(ethers.parseEther("0.025"));
  });

  it("underpay and overpay are refused", async () => {
    await expect(nft.connect(buyers[0]).mint(0, { value: P[0] - 1n })).to.be.revertedWithCustomError(nft, "Underpaid");
    await expect(nft.connect(buyers[0]).mint(0, { value: P[0] + 1n })).to.be.revertedWithCustomError(nft, "Overpaid");
  });

  it("constructor rejects a zero funding address", async () => {
    const N = await ethers.getContractFactory("AuthorizedAvatarsV3");
    await expect(N.deploy(treasury.address, treasury.address, "", ethers.ZeroAddress, pool.address))
      .to.be.revertedWithCustomError(N, "FundingAddressZero");
    await expect(N.deploy(treasury.address, treasury.address, "", await aasa.getAddress(), ethers.ZeroAddress))
      .to.be.revertedWithCustomError(N, "FundingAddressZero");
  });

  it("tokenURI is baseURI + id and reverts for unminted ids", async () => {
    await nft.connect(buyers[0]).mint(0, { value: P[0] });
    expect(await nft.tokenURI(1)).to.equal("https://x/meta/1");
    await expect(nft.tokenURI(2)).to.be.revertedWithCustomError(nft, "NotMinted");
  });
});
