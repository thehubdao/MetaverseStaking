const MetaverseStaking = artifacts.require('MetaverseStaking')

module.exports = async function(deployer) {
    deployer.deploy(MetaverseStaking);
}