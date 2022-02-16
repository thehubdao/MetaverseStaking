const ERC20 = artifacts.require('ERC20SandMock');

module.exports = function(deployer) {
  deployer.deploy(ERC20, "stakingToken", "STK");
}
