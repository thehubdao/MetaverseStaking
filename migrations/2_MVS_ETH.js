const MetaverseStakingETH = artifacts.require("MetaverseStakingETH");
const ERC20Mock = artifacts.require("ERC20Mock");

const rewardTokenAddress = "";

module.exports = async function (dep, net, acc) {
    const rewardToken = rewardTokenAddress 
        ? await ERC20Mock.at(rewardTokenAddress) 
        : await ERC20Mock.deployed();

    const MVS = await dep.deploy(MetaverseStakingETH,
            "Test_name",
            "Test_symbol",
            rewardToken.address,
            start=0,
            length=60*60,
            // 1 token per second for 1 ETH staked
            "1000000000000"
        )
    await rewardToken.transfer(MVS.address, "1000000000000000000000000")

}