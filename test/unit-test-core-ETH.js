const MetaverseStaking = artifacts.require('MetaverseStakingNative');
const ERC20RewardMock  = artifacts.require('ERC20RewardMock');
const Proxy            = artifacts.require('MVSProxy');

const { time, BN, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { MAX_UINT256, ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants');
const ether = require('@openzeppelin/test-helpers/src/ether');
const { Web3 } = require('@openzeppelin/test-helpers/src/setup');
const { keccak256 }    = require('ethereum-cryptography/keccak');

const { ethers } = require('ethers');

const toBN = require('web3');
var assert = require('chai').assert;

const PROXY_STORAGE_IMP      = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const PROXY_STORAGE_UPGRADER = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbd";

let idCounter = 0;
const initializeSelector = "0x67b57ecc";
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

contract('MetaverseStakingNative', ([bob, alice, bot, owner, upgrader]) => {
    let abiCoder = new ethers.utils.AbiCoder;
    let provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");

    //msg.value and msg.sender
    let opt = (msgSender, msgValue) => {
        if(msgSender && msgValue) return { from: msgSender, value: msgValue};
        return { from: msgSender } ;
    };

    // object for accessing the infos of first epoche
    let currentEpoche;

    before(async () => {
        (new BN(await provider.getBalance(alice)._hex));
        this.MGH = await ERC20RewardMock.new("metagamehub", "MGH", opt(owner));
        this.IMP = await MetaverseStaking.new();
        const initData = initializeSelector + abiCoder.encode(
            ["address","uint256","uint256","uint256","uint256","uint256","tuple(string, string, string)"],
            [
                this.MGH.address,
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
        this.PROX = await Proxy.new(this.IMP.address, upgrader, initData, opt(owner, 0))
        this.MVS  = await MetaverseStaking.at(this.PROX.address);

        currentEpoche = await this.MVS.currentEpoche.call();

        tokenId = () => {
            idCounter++;
            return  idCounter;
        }
        tokenIdFail = () => {
            return keccak256("will fail");
        }

        await this.MGH.transfer(this.MVS.address, ether('1'), opt(owner));
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
            assert.equal(await this.MVS.currency.call(), ZERO_ADDRESS);
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
                this.IMP.initialize(
                    this.MGH.address,
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
    
    describe('deposits', async () => {
        it('reverts on 0 input', async () => {
            await expectRevert(
                this.MVS.deposit(tokenIdFail(), opt(bob)),
                "amount != 0"
            )
        })
        it('can not exceed maximum _maximumAmountStaked', async () => {
            const ownerBalance = await this.MVS.balanceOf(owner);
            await expectRevert(
                this.MVS.deposit(tokenIdFail(), opt(owner, ether('1000001'))),
                "maximum amount is reached"
            )
            assert.equal((await this.MVS.balanceOf(owner)).toString(), ownerBalance.toString());
            assert.isTrue(await this.MVS.getTotalAmountStaked() < 100);
        })
        it('mints conscutively from 0', async () => {
            await this.MVS.deposit(tokenId(), opt(bob, 2));
            assert.equal(await this.MVS.ownerOf(idCounter), bob);
        })
        it('deposits with deposit()', async () => {
            const depositReceipt = await this.MVS.deposit(tokenId(), opt(bob, 1));
            const now = await time.latest();

            assert.equal((await provider.getBalance(this.MVS.address)).toString(), '3');
            const nftStats_before = await this.MVS.viewNftStats(idCounter);
            assert.equal((nftStats_before[0].toString(), nftStats_before[1].toString(), nftStats_before[2].toString(), nftStats_before[3]), 
                        ('1', now.toString(), '0', false));

            await time.increase(5);
            const withdrawReceipt = await this.MVS.withdraw(idCounter, 1, opt(bob));
            const nftStats_after = await this.MVS.viewNftStats(idCounter);
            assert.equal((nftStats_after[0].toString(), nftStats_after[1].toString(), nftStats_after[2].toString(), nftStats_after[3]), 
                	    ('0', (now.add(new BN('6'))).toString(), '0', false));

            assert.equal(await provider.getBalance(this.MVS.address), '2');
            await expectEvent(depositReceipt, "Deposit", {
                tokenId: idCounter.toString(),
                staker: bob,
                amount: '1'
            })
            await expectEvent(withdrawReceipt, "Withdrawn", {
                tokenId: idCounter.toString(),
                recipient: bob,
                amount: '1'
            })
        })
    })
    describe('increases Position', async () => {
        it('reverts on 0 input', async () => {
            await expectRevert(
                this.MVS.increasePosition(tokenIdFail(), opt(bob)),
                "amount != 0"
            )
        })
        it('increases with increasePosition()', async () => {
            assert.equal(await this.MVS.getAmount(idCounter), '0');
            let increaseReceipt = await this.MVS.increasePosition(idCounter, opt(bob, 1));
            assert.equal(await this.MVS.getAmount(idCounter), '1');
            await expectEvent(increaseReceipt, "PositionIncreased", {
                tokenId: idCounter.toString(),
                staker: bob,
                amount: '1'
            })
        })
    })
    describe('withdraws_withoutLosses', async () => {
        it('reverts on 0 input', async () => {
            await expectRevert(
                this.MVS.withdraw(idCounter, 0, opt(owner)),
                'amount != 0'
            )
        })
        it('can only be called by nft owner', async () => {
            await expectRevert(
                this.MVS.withdraw(idCounter, 1, opt(owner)),
                "not your nft"
            )
        })
        it('can withdraw everything without bot withdraws', async () => {
            const stakeAmount = await this.MVS.getAmount(idCounter);
            const rewardsReceipt = await this.MVS.withdraw(idCounter, stakeAmount, opt(bob));
            assert.equal(await this.MVS.getAmount(idCounter), '0');
            await expectEvent(rewardsReceipt, "Withdrawn", {
                tokenId: idCounter.toString(),
                recipient: bob,
                amount: stakeAmount.toString()
            })
        })
        it('only possible in withdraw phase', async() => {
            await this.MVS.increasePosition(idCounter, opt(bob, 1));
            await time.increase(1000);
            assert.equal(await this.MVS.isWithdrawPhase(), false);
            await expectRevert(
                this.MVS.withdraw(idCounter, 1, opt(bob)),
                "not withdraw time"
            )
        })
    })
    describe('get Reward and reward calculations', async () => {
        it('anyone can getRewards for anyone', async () => {
            assert.equal(await this.MVS.ownerOf(idCounter), bob);
            const balanceBefore = await this.MGH.balanceOf(bob);
            let amountAvailable = (await this.MVS.getUpdatedRewardsDue(idCounter)).add(new BN('1'));
            let withdrawForReceipt = await this.MVS.getRewards(idCounter, opt(alice));
            assert.equal(await this.MVS.getUpdatedRewardsDue(idCounter), '1');
            await expectEvent(withdrawForReceipt, "RewardPaid", {
                tokenId: idCounter.toString(),
                recipient: bob,
                amount: amountAvailable.toString()
            })
            assert.equal((await this.MGH.balanceOf(bob)).toString(), balanceBefore.add(amountAvailable).toString());
        })
        it('rewards start immediately during locked phase', async () => {
            await this.MVS.deposit(tokenId(), opt(alice, 1));
            await time.increase(100);
            let rewardsReceipt = await this.MVS.getRewards(idCounter, opt(alice));
            assert.equal(await this.MVS.getUpdatedRewardsDue(idCounter), '1');
            await expectEvent(rewardsReceipt, "RewardPaid", {
                tokenId: idCounter.toString(),
                recipient: alice,
                amount: '100'
            })
        })
        it('rewards are not paid during withdrawPhase', async () => {
            const applicableTime = currentEpoche.end.sub(await time.latest()).add(new BN('1'));
            await time.increaseTo(currentEpoche.end.add(new BN('100')));
            const rewardsReceipt = await this.MVS.getRewards(idCounter);
            await expectEvent(rewardsReceipt, "RewardPaid", {
                tokenId: idCounter.toString(),
                recipient: alice,
                amount: applicableTime
            })
            await time.increase(10);
            assert.equal(await this.MVS.getUpdatedRewardsDue(idCounter), '1');
        })
    })
    describe('owner functions', async () => {
        describe('nextEpoche', async () => {
            it('only Owner', async () => {
                await expectRevert(
                    this.MVS.nextEpoche(0, 1000, opt(bob)),
                    "Ownable: caller is not the owner"
                )
            })
            it('reverts on 0 length', async () => {
                await expectRevert(
                    this.MVS.nextEpoche(0, 0, opt(owner)),
                    "length != 0"
                )
            })
            it('works and leaves epocheNumber unchanged', async () => {
                const epocheNumberBefore = await this.MVS.getEpocheNumber();
                // pending reward rate = 2/s
                const epocheReceipt = await this.MVS.nextEpoche(62899200, 10000, opt(owner));
                const now = await time.latest();
                await expectEvent(epocheReceipt, "NewEpoche", {
                    start: now.add(new BN(StakingConfig.withdrawLength.toString())),
                    end: now.add(new BN(StakingConfig.withdrawLength.toString())).add(new BN('10000')),
                    pendingRewardRate: '62899200'
                })
                assert.equal(await this.MVS.isWithdrawPhase(), true);
                assert.equal((await this.MVS.getEpocheNumber()).toString(), epocheNumberBefore.toString());
            })
            it('only callable once in withdrawPhase', async () => {
                await expectRevert(
                    this.MVS.nextEpoche(1, 1, opt(owner)),
                    "only once in withdraw Phase"
                )
            })
            describe('apply new reward rate', async () => {
                it('only Owner', async () => {
                    await expectRevert(
                        this.MVS.applyNewRewardRate(opt(bob)),
                        "Ownable: caller is not the owner"
                    )
                })
                it('not before epoche starts', async () => {
                    await expectRevert(
                        this.MVS.applyNewRewardRate(opt(owner)),
                        "only after withdrawPhase"
                    )
                })
            })
        })
        describe('bot functionality', async () => {
            it('can only be withdrawn by owner', async () => {
                await expectRevert(
                    this.MVS.withdrawLiquidityToBot(bot, 1, opt(bob)),
                    "Ownable: caller is not the owner"
                );
            })
            it('cannot be withdrawn to without being registered', async () => {
                await expectRevert(
                    this.MVS.withdrawLiquidityToBot(bot, 1, opt(owner)),
                    "recipient must be a registered bot"
                )
            })
            it('cannot register as bot without being whitelisted', async () => {
                await expectRevert(
                    this.MVS.registerAsBot(opt(bot)),
                    "only whitelisted bots can register"
                )
            })
            it('cannot remove non existing bot', async () => {
                await expectRevert(
                    this.MVS.removeBot(bot, opt(owner)),
                    "not a bot"
                )
            })
            it('can only add and remove bot as owner', async () => {
                await expectRevert(
                    this.MVS.addBot(bot, opt(bot)),
                    "Ownable: caller is not the owner"
                )
                await expectRevert(
                    this.MVS.removeBot(bot, opt(bot)),
                    "Ownable: caller is not the owner"
                )
            })
            it('adds bot as owner', async () => {
                assert.equal(await this.MVS.isBot(bot), false);
                await this.MVS.addBot(bot, opt(owner));
                assert.equal(await this.MVS.isBot(bot), true);
            })
            it('cannot add bot twice', async () => { 
                await expectRevert(
                    this.MVS.addBot(bot, opt(owner)),
                    "already exists"
                )
            })
            it('added bot can register', async () => {
                assert.equal(await this.MVS.isBot(bot), true);
                assert.equal(await this.MVS.isRegisteredBot(bot), false);
                let registerReceipt = await this.MVS.registerAsBot(opt(bot));
                await expectEvent(registerReceipt, "BotRegistered", { account: bot });
                assert.equal(await this.MVS.isRegisteredBot(bot), true);
            })
            it('cannot withdraw to bot in withdrawPhase', async () => {
                await expectRevert(
                    this.MVS.withdrawLiquidityToBot(bot, 1, opt(owner)),
                    "can only use in locking phase"
                )
            })
            it('from the previous test: can apply new reward rate in locking phase', async () => {
                await time.increase(1000);
                assert.equal(await this.MVS.getRewardRate(), '31449600');
                const rewardRateReceipt = await this.MVS.applyNewRewardRate(opt(owner));
                assert.equal(await this.MVS.getRewardRate(), '62899200');
            })
            it('from the previous test: cannot set to 0', async () => {
                await expectRevert(
                    this.MVS.applyNewRewardRate(opt(owner)),
                    "no pending rewardRate"
                )
            })
            it('transfers tokens, emits event and updates state', async () => {
                assert.equal((await this.MVS.getCurrentWithdrawPercentage()).toString(), '1000000000');

                const botBalanceBefore = await provider.getBalance(bot);
                const withdrawToBotReceipt = await this.MVS.withdrawLiquidityToBot(bot, 1, opt(owner));
                assert.equal(await this.MVS.getBotBalance(), '-1');
                assert.equal((await this.MVS.getCurrentWithdrawPercentage()).toString(), '750000000');
                console.log("log in bot", await provider.getBalance(bot), new BN(botBalanceBefore._hex).add(new BN('1')));
                assert.equal(new BN((await provider.getBalance(bot))._hex).toString(), (new BN(botBalanceBefore._hex)).add(new BN('1')).toString());
                await expectEvent(withdrawToBotReceipt, "WithdrawToBot", {
                    recipient: bot,
                    amount: '1'
                })
            })
        })
    })
    describe('withdraw_withLosses', async () => {
        it('calculates withdraw percentage correctly', async () => {
            const totalAmountStaked = (await this.MVS.getTotalAmountStaked()).toNumber();
            await this.MVS.deposit(tokenId(), opt(alice, 100 - totalAmountStaked));
            await this.MVS.withdrawLiquidityToBot(bot, 49, opt(owner));
            assert.equal((await this.MVS.getCurrentWithdrawPercentage()).toString(), '500000000');
            await time.increase(10000);
        })
        it('cannot withdraw more than the percentage', async() => {
            await expectRevert(
                this.MVS.withdraw(idCounter, 96/2 + 1, opt(alice)),
                "getCurrentWithdrawPercentage"
            )
            await expectRevert.unspecified(
                this.MVS.withdraw(idCounter, MAX_UINT256, opt(alice)),
            )
        })
        it('can withdraw exactly percentage, emits event', async () => {
            const aliceBalanceBefore = await provider.getBalance(alice);
            let withdrawTransactionReceipt = await this.MVS.withdraw(idCounter, 48, opt(alice));
            await expectEvent(withdrawTransactionReceipt, "Withdrawn", {
                tokenId: idCounter.toString(),  
                recipient: alice,
                amount: '48'
            })
            const weiSpentInGas = withdrawTransactionReceipt.receipt.gasUsed * 
                                  Number(withdrawTransactionReceipt.receipt.effectiveGasPrice)
            // check that the 48 WEI are added to balance of alice.
            assert.equal(
                (new BN((await provider.getBalance(alice)).toString())
                    .add(new BN(weiSpentInGas.toString()))
                    .sub(new BN(aliceBalanceBefore.toString()))
                ).toString(),
                '48'
            );
            
        })
        it('can only withdraw once', async () => {
            await expectRevert(
                this.MVS.withdraw(idCounter, 48, opt(alice)),
                "only one withdraw per epoche"
            )
        })
    })
    describe('views', async () => {
        it('getUpdatedRewardsDue()', async () =>{
            assert.equal(await this.MVS.isWithdrawPhase(), true);
            await this.MVS.deposit(tokenId(), opt(bob, 1));
            assert.equal(await this.MVS.getUpdatedRewardsDue(idCounter), "0");
            await time.increase(10);
            assert.equal(await this.MVS.getUpdatedRewardsDue(idCounter), "0");
            await this.MVS.nextEpoche(62899200, 10000, opt(owner));
            await time.increase(1001);
            assert.equal(await this.MVS.isWithdrawPhase(), false)
            await this.MVS.deposit(tokenId(), opt(bob, 1));
            assert.equal(await this.MVS.getUpdatedRewardsDue(idCounter), "0");
            await time.increase(10);
            assert.equal(await this.MVS.getUpdatedRewardsDue(idCounter), "20");
        })
    })
})