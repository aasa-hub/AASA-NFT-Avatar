const { ethers } = require('ethers');
const fs=require('fs');
const RPC='https://mainnet.base.org';
const NFT='0x96b1394Bd272C36a2078D1cbb1Fc89F8F68b1Be2';
const RED='0x62F88B8b6A8fcc8Ab1BBd15E70C9E75eFF09E50E';
const abi=n=>JSON.parse(fs.readFileSync(`build/${n}.json`,'utf8'));
(async()=>{
  const p=new ethers.JsonRpcProvider(RPC);
  const n=new ethers.Contract(NFT,abi('AuthorizedAvatars').abi,p);
  const r=new ethers.Contract(RED,abi('AvatarRedeemer').abi,p);
  const fmt=x=>x.toString();
  console.log('NFT', NFT, '| name', await n.name(), '| symbol', await n.symbol());
  console.log('treasury:', await n.treasury());
  console.log('royalty bps:', fmt(await n.royaltyBps()), '| advance bps:', fmt(await n.advanceThresholdBps()));
  console.log('max supply:', fmt(await n.MAX_SUPPLY()), '| total minted:', fmt(await n.totalMinted()));
  for(let i=0;i<5;i++){
    const info=await n.phaseInfo(i);
    const priceEth=ethers.formatEther(info[0]);
    const redeem=ethers.formatEther(info[5]);
    console.log(`phase ${i}: price ${priceEth} ETH | minted ${fmt(info[1])}/200 | open ${info[3]} | finished ${info[4]} | redeem ${Number(redeem).toLocaleString()} AASA | weight ${fmt(info[6])}`);
  }
  console.log('\nredeemer -> nft', await r.nft(), '| aasa', await r.aasa());
  console.log('pool balance:', ethers.formatEther(await r.poolBalance()), 'AASA');
  console.log('paused:', await r.paused());
  const rec={nft:NFT,redeemer:RED,timelock:'0x4B89C6a405340f09aAf54319f4597dD7a6151569',aasa:'0xe4deD569fFf9bFD80b131b6aC0D6D0874dA5ABa3',treasury:'0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747',deployer:'0xB3C437558A30Dd92eD55a6A18DFd6c6540EFf4cB',deployed:'2026-10-29'};
  fs.writeFileSync('deployment-v2.json',JSON.stringify(rec,null,1));
  console.log('\nsaved deployment-v2.json');
})().catch(e=>{console.error('FAIL',e.shortMessage||e.message);process.exit(1);});
