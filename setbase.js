const { ethers } = require('ethers');
const fs = require('fs');
const RPC = 'https://mainnet.base.org';
const NFT = '0x96b1394Bd272C36a2078D1cbb1Fc89F8F68b1Be2';
const NEW_BASE = 'https://authorized-avatars.vercel.app/meta/';

(async () => {
  const d = JSON.parse(fs.readFileSync('/app/conversations/6ac7cee2e53924ef39e93934/aasa-base/deploy/burner.json', 'utf8'));
  const pk = d.priv.startsWith('0x') ? d.priv : '0x' + d.priv;
  const w = new ethers.Wallet(pk, new ethers.JsonRpcProvider(RPC));
  const nft = new ethers.Contract(NFT, [
    'function baseURI() view returns (string)',
    'function setBaseURI(string)',
    'function owner() view returns (address)'
  ], w);

  const before = await nft.baseURI();
  console.log('current baseURI:', before);
  console.log('owner         :', await nft.owner());
  console.log('caller        :', w.address);
  console.log('balance       :', ethers.formatEther(await w.provider.getBalance(w.address)), 'ETH');

  if (before === NEW_BASE) { console.log('already set — nothing to do'); return; }

  const fee = await w.provider.getFeeData();
  const gp = fee.gasPrice && fee.gasPrice > 0n ? fee.gasPrice : 10_000_000n;
  console.log('gasPrice      :', ethers.formatUnits(gp, 'gwei'), 'gwei');

  const tx = await nft.setBaseURI(NEW_BASE, { gasPrice: gp });
  console.log('tx:', tx.hash);
  const rc = await tx.wait();
  console.log('mined in block', rc.blockNumber, '| gas used', rc.gasUsed.toString(), '| cost', ethers.formatEther(rc.gasUsed * gp), 'ETH');

  const after = await nft.baseURI();
  console.log('new baseURI   :', after);
  console.log(after === NEW_BASE ? 'SUCCESS' : 'MISMATCH');
  console.log('balance now   :', ethers.formatEther(await w.provider.getBalance(w.address)), 'ETH');
})().catch(e => console.log('FAIL:', e.message.slice(0, 300)));
