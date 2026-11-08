const { ethers } = require('ethers');
const fs = require('fs');

const RPC = 'https://base-rpc.publicnode.com';
const TREASURY = '0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747';
const ROYALTY_RECEIVER = '0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747';
const AASA = '0xe4ded569fff9bfd80b131b6ac0d6d0874da5aba3';
const BASE_URI = 'https://meta-phi-umber.vercel.app/meta/';
const MIN_DELAY = 172800; // 2 days

const abi = n => JSON.parse(fs.readFileSync(`build/${n}.json`, 'utf8'));

(async () => {
  const burner = JSON.parse(fs.readFileSync('/app/conversations/6ac7cee2e53924ef39e93934/aasa-base/deploy/burner.json', 'utf8'));
  const pk = burner.priv.startsWith('0x') ? burner.priv : '0x' + burner.priv;
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(pk, provider);
  const startBal = await provider.getBalance(wallet.address);
  console.log('deployer:', wallet.address);
  console.log('balance :', ethers.formatEther(startBal), 'ETH');

  const out = { deployer: wallet.address, chainId: 8453, ts: new Date().toISOString() };
  const gasPrice = (await provider.getFeeData()).gasPrice;
  console.log('gasPrice:', ethers.formatUnits(gasPrice, 'gwei'), 'gwei');

  async function deploy(name, args) {
    const a = abi(name);
    const f = new ethers.ContractFactory(a.abi, a.bytecode, wallet);
    console.log(`\n>> deploying ${name} ...`);
    const c = await f.deploy(...args, { gasPrice });
    await c.waitForDeployment();
    const addr = await c.getAddress();
    const rec = await provider.getTransactionReceipt(c.deploymentTransaction().hash);
    console.log(`   ${name}: ${addr}  (gas ${rec.gasUsed})`);
    out[name] = { address: addr, tx: c.deploymentTransaction().hash, gasUsed: rec.gasUsed.toString() };
    return addr;
  }

  // 1. Timelock (pool custody)
  const timelock = await deploy('PoolTimelock', [MIN_DELAY]);
  // 2. NFT
  const nft = await deploy('AuthorizedAvatars', [TREASURY, ROYALTY_RECEIVER, BASE_URI]);
  // 3. Redeemer wired to NFT + AASA
  const redeemer = await deploy('AvatarRedeemer', [nft, AASA]);

  // sanity reads
  const nftC = new ethers.Contract(nft, abi('AuthorizedAvatars').abi, provider);
  const redC = new ethers.Contract(redeemer, abi('AvatarRedeemer').abi, provider);
  const tlC = new ethers.Contract(timelock, abi('PoolTimelock').abi, provider);
  out.verify = {
    nft_name: await nftC.name(),
    nft_maxSupply: (await nftC.MAX_SUPPLY()).toString(),
    nft_treasury: await nftC.treasury(),
    nft_royaltyBps: (await nftC.royaltyBps()).toString(),
    nft_advanceBps: (await nftC.advanceThresholdBps()).toString(),
    phase0_price: (await nftC.phasePrice(0)).toString(),
    phase4_price: (await nftC.phasePrice(4)).toString(),
    phase0_redeem: (await nftC.phaseRedeem(0)).toString(),
    phase4_redeem: (await nftC.phaseRedeem(4)).toString(),
    redeemer_nft: await redC.nft(),
    redeemer_aasa: await redC.aasa(),
    timelock_delay: (await tlC.minDelay()).toString(),
    timelock_admin: await tlC.admin()
  };
  const endBal = await provider.getBalance(wallet.address);
  out.spentETH = ethers.formatEther(startBal - endBal);
  console.log('\n=== VERIFY ===');
  console.log(JSON.stringify(out.verify, null, 1));
  console.log('total spent:', out.spentETH, 'ETH');
  console.log('remaining  :', ethers.formatEther(endBal), 'ETH');
  fs.writeFileSync('deployment.json', JSON.stringify(out, null, 1));
  console.log('\nsaved deployment.json');
})().catch(e => { console.error('FAIL:', e.shortMessage || e.message); process.exit(1); });
