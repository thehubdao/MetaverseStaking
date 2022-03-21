const ERC20Staking = artifacts.require('ERC20SandMock');
const ERC20Rewards = artifacts.require('ERC20RewardMock');
const MetaverseStakingNative  = artifacts.require('MetaverseStakingNative')
const Proxy        = artifacts.require('MVSProxy');

const ether = require('@openzeppelin/test-helpers/src/ether');
const { ethers }   = require('ethers');

const upgrader = "0x1670035057CCFC8D8a05c0A9EeB4a0c9071efe14";
const initializeSelector = "0x67b57ecc";
const StakingConfig = {
  epocheStart: 0,
  epocheLength: 36000,
  withdrawLength: 50400,
  rewardPerTokenAndYear: 31449600,
  maximumStakingAmountInEthers: 1000000,
  name: "St NFT",
  symbol: "LPNFT",
  uri: "ipfs://Qmc1JaQKAfvsyS55YTXCGbrnP8R2oeGMcYC96RBuxHS9ff"
}

module.exports = async function(deployer, network, accounts) {
  let abiCoder = new ethers.utils.AbiCoder;

  let imp = await MetaverseStakingNative.deployed();
  let rewardToken = await ERC20Rewards.deployed();

  const initData = initializeSelector + abiCoder.encode(
    ["address","uint256","uint256","uint256","uint256","uint256","tuple(string name, string symbol, string uri)"],
    [
        rewardToken.address,
        StakingConfig.epocheStart,
        StakingConfig.epocheLength,
        StakingConfig.withdrawLength,
        StakingConfig.rewardPerTokenAndYear,
        StakingConfig.maximumStakingAmountInEthers,
        {
          name: StakingConfig.name,
          symbol: StakingConfig.symbol,
          uri: StakingConfig.uri
        }
    ]).slice(2);
  let MVS = await deployer.deploy(Proxy, imp.address, upgrader, initData);
  await rewardToken.transfer(MVS.address, ether('1000000000'));
}
