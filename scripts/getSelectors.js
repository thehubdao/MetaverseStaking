const Implementation = artifacts.require("MetaverseStaking");
const ProxyContract  = artifacts.require("StakingProxy");
const { keccak256 }  = require('ethereum-cryptography/keccak');
const { ethers }     = require('ethers');

function getSelectors (contract) {
  console.log(contract.abi);
    const selectors = contract.abi.reduce((acc, val) => {
      if (val.type === 'function') {
        let signature = val.name + '(';
        for(let i = 0; i < val.inputs.length; i++) {
            signature = signature + val.inputs[i].type
            if(i != val.inputs.length - 1) signature = signature + ',';
        }
        signature = signature + ')';
        console.log(signature);
        
        acc.push(
          Buffer.from(ethers.utils.solidityKeccak256(
            ['string'],
            [signature],
        ).slice(2), 'hex').toString('hex').slice(0, 8)
      );
        return acc
      } else {
        return acc
      }
    }, [])
    return selectors
}

function checkSelectorClash() {
    const ImpSelectors = getSelectors(Implementation);
    const ProxySelectors = getSelectors(ProxyContract);
    for(let i = 0; i < ProxySelectors.length; i++) {
        for(let k = 0; k < ImpSelectors.length; k++) {
            console.log(ImpSelectors[k] == ProxySelectors[i]);
            if(ImpSelectors[k] == ProxySelectors[i]) throw "clash found. \n proxyIndex: " + i + "\n impIndex: " + k
        }
    }
    console.log("no clashes found")
}
checkSelectorClash();
process.exit(0);