const MetaverseStakingNative = artifacts.require('MetaverseStakingNative');

module.exports = async function(deployer) {
    deployer.deploy(MetaverseStakingNative);
}