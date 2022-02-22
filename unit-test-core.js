const MetaverseStaking = artifacts.require('MetaverseStaking');
const ERC20RewardMock  = artifacts.require('ERC20RewardMock');
const ERC20SandMock    = artifacts.require('ERC20SandMock');
const Proxy            = artifacts.require('MVSProxy');

const { time, BN, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');
const ether = require('@openzeppelin/test-helpers/src/ether');
const { keccak256 }    = require('ethereum-cryptography/keccak');

const { ethers } = require('ethers');

const toBN = require('web3');
var assert = require('chai').assert;

const PROXY_STORAGE_IMP      = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const PROXY_STORAGE_UPGRADER = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbd";

const approveAndCallDepositSelector  = '0x' + keccak256("approveAndCallHandlerDeposit(address,uint256,uint256)").toString('hex').slice(0,8);
const approveAndCallIncreaseSelector = '0x' + keccak256("approveAndCallHandlerIncrease(address,uint256,uint256)").toString('hex').slice(0,8);

let idCounter = 0;
const initializeSelector = "0xd3519fa2";
const StakingConfig = {
    epocheStart: 0,
    epocheLength: 10000,
    withdrawLength: 1000,
    rewardPerTokenAndYear: 31449600, // => 1 token per token and second for simple maths
    maximumStakingAmount: 1000000,
    name: "Staking NFT",
    symbol: "LPNFT",
    uri: "ipfs://..."
}

contract('MetaverseStakingMain', ([bob, alice, owner, upgrader]) => {
    console.log({approveAndCallDepositSelector, approveAndCallIncreaseSelector})
    let abiCoder = new ethers.utils.AbiCoder;
    let provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");

    // define shorter msg.sender, only for convenience
    const byBob = { from: bob };
    const byAlice = { from: alice };
    const byOwner = { from: owner };
    const byUpgrader = { from: upgrader };

    // object for accessing the infos of first epoche
    let currentEpoche;

    before(async () => {
        this.ERC = await ERC20SandMock.new("testToken", "TST", byOwner);
        this.MGH = await ERC20RewardMock.new("metagamehub", "MGH", byOwner);
        this.IMP = await MetaverseStaking.new();
        const initData = initializeSelector + abiCoder.encode(
            ["address","address","uint256","uint256","uint256","uint256","uint256","tuple(string, string, string)"],
            [
                this.MGH.address,
                this.ERC.address,
                StakingConfig.epocheStart,
                StakingConfig.epocheLength,
                StakingConfig.withdrawLength,
                StakingConfig.rewardPerTokenAndYear,
                StakingConfig.maximumStakingAmount,
                [
                    StakingConfig.name,
                    StakingConfig.symbol,
                    StakingConfig.uri
                ]
            ]
        ).slice(2);
        this.PROX = await Proxy.new(this.IMP.address, upgrader, initData, byOwner)
        this.MVS  = await MetaverseStaking.at(this.PROX.address);

        currentEpoche = await this.MVS.currentEpoche.call();
        console.log({currentEpoche})

        tokenId = () => {
            idCounter++;
            return  idCounter - 1;
        }
        tokenIdFail = () => {
            return keccak256("will fail");
        }

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
/*             assert.isTrue(start.toString() > (await time.latest()).toString()); */
            assert.equal(start - lastEnd, StakingConfig.withdrawLength);
        })
        it('all other params are set correctly', async () => {
            assert.equal(await this.MVS.getTotalAmountStaked(), 0);
            assert.equal((await this.MVS.getRewardRate()).toString(), '31449600');
            assert.equal(await this.MVS.isWithdrawPhase(), true);
            assert.equal((await this.MVS.getCurrentWithdrawPercentage()).toString(), 10**9);
        })
        it('implementation already initialized', async () => {
            await expectRevert(
                this.IMP.initialize(this.MGH.address,
                    this.ERC.address,
                    StakingConfig.epocheStart,
                    StakingConfig.epocheLength,
                    StakingConfig.withdrawLength,
                    StakingConfig.rewardPerTokenAndYear,
                    StakingConfig.maximumStakingAmount,
                    [
                        StakingConfig.name,
                        StakingConfig.symbol,
                        StakingConfig.uri
                    ]
                ), 
                "Initializable: contract is already initialized"
            )
        })
    })

    describe('sand token - approve and call checks', async () => {
        it('reverts on wrong selector or length', async () => {
            await expectRevert(
                this.ERC.approveAndCall(
                    this.MVS.address,
                    MAX_UINT256,
                    '0x',
                    byOwner
                ),
                "first param != sender"
            )
            await expectRevert.unspecified(
                this.ERC.approveAndCall(
                    this.MVS.address,
                    MAX_UINT256,
                    approveAndCallIncreaseSelector + abiCoder.encode(
                        ["address", "uint256"],
                        [bob, 1]
                    ).slice(3),
                    byBob
                ),
                "first param != sender"
            )
            await expectRevert.unspecified(
                this.ERC.approveAndCall(
                    this.MVS.address,
                    MAX_UINT256,
                    '0x12345678' + abiCoder.encode(
                        ["address", "uint256"],
                        [bob, 1]
                    ).slice(2),
                    byBob
                )
            )
        })
        it('reverts when first param != msg.sender', async () => {
            await expectRevert(
                this.ERC.approveAndCall(
                    this.MVS.address,
                    MAX_UINT256,
                    approveAndCallDepositSelector + abiCoder.encode(["address"],[bob]).slice(2),
                    byOwner
                ),
                "first param != sender"
            )
            await expectRevert(
                this.ERC.approveAndCall(
                    this.MVS.address,
                    MAX_UINT256,
                    approveAndCallDepositSelector + abiCoder.encode(["address", "uint256"],[bob, 1]).slice(2),
                    byOwner
                ),
                "first param != sender"
            )
        })
    })

    describe('deposits', async () => {
        it('reverts on 0 input', async () => {
            await expectRevert(
                this.MVS.deposit(tokenIdFail(), 0, byBob),
                "amount != 0"
            )
        })
        it('can not exceed maximum _maximumAmountStaked', async () => {
            await expectRevert(
                this.MVS.deposit(tokenIdFail(), ether('1000001'), byOwner),
                "maximum amount is reached"
            )
            const ownerBalance = await this.MVS.balanceOf(owner);
            await expectRevert.unspecified(
                this.ERC.approveAndCall(
                    this.MVS.address, 
                    MAX_UINT256, 
                    approveAndCallDepositSelector + abiCoder.encode(
                        ["address", "uint256", "uint256"],
                        [owner, tokenIdFail(), ether('1000001').toString()]
                    ).slice(2),
                    byOwner,
                )
            )
            assert.equal((await this.MVS.balanceOf(owner)).toString(), ownerBalance.toString());
            assert.isTrue(await this.MVS.getTotalAmountStaked() < 100);
        })
        it('mints conscutively from 0', async () => {
            await this.MVS.deposit(tokenId(), 1, byBob);
            assert.equal(await this.MVS.ownerOf(0), bob);
        })
        it('deposits with approveAndCall()', async () => {
            const forwardData = approveAndCallDepositSelector + abiCoder.encode(["address", "uint256", "uint256"], [bob, tokenId(), 1]).slice(2);
            const depositReceipt = await this.ERC.approveAndCall(this.MVS.address, MAX_UINT256, forwardData, byBob);
            assert.equal(await this.MVS.ownerOf(1), bob);
            assert.equal(await this.ERC.balanceOf(this.MVS.address), '2');
            await expectEvent.inTransaction(depositReceipt.tx, this.MVS, "Deposit", {
                tokenId: (idCounter - 1).toString(),
                staker: bob,
                amount: '1'
            })
        })
        it('deposits with deposit()', async () => {
            const depositReceipt = await this.MVS.deposit(tokenId(), 1, byBob);
            const now = await time.latest();

            assert.equal(await this.ERC.balanceOf(this.MVS.address), '3');
            const nftStats_before = await this.MVS.viewNftStats(2);
            assert.equal((nftStats_before[0].toString(), nftStats_before[1].toString(), nftStats_before[2].toString(), nftStats_before[3]), 
                        ('1', now.toString(), '0', false));

            await time.increase(5);
            const withdrawReceipt = await this.MVS.withdraw(2, 1, byBob);
            const nftStats_after = await this.MVS.viewNftStats(2);
            assert.equal((nftStats_after[0].toString(), nftStats_after[1].toString(), nftStats_after[2].toString(), nftStats_after[3]), 
                	    ('0', (now.add(new BN('6'))).toString(), '0', false));

            assert.equal(await this.ERC.balanceOf(this.MVS.address), '2');
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
    describe('increases Position', async () => {
        it('reverts on 0 input', async () => {
            await expectRevert(
                this.MVS.increasePosition(2, 0, byBob),
                "amount != 0"
            )
        })
        it('increases with approveAndCall()', async () => {
            let rewardsBefore = await this.MVS.getUpdatedRewardsDue(2);
            assert.equal(await this.MVS.getAmount(2), '0');
            assert.equal(await this.MVS.getTotalAmountStaked(), '2');
            assert.equal(await this.MVS.ownerOf(2), bob);
            const forwardData = approveAndCallIncreaseSelector + abiCoder.encode(
                    ["address", "uint256", "uint256"],
                    [bob, 2, 1])
                    .slice(2);
            const increaseReceipt = await this.ERC.approveAndCall(
                this.MVS.address,
                MAX_UINT256,
                forwardData,
                byBob
            )
            let rewardsAfter = await this.MVS.getUpdatedRewardsDue(2);
            assert.equal(await this.MVS.balanceOf(bob), '3');
            assert.equal(await this.MVS.getTotalAmountStaked(), '3');
            assert.equal(await this.MVS.getAmount(2), '1');
            await expectEvent.inTransaction(increaseReceipt.tx, this.MVS, "PositionIncreased", {
                tokenId: '2',
                staker: bob,
                amount: '1'
            })
        })
        it('increases with increasePosition()', async () => {
            assert.equal(await this.MVS.getAmount(2), '1');
            let increaseReceipt = await this.MVS.increasePosition(2, 1, byBob);
            assert.equal(await this.MVS.getAmount(2), '2');
            await expectEvent(increaseReceipt, "PositionIncreased", {
                tokenId: '2',
                staker: bob,
                amount: '1'
            })
        })
    })
    describe('withdraws_withoutLosses', async () => {
        it('reverts on 0 input', async () => {
            await expectRevert(
                this.MVS.withdraw(0, 0, byOwner),
                'amount != 0'
            )
        })
        it('can only be called by nft owner', async () => {
            await expectRevert(
                this.MVS.withdraw(0, 1, byOwner),
                "not your nft"
            )
        })
        it('can withdraw everything without bot withdraws', async () => {
            const stakeAmount = await this.MVS.getAmount(2);
            const rewardsReceipt = await this.MVS.withdraw(2, stakeAmount, byBob);
            assert.equal(await this.MVS.getAmount(2), '0');
            await expectEvent(rewardsReceipt, "Withdrawn", {
                tokenId: '2',
                recipient: bob,
                amount: stakeAmount.toString()
            })
        })
        it('only possible in withdraw phase', async() => {
            await this.MVS.increasePosition(2, 1, byBob);
            await time.increase(1000);
            assert.equal(await this.MVS.isWithdrawPhase(), false);
            await expectRevert(
                this.MVS.withdraw(2, 1, byBob),
                "not withdraw time"
            )
        })
    })
    describe('get Reward and reward calculations', async () => {
        it('anyone can getRewards for anyone', async () => {
            assert.equal(await this.MVS.ownerOf(2), bob);
            const balanceBefore = await this.MGH.balanceOf(bob);
            let amountAvailable = (await this.MVS.getUpdatedRewardsDue(2)).add(new BN('1'));
            console.log({amountAvailable}, amountAvailable.toString());
            let withdrawForReceipt = await this.MVS.getRewards(2, byAlice);
            assert.equal(await this.MVS.getUpdatedRewardsDue(2), '1');
            await expectEvent(withdrawForReceipt, "RewardPaid", {
                tokenId: '2',
                recipient: bob,
                amount: amountAvailable.toString()
            })
            assert.equal((await this.MGH.balanceOf(bob)).toString(), balanceBefore.add(amountAvailable).toString());
        })
        it('rewards start immediately during locked phase', async () => {
            const idToMint = idCounter;
            await this.MVS.deposit(tokenId(), 1, byAlice);
            await time.increase(100);
            let rewardsReceipt = await this.MVS.getRewards(idToMint, byAlice);
            assert.equal(await this.MVS.getUpdatedRewardsDue(idToMint), '1');
            await expectEvent(rewardsReceipt, "RewardPaid", {
                tokenId: idToMint.toString(),
                recipient: alice,
                amount: '100'
            })
        })
        it('rewards are not paid during withdrawPhase', async () => {
            const applicableTime = currentEpoche.end.sub(await time.latest()).add(new BN('1'));
            await time.increaseTo(currentEpoche.end.add(new BN('100')));
            const rewardsReceipt = await this.MVS.getRewards(idCounter - 1);
            await expectEvent(rewardsReceipt, "RewardPaid", {
                tokenId: (idCounter - 1).toString(),
                recipient: alice,
                amount: applicableTime
            })
            await time.increase(10);
            assert.equal(await this.MVS.getUpdatedRewardsDue(idCounter - 1), '1');
        })
    })
    describe('owner functions', async () => {
        describe('nextEpoche', async () => {
            it('only Owner', async () => {
                await expectRevert(
                    this.MVS.nextEpoche(0, 1000, byBob),
                    "Ownable: caller is not the owner"
                )
            })
            it('reverts on 0 length', async () => {
                await expectRevert(
                    this.MVS.nextEpoche(0, 0, byOwner),
                    "length != 0"
                )
            })
            it('works and leaves epocheNumber unchanged', async () => {
                const epocheNumberBefore = await this.MVS.getEpocheNumber();
                // pending reward rate = 2/s
                const epocheReceipt = await this.MVS.nextEpoche(62899200, 1000, byOwner);
                const now = await time.latest();
                await expectEvent(epocheReceipt, "NewEpoche", {
                    start: now.add(new BN(StakingConfig.withdrawLength.toString())),
                    end: now.add(new BN(StakingConfig.withdrawLength.toString())).add(new BN('1000')),
                    pendingRewardRate: '62899200'
                })
                assert.equal(await this.MVS.isWithdrawPhase(), true);
                assert.equal((await this.MVS.getEpocheNumber()).toString(), epocheNumberBefore.toString());
            })
            it('only callable once in withdrawPhase', async () => {
                await expectRevert(
                    this.MVS.nextEpoche(1, 1, byOwner),
                    "only once in withdraw Phase"
                )
            })
            describe('apply new reward rate', async () => {
                it('only Owner', async () => {
                    await expectRevert(
                        this.MVS.applyNewRewardRate(byBob),
                        "Ownable: caller is not the owner"
                    )
                })
                it('not before epoche starts', async () => {
                    await expectRevert(
                        this.MVS.applyNewRewardRate(byOwner),
                        "only after withdrawPhase"
                    )
                })
                it('works in locking phase', async () => {
                    await time.increase(1000);
                    assert.equal(await this.MVS.getRewardRate(), '31449600');
                    const rewardRateReceipt = await this.MVS.applyNewRewardRate(byOwner);
                    assert.equal(await this.MVS.getRewardRate(), '62899200');
                })
                it('cannot set to 0', async () => {
                    await expectRevert(
                        this.MVS.applyNewRewardRate(byOwner),
                        "no pending rewardRate"
                    )
                })
            })
        })
    })
    describe('views', async () => {

    })
})