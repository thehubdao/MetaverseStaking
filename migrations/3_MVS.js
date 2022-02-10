const MetaStaking = artifacts.require('MetaverseStaking')

module.exports = async function(deployer) {
    deployer.deploy(MetaStaking);
}