const MetaverseStakingToken = artifacts.require('MetaverseStakingToken')

module.exports = async function(deployer) {
    deployer.deploy(MetaverseStakingToken);
}