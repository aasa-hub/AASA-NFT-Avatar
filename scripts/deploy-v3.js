/**
 * Deploy the v3 gated NFT plus a matching redeemer.
 *
 *   node deploy-v3.js            # preflight: prints the plan and the exact gas bill
 *   node deploy-v3.js --go       # deploys NFT, redeemer, then binds the pool once
 *
 * Order matters: the redeemer's constructor takes the NFT address, and the NFT's gate
 * reads the redeemer, which can only be bound after the redeemer exists.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const AASA = "0xe4deD569fFf9bFD80b131b6aC0D6D0874dA5ABa3";
const TREASURY = "0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747";
const BASE_URI = process.env.BASE_URI || "https://authorized-avatars.vercel.app/meta/";
const KEY_FILE = "/app/conversations/6ac7cee2e53924ef39e93934/aasa-base/deploy/burner.json";
const BUILD = "/app/conversations/6acd9cee540df00fc33c4e3c/aa-v2/build";
const OUT = path.join(__dirname, "deployment-v3.json");

const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

(async () => {
  const go = process.argv.includes("--go");
  const p = new ethers.JsonRpcProvider("https://mainnet.base.org");
  const kf = load(KEY_FILE);
  const pk = kf.priv || kf.privateKey || kf.private_key || kf.key;
  const w = new ethers.Wallet(pk.startsWith("0x") ? pk : "0x" + pk, p);
  const nftArt = load(path.join(BUILD, "AuthorizedAvatarsV3.json"));
  const redArt = load(path.join(BUILD, "AvatarRedeemer.json"));
  const nftF = new ethers.ContractFactory(nftArt.abi, nftArt.bytecode, w);
  const redF = new ethers.ContractFactory(redArt.abi, redArt.bytecode, w);

  const nftArgs = [TREASURY, TREASURY, BASE_URI, AASA];
  const nftTx = await nftF.getDeployTransaction(...nftArgs);
  const nftGas = await p.estimateGas({ ...nftTx, from: w.address });
  const redTx = await redF.getDeployTransaction(ethers.ZeroAddress, AASA);
  const redGas = await p.estimateGas({ ...redTx, from: w.address });
  const fee = await p.getFeeData();
  const gasPrice = fee.maxFeePerGas || fee.gasPrice;
  const bindGas = 60000n;
  const total = (nftGas + redGas + bindGas) * gasPrice;
  const bal = await p.getBalance(w.address);

  console.log("deployer    :", w.address);
  console.log("nft gas     :", nftGas.toString(), "| redeemer gas:", redGas.toString(), "| bind:", bindGas.toString());
  console.log("gas price   :", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("total cost  :", ethers.formatEther(total), "ETH");
  console.log("balance     :", ethers.formatEther(bal), "ETH");
  const short = total > bal ? total - bal : 0n;
  console.log(short ? `SHORT by ${ethers.formatEther(short)} ETH` : "balance covers the deploy");
  if (!go) { console.log("\ndry run: add --go to deploy"); return; }
  if (short) throw new Error(`need ${ethers.formatEther(short)} ETH more on ${w.address}`);

  const nft = await nftF.deploy(...nftArgs);
  await nft.waitForDeployment();
  const nftAddr = await nft.getAddress();
  console.log("NFT deployed       :", nftAddr);

  const red = await redF.deploy(nftAddr, AASA);
  await red.waitForDeployment();
  const redAddr = await red.getAddress();
  console.log("redeemer deployed  :", redAddr);

  const bind = await nft.setRedeemPool(redAddr);
  await bind.wait();
  console.log("pool bound         :", await nft.redeemPool());

  const record = {
    deployedAt: new Date().toISOString(),
    network: "base-8453",
    nft: nftAddr,
    redeemer: redAddr,
    aasa: AASA,
    treasury: TREASURY,
    baseURI: BASE_URI,
    nftTx: nft.deploymentTransaction().hash,
    redeemerTx: red.deploymentTransaction().hash,
    bindTx: bind.hash,
    gate: { type1Redeem: "115000", note: "fund the redeemer before tier 1 can be redeemed" },
  };
  fs.writeFileSync(OUT, JSON.stringify(record, null, 2));
  console.log("written:", OUT);
})().catch((e) => { console.error("FAILED:", e.shortMessage || e.message); process.exit(1); });
