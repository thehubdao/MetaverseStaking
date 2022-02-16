const ERC20 = artifacts.require('ERC20RewardMock');

module.exports = function(deployer) {
  deployer.deploy(ERC20, "rewardToken", "RTK");
}