const RPC="https://mainnet.base.org", NFT="0x96b1394Bd272C36a2078D1cbb1Fc89F8F68b1Be2", RED="0x0De77EE57C7e53cc8DA90381faa65Bab710201e8";
const SEL={MAX_SUPPLY:"0x32cb6b0c",totalMinted:"0xa2309ff8",phasePrice:"0x50faec2e",phaseMinted:"0x6430ab8c",phaseOpen:"0xcddefd2b",phaseFinished:"0x0bf542c9",phaseRedeem:"0x0866c3f2",poolBalance:"0x96365d44",redeemCount:"0x126717cd",royaltyBps:"0xc63adb2b"};
const pad=a=>a.toLowerCase().replace(/^0x/,"").padStart(64,"0");
const hexN=n=>"0x"+BigInt(n).toString(16);
const toBig=h=>(h&&h!=="0x")?BigInt(h):0n;
async function rpc(m,p){const r=await fetch(RPC,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})});const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result;}
const call=async(to,d)=>toBig(await rpc("eth_call",[{to,data:d},"latest"]));
(async()=>{
 console.log("maxSupply",await call(NFT,SEL.MAX_SUPPLY));
 console.log("minted",await call(NFT,SEL.totalMinted));
 console.log("royaltyBps",await call(NFT,SEL.royaltyBps));
 const pool=await call(RED,SEL.poolBalance);
 console.log("pool AASA",(Number(pool)/1e18).toLocaleString());
 for(let i=0;i<5;i++){
  const [price,pm,open,fin,rw]=await Promise.all([
   call(NFT,SEL.phasePrice+pad(hexN(i))),call(NFT,SEL.phaseMinted+pad(hexN(i))),
   call(NFT,SEL.phaseOpen+pad(hexN(i))),call(NFT,SEL.phaseFinished+pad(hexN(i))),
   call(RED,SEL.phaseRedeem+pad(hexN(i)))]);
  console.log(`tier${i+1}: price ${Number(price)/1e18} ETH | ${pm}/200 | open ${open===1n} | finished ${fin===1n} | redeem ${(Number(rw)/1e18).toLocaleString()} AASA`);
 }
})();
