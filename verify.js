const fs = require('fs');
const { execSync } = require('child_process');
const { ethers } = require('ethers');

const API = 'https://api.etherscan.io/v2/api';
const KEY = process.env.ETHERSCAN_API_KEY;
const COMPILER = 'v0.8.24+commit.e11b9ed9';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const targets = [
  {
    address: '0x96b1394Bd272C36a2078D1cbb1Fc89F8F68b1Be2',
    name: 'AuthorizedAvatars.sol:AuthorizedAvatars',
    args: ['0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747', '0x1cEcDFbb8507800e34e07dD4723AbdF8ea07c747', 'https://meta-phi-umber.vercel.app/meta/'],
    types: ['address', 'address', 'string']
  },
  {
    address: '0x0De77EE57C7e53cc8DA90381faa65Bab710201e8',
    name: 'AvatarRedeemer.sol:AvatarRedeemer',
    args: ['0x96b1394Bd272C36a2078D1cbb1Fc89F8F68b1Be2', '0xe4ded569fff9bfd80b131b6ac0d6d0874da5aba3'],
    types: ['address', 'address']
  }
];

function get(params) {
  const qs = new URLSearchParams({ chainid: '8453', apikey: KEY, ...params }).toString();
  const out = execSync(`curl -s --max-time 45 -A "${UA}" -H "Accept: application/json" -H "Origin: https://basescan.org" -H "Referer: https://basescan.org/" "${API}?${qs}"`, { encoding: 'utf8' });
  return JSON.parse(out);
}

function post(form) {
  fs.writeFileSync('/tmp/src.json', form.sourceCode);
  const cmd = `curl -s --max-time 90 -X POST -A "${UA}" -H "Accept: application/json" -H "Origin: https://basescan.org" -H "Referer: https://basescan.org/" "${API}?chainid=8453&apikey=${KEY}" ` +
    `--data-urlencode "module=contract" --data-urlencode "action=verifysourcecode" ` +
    `--data-urlencode "codeformat=solidity-standard-json-input" ` +
    `--data-urlencode "sourceCode@/tmp/src.json" ` +
    `--data-urlencode "contractaddress=${form.contractaddress}" ` +
    `--data-urlencode "contractname=${form.contractname}" ` +
    `--data-urlencode "compilerversion=${COMPILER}" ` +
    `--data-urlencode "constructorArguements=${form.constructorArguements}"`;
  const out = execSync(cmd, { encoding: 'utf8' });
  return JSON.parse(out);
}

function buildInput() {
  const sources = {};
  for (const f of fs.readdirSync('contracts').filter(f => f.endsWith('.sol'))) {
    sources[f] = { content: fs.readFileSync(`contracts/${f}`, 'utf8') };
  }
  return JSON.stringify({
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 20000 },
      evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  });
}

(async () => {
  if (!KEY) return console.log('NO KEY');
  const sourceCode = buildInput();
  for (const t of targets) {
    console.log('\n== ' + t.address);
    const b = get({ module: 'contract', action: 'getsourcecode', address: t.address });
    const r0 = Array.isArray(b.result) ? b.result[0] : null;
    if (r0 && r0.SourceCode && r0.SourceCode.length > 10) {
      console.log('already verified:', r0.ContractName);
      continue;
    }
    const cargs = ethers.AbiCoder.defaultAbiCoder().encode(t.types, t.args).slice(2);
    const out = post({
      sourceCode,
      contractaddress: t.address,
      contractname: t.name,
      constructorArguements: cargs
    });
    console.log('submit:', out.status, out.message, String(out.result).slice(0, 200));
    if (out.status === '1') {
      const guid = out.result;
      for (let i = 0; i < 10; i++) {
        execSync('sleep 6');
        const st = get({ module: 'contract', action: 'checkverifystatus', guid });
        const msg = String(st.result || st.message);
        console.log('  poll', i + 1, msg.slice(0, 160));
        if (/Pass|Already Verified/i.test(msg)) break;
        if (/Fail/i.test(msg)) break;
      }
    }
  }
})();
