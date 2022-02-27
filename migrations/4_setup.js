const ERC20Staking = artifacts.require('ERC20SandMock');
const ERC20Rewards = artifacts.require('ERC20RewardMock');
const MetaStaking  = artifacts.require('MetaverseStaking')
const Proxy        = artifacts.require('MVSProxy');

const ether = require('@openzeppelin/test-helpers/src/ether');
const { ethers }   = require('ethers');

const upgrader = "0x1670035057CCFC8D8a05c0A9EeB4a0c9071efe14";
const initializeSelector = "0xd3519fa2";
const StakingConfig = {
  epocheStart: 0,
  epocheLength: 3600,
  withdrawLength: 82800,
  rewardPerTokenAndYear: 10,
  maximumStakingAmountInEthers: 1000000,
  name: "St NFT",
  symbol: "LPNFT",
  uri: "ipfs://QmbXEFM3qneh93bFMPuZxGUwWBrdSdvR3t3Fg67vQRVXz6"
}

module.exports = async function(deployer, accounts) {
  let abiCoder = new ethers.utils.AbiCoder;

  let imp = await MetaStaking.deployed();
  let stakingToken = await ERC20Staking.deployed();
  let rewardToken = await ERC20Rewards.deployed();

  const initData = initializeSelector + abiCoder.encode(
    ["address","address","uint256","uint256","uint256","uint256","uint256","tuple(string name, string symbol, string uri)"],
    [
        rewardToken.address,
        stakingToken.address,
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
  await deployer.deploy(Proxy, imp.address, upgrader, initData);
}