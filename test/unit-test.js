const MetaverseStaking = artifacts.require('MetaverseStaking');
const ERC20Mock        = artifacts.require('ERC20Mock');

const { time, expectRevert, BN } = require('@openzeppelin/test-helpers');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');
const ether = require('@openzeppelin/test-helpers/src/ether');
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
    describe('deposits', async () => {
        it('reverts on 0 input', async () => {
            await expectRevert(
                this.MVS.deposit(0, byBob),
                "amount != 0"
            )
        })
        it('mints conscutively from 0', async () => {
            await this.MVS.deposit(1, byBob);
            assert.equal(await this.MVS.ownerOf(0), bob);
            await this.MVS.deposit(1, byAlice);
            assert.equal(await this.MVS.ownerOf(1), alice);
        })
        it('correct nft stats onchain and event', async () => {
            const depositReceipt = await this.MVS.deposit(1, byBob);
            const now = await time.latest();
            console.log("now: " + now + " onchain: " + await this.MVS.viewNftStats(2));
            assert.equal((await this.MVS.viewNftStats(2)).toString(), [1, now.toString(), 0]);
            await time.increase(5);
            await this.MVS.withdraw(2, 1, byBob);
            assert.equal((await this.MVS.viewNftStats(2)).toString(), [0, (now.add(new BN('6'))).toString(), 0]);

            await expectEvent(depositReceipt, "Deposit", {
                tokenId: '2',
                staker: bob,
                amount: '1'
            })
        })
    })
    describe('withdraws', async () => {
        it('can only be called by nft owner', async () => {
            await expectRevert(
                this.MVS.withdraw(0, 1, byOwner),
                "not your nft"
            )
        })
        it('udpates reward amount', async () => {
            
        })
        it('only possible in withdraw phase', async() => {

        })
    })
    describe('get Reward', async () => {

    })
    describe('owner functions', async () => {
        describe('nextEpoch', async () => {
            it('', async () => {

            })
        })
        describe('apply new reward', async () => {

        })
    })
    describe('views', async () => {

    })
})