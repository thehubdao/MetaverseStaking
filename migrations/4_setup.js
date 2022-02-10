const ERC20Staking = artifacts.require('ERC20Mock');
const ERC20Rewards = artifacts.require('ERC20Mock');
const MetaStaking = artifacts.require('MetaverseStaking')

const StakingConfig = {
  epocheStart: 0,
  epocheLength: 1000,
  withdrawLength: 200,
  rewardPerTokenAndSecond: 1,
  name: "Staking NFT",
  symbol: "LPNFT",
  uri: "ipfs://..."
}

module.exports = async function(deployer) {
    let inst = await MetaStaking.deployed();
    let stakingToken = await ERC20Staking.deployed();
    let rewardToken = await ERC20Rewards.deployed();
    return await inst.initialize(
        rewardToken.address,
        stakingToken.address,
        StakingConfig.epocheStart,
        StakingConfig.epocheLength,
        StakingConfig.withdrawLength,
        StakingConfig.rewardPerTokenAndSecond,
        StakingConfig.name,
        StakingConfig.symbol,
        StakingConfig.uri
    )
}