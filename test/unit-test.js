const MetaverseStaking = artifacts.require('MetaverseStaking');
const ERC20RewardMock  = artifacts.require('ERC20RewardMock');
const ERC20SandMock    = artifacts.require('ERC20SandMock');
const Proxy            = artifacts.require('MVSProxy');

const { time, expectRevert, BN } = require('@openzeppelin/test-helpers');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');
const ether = require('@openzeppelin/test-helpers/src/ether');
const { keccak256 }    = require('ethereum-cryptography/keccak');

const { ethers } = require('ethers');
const expectEvent = require('@openzeppelin/test-helpers/src/expectEvent');
const toBN = require('web3');
var assert = require('chai').assert;

const PROXY_STORAGE_IMP      = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const PROXY_STORAGE_UPGRADER = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbd";

const approveAndCallDepositSelector  = '0x' + keccak256("approveAndCallHandlerDeposit(address,uint256)").toString('hex').slice(0,8);
const approveAndCallIncreaseSelector = '0x' + keccak256("approveAndCallHandlerIncrease(address,uint256,uint256)").toString('hex').slice(0,8);

const initializeSelector = "0xb64b5071";
const StakingConfig = {
    epocheStart: 0,
    epocheLength: 10000,
    withdrawLength: 1000,
    rewardPerTokenAndSecond: 1,
    name: "Staking NFT",
    symbol: "LPNFT",
    uri: "ipfs://..."
}

contract('MetaverseStakingMain', ([bob, alice, owner, upgrader]) => {
    console.log({approveAndCallDepositSelector, approveAndCallIncreaseSelector})
    let abiCoder = new ethers.utils.AbiCoder;
    let provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:9545");

    // define shorter msg.sender, only for convenience
    const byBob = { from: bob };
    const byAlice = { from: alice };
    const byOwner = { from: owner };
    const byUpgrader = { from: upgrader };

    before(async () => {
        this.ERC = await ERC20SandMock.new("testToken", "TST", byOwner);
        this.MGH = await ERC20RewardMock.new("metagamehub", "MGH", byOwner);
        this.IMP = await MetaverseStaking.new();

        const initData = initializeSelector + abiCoder.encode(
            ["address","address","uint256","uint256","uint256","uint256","string","string","string"],
            [
                this.MGH.address,
                this.ERC.address,
                StakingConfig.epocheStart,
                StakingConfig.epocheLength,
                StakingConfig.withdrawLength,
                StakingConfig.rewardPerTokenAndSecond,
                StakingConfig.name,
                StakingConfig.symbol,
                StakingConfig.uri
            ]
        ).slice(2);
        this.PROX = await Proxy.new(this.IMP.address, upgrader, initData, byOwner)
        this.MVS  = await MetaverseStaking.at(this.PROX.address);
        
        await this.MGH.transfer(this.MVS.address, ether('1'), byOwner);
        await this.ERC.transfer(bob, ether('1'), byOwner);
        await this.ERC.transfer(alice, ether('1'), byOwner);

        await this.ERC.approve(this.MVS.address, MAX_UINT256, byBob);
        await this.ERC.approve(this.MVS.address, MAX_UINT256, byOwner);
        await this.ERC.approve(this.MVS.address, MAX_UINT256, byAlice);
    })

    describe('validating setup', async () => {
        it('owner is set correctly', async () => {
            assert.equal(await this.MVS.owner(), owner);
        })
        it('implementation is set correctly', async () => {
            const implementationAddress = await provider.getStorageAt(this.MVS.address, PROXY_STORAGE_IMP);
            assert.equal(implementationAddress, (this.IMP.address).toLowerCase());
        })
        it('upgrader is set correctly', async () => {
            const upgraderAddress = (await provider.getStorageAt(this.MVS.address, PROXY_STORAGE_UPGRADER));
            assert.equal(upgraderAddress, upgrader.toLowerCase());
        })
        it('tokens are set correctly', async () => {
            assert.equal(await this.MVS.MGH_TOKEN.call(), this.MGH.address);
            assert.equal(await this.MVS.currency.call(), this.ERC.address);
        })
        it('epoche params are set correctly', async () => {
            const { start, end, lastEnd } = await this.MVS.currentEpoche.call();
            console.log(
                `
                start time:       ${start.toString()}
                endTime:          ${end.toString()}
                endOfLastEpoche:  ${lastEnd.toString()}
                `
            )
            assert.equal(end - start, StakingConfig.epocheLength);
            assert.isTrue(start.toString() > (await time.latest()).toString());
            assert.equal(start - lastEnd, StakingConfig.withdrawLength);
        })
        it('all other params are set correctly', async () => {
            assert.equal(await this.MVS.getTotalAmountStaked(), 0);
            assert.equal(await this.MVS.getEpocheNumber(), 0);
            assert.equal(await this.MVS.getRewardRate(), 1);
            assert.equal(await this.MVS.isWithdrawPhase(), true);
            assert.equal((await this.MVS.getCurrentWithdrawPercentage()).toString(), 10**9);
        })
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
        })
        it('deposits with approveAndCall', async () => {
            const forwardData = approveAndCallDepositSelector + abiCoder.encode(["address", "uint256"], [bob, 1]).slice(2);
            console.log({forwardData});
            const depositReceipt = await this.ERC.approveAndCall(this.MVS.address, MAX_UINT256, forwardData, byBob);
            assert.equal(await this.MVS.ownerOf(1), bob);
            await expectEvent.inTransaction(depositReceipt.tx, this.MVS, "Deposit", {
                tokenId: '1',
                staker: bob,
                amount: '1'
            })
        })
        it('correct nft stats onchain and event', async () => {
            const depositReceipt = await this.MVS.deposit(1, byBob);
            const now = await time.latest();

            const nftStats_before = await this.MVS.viewNftStats(2);
            assert.equal((nftStats_before[0].toString(), nftStats_before[1].toString(), nftStats_before[2].toString(), nftStats_before[3]), 
                        ('1', now.toString(), '0', false));

            await time.increase(5);
            const withdrawReceipt = await this.MVS.withdraw(2, 1, byBob);
            const nftStats_after = await this.MVS.viewNftStats(2);
            assert.equal((nftStats_after[0].toString(), nftStats_after[1].toString(), nftStats_after[2].toString(), nftStats_after[3]), 
                	    ('0', (now.add(new BN('6'))).toString(), '0', false));

            await expectEvent(depositReceipt, "Deposit", {
                tokenId: '2',
                staker: bob,
                amount: '1'
            })
            await expectEvent(withdrawReceipt, "Withdrawn", {
                tokenId: '2',
                recipient: bob,
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