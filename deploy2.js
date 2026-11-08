const { ethers } = require('ethers');
const fs = require('fs');
const RPC='https://mainnet.base.org';
const TREASURY='0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747';
const AASA='0xe4ded569fff9bfd80b131b6ac0d6d0874da5aba3';
const BASE_URI='https://meta-phi-umber.vercel.app/meta/';
const TIMELOCK='0x4B89C6a405340f09aAf54319f4597dD7a6151569';
const abi=n=>JSON.parse(fs.readFileSync(`build/${n}.json`,'utf8'));
(async()=>{
  const b=JSON.parse(fs.readFileSync('/app/conversations/6ac7cee2e53924ef39e93934/aasa-base/deploy/burner.json','utf8'));
  const provider=new ethers.JsonRpcProvider(RPC);
  const w=new ethers.Wallet(b.priv.startsWith('0x')?b.priv:'0x'+b.priv, provider);
  const start=await provider.getBalance(w.address);
  console.log('deployer',w.address,'| balance',ethers.formatEther(start));
  let gp=(await provider.getFeeData()).gasPrice; if(!gp) gp=BigInt(10_000_000); console.log('raw gp',gp.toString());
  console.log('gasPrice',ethers.formatUnits(gp,'gwei'),'gwei');
  const out={deployer:w.address,chainId:8453,ts:new Date().toISOString()};
  async function dep(name,args){
    const a=abi(name); const f=new ethers.ContractFactory(a.abi,a.bytecode,w);
    const nonce=await provider.getTransactionCount(w.address,'pending');
    const c=await f.deploy(...args,{gasPrice:gp,nonce}); await c.waitForDeployment();
    const addr=await c.getAddress(); const r=await provider.getTransactionReceipt(c.deploymentTransaction().hash);
    console.log(`${name}: ${addr} (gas ${r.gasUsed})`);
    out[name]={address:addr,tx:c.deploymentTransaction().hash,gasUsed:r.gasUsed.toString()};
    return addr;
  }
  const nft=await dep('AuthorizedAvatars',[TREASURY,TREASURY,BASE_URI]);
  const red=await dep('AvatarRedeemer',[nft,AASA]);
  const n=new ethers.Contract(nft,abi('AuthorizedAvatars').abi,provider);
  const r=new ethers.Contract(red,abi('AvatarRedeemer').abi,provider);
  const t=new ethers.Contract(TIMELOCK,abi('PoolTimelock').abi,provider);
  out.verify={
    maxSupply:(await n.MAX_SUPPLY()).toString(),
    phase0:await n.phaseInfo(0),
    phase1:await n.phaseInfo(1),
    redeemP0:(await n.phaseRedeem(0)).toString(),
    redeemP4:(await n.phaseRedeem(4)).toString(),
    phase0Open:await n.phaseOpen(0),
    phase1Open:await n.phaseOpen(1),
    phase0Finished:await n.phaseFinished(0),
    redeemerNft:await r.nft(),
    redeemerAasa:await r.aasa(),
    timelockDelay:(await t.minDelay()).toString(),
    mintFeeRoute:await n.treasury(),
    royalty:(await n.royaltyBps()).toString()
  };
  const end=await provider.getBalance(w.address);
  out.spent=ethers.formatEther(start-end);
  console.log('\n=== VERIFY ===');
  for(const [k,v] of Object.entries(out.verify)) console.log(k+':', JSON.stringify(v));
  console.log('spent',out.spent,'ETH | left',ethers.formatEther(end),'ETH');
  fs.writeFileSync('deployment-v2.json',JSON.stringify(out,null,1));
})().catch(e=>{console.error('FAIL:',e.shortMessage||e.message);process.exit(1);});
