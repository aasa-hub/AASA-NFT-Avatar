const solc=require('solc'), fs=require('fs'), path=require('path');
const files=fs.readdirSync('contracts').filter(f=>f.endsWith('.sol'));
const sources={}; files.forEach(f=>sources[f]={content:fs.readFileSync(path.join('contracts',f),'utf8')});
const input={language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:20000},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
const out=JSON.parse(solc.compile(JSON.stringify(input)));
let fail=false;
(out.errors||[]).forEach(e=>{ if(e.severity==='error'){fail=true;console.log('ERROR:',e.formattedMessage);} else console.log('warn:',e.message.slice(0,120)); });
if(!fail){
  fs.mkdirSync('build',{recursive:true});
  for(const f of files){
    const c=out.contracts[f];
    for(const name in c){
      const cc=c[name];
      const byteLen=cc.evm.deployedBytecode.object.length/2;
      console.log(`${name}: deployed ${byteLen} bytes`);
      fs.writeFileSync(`build/${name}.json`,JSON.stringify({abi:cc.abi,bytecode:'0x'+cc.evm.bytecode.object},null,1));
    }
  }
}
