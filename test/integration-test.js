const MetaverseStaking = artifacts.require('MetaverseStaking');
const ERC20Mock        = artifacts.require('ERC20Mock');

const { time, expectRevert, BN } = require('@openzeppelin/test-helpers');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');
const ether = require('@openzeppelin/test-helpers/src/ether');
const { inTransaction } = require('@openzeppelin/test-helpers/src/expectEvent');
const expectEvent = require('@openzeppelin/test-helpers/src/expectEvent');
const toBN = require('web3')

const StakingConfig = {
    epocheStart: 0,
    epocheLength: 10000,
    withdrawLength: 1000,
    rewardPerTokenAndSecond: 1,
    name: "Staking NFT",
    symbol: "LPNFT",
    uri: "ipfs://..."
}

contract('MetaverseStakingMain', ([bob, alice, owner]) => {
    // define shorter msg.sender, only for convenience
    const byOwner = { from: owner };
    const byBob = { from: bob };
    const byAlice = { from: alice };

    before(async () => {
        this.ERC = await ERC20Mock.new("testToken", "TST", byOwner);
        this.MGH = await ERC20Mock.new("metagamehub", "MGH", byOwner);
        this.MVS = await MetaverseStaking.new();

        await this.MVS.initialize(
            this.MGH.address,
            this.ERC.address,
            StakingConfig.epocheStart,
            StakingConfig.epocheLength,
            StakingConfig.withdrawLength,
            StakingConfig.rewardPerTokenAndSecond,
            StakingConfig.name,
            StakingConfig.symbol,
            StakingConfig.uri,
            byOwner
        );
        await this.MGH.transfer(this.MVS.address, ether('1'), byOwner);
        await this.ERC.transfer(bob, ether('1'), byOwner);
        await this.ERC.transfer(alice, ether('1'), byOwner);

        await this.ERC.approve(this.MVS.address, MAX_UINT256, byBob);
        await this.ERC.approve(this.MVS.address, MAX_UINT256, byOwner);
        await this.ERC.approve(this.MVS.address, MAX_UINT256, byAlice);
    })
    describe('before first epoche start', async () => {
        it('', async () => {
            
        })
        it('', async () => {
            
        })
        it('', async () => {
            
        })
        it('', async () => {
            
        })
        it('', async () => {
            
        })
        it('', async () => {
            
        })

    })
})