const ERC20Staking = artifacts.require('ERC20SandMock');
const ERC20Rewards = artifacts.require('ERC20RewardMock');
const MetaStaking  = artifacts.require('MetaverseStaking')
const Proxy        = artifacts.require('MVSProxy');

const { ethers }   = require('ethers');

const upgrader = "0x1670035057CCFC8D8a05c0A9EeB4a0c9071efe14";
const initializeSelector = "0xb64b5071";
const StakingConfig = {
  epocheStart: 0,
  epocheLength: 86400,
  withdrawLength: 600,
  rewardPerTokenAndSecond: 1,
  name: "Staking NFT",
  symbol: "LPNFT",
  uri: "ipfs://..."
}

module.exports = async function(deployer, accounts) {
  let abiCoder = new ethers.utils.AbiCoder;

  let imp = await MetaStaking.deployed();
  let stakingToken = await ERC20Staking.deployed();
  let rewardToken = await ERC20Rewards.deployed();

  const initData = initializeSelector + abiCoder.encode(
    ["address","address","uint256","uint256","uint256","uint256","string","string","string"],
    [
        rewardToken.address,
        stakingToken.address,
        StakingConfig.epocheStart,
        StakingConfig.epocheLength,
        StakingConfig.withdrawLength,
        StakingConfig.rewardPerTokenAndSecond,
        StakingConfig.name,
        StakingConfig.symbol,
        StakingConfig.uri
    ]).slice(2);

  await deployer.deploy(Proxy, imp.address, upgrader, initData);
}