const ERC20Staking = artifacts.require('ERC20Mock');

module.exports = function(deployer) {
  deployer.deploy(ERC20Staking, "stakingToken", "STK");
}