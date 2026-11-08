const {ethers}=require('ethers');
const NFT='0x96b1394Bd272C36a2078D1cbb1Fc89F8F68b1Be2';
const RED='0x0De77EE57C7e53cc8DA90381faa65Bab710201e8';
(async()=>{
  const p=new ethers.JsonRpcProvider('https://mainnet.base.org');
  const red=new ethers.Contract(RED,[
    'function poolBalance() view returns (uint256)',
    'function paused() view returns (bool)',
    'function redeemCount() view returns (uint256)',
    'function phaseRedeem(uint256) view returns (uint256)',
    'function nft() view returns (address)',
    'function aasa() view returns (address)'
  ],p);
  const nft=new ethers.Contract(NFT,[
    'function totalMinted() view returns (uint256)',
    'function maxSupply() view returns (uint256)',
    'function phaseInfo(uint256) view returns (uint256 price,uint256 minted,uint256 cap,uint256 redeemAmount,uint256 weight,bool open,bool finished)',
    'function phaseOpen(uint256) view returns (bool)'
  ],p);
  const pool=await red.poolBalance();
  console.log('REDEEMER');
  console.log('  pool AASA      :',ethers.formatUnits(pool,18));
  console.log('  paused         :',await red.paused());
  console.log('  redeems so far :',(await red.redeemCount()).toString());
  console.log('  nft wired      :',await red.nft());
  console.log('  aasa wired     :',await red.aasa());
  for(let i=0;i<5;i++) console.log('  phase',i,'redeem =',ethers.formatUnits(await red.phaseRedeem(i),18),'AASA');
  console.log('  P1 capacity    :',Number(ethers.formatUnits(pool,18))/115000,'NFTs');
  console.log('\nNFT');
  console.log('  minted         :',(await nft.totalMinted()).toString(),'/ 1000');
  for(let i=0;i<5;i++){
    const pi=await nft.phaseInfo(i);
    let open=false;
    try{ open=await nft.phaseOpen(i); }catch(e){}
    console.log(`  tier ${i}: price ${ethers.formatEther(pi.price)} ETH | minted ${pi.minted}/${pi.cap} | open ${open}`);
  }
})().catch(e=>console.log('ERR',e.message.slice(0,300)));
