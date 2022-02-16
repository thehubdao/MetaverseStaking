// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";


interface IMetaverseStaking is IERC721Upgradeable {

    struct NftStats {
        uint104 amount;
        uint48 lastUpdateTime;
        uint104 rewardsDue;
        mapping(uint256 => bool) hasWithdrawnInEpoche;
    }


    //// USER ////

    // mint a new nft with amount staked tokens
    function deposit(uint256 amount) external;

    //increase the amount of staked tokens of an already existing nft
    function increasePosition(uint256 tokenId, uint256 amount) external;

    //withdraw from nft
    function withdraw(uint256 tokenId, uint256 amount) external;

    //get MGH rewards for nft
    function getRewards(uint256 tokenId) external;

    //function signature is "0xbd9ae7d1".
    function approveAndCallHandlerDeposit(address _sender, uint256 amount) external;

    //function signature is "0xd24c0de3".
    function approveAndCallHandlerIncrease(address _sender, uint256 tokenId, uint256 amount) external;


    //// VIEWS ////

    // total amount of tokens staked
    function getTotalAmountStaked() external view returns(uint256);

    // mgh rewards in token per (staking)-token and second
    function getRewardRate() external view returns(uint256);

    // returns current epoche. Increments when the withdraw phase ends
    function getEpocheNumber() external view returns(uint256);

    // returns wether withdraws are currently open
    function isWithdrawPhase() external view returns(bool);

    function viewNftStats(uint256 tokenId) external view 
        returns(
            uint104 amountStaked,
            uint48 lastTimeRewardsUpdate,
            uint104 rewardsDue,
            bool hasWithdrawnInEpoche
        );

    // returns the actual amount of mgh rewards claimable right now for an nft
    function getUpdatedRewardsDue(uint256 tokenId) external view returns(uint256);

    // returns the amount of staked tokens that can be withdrawn now or in the next withdraw phase
    // if nothing from the nft can be withdrawn this withdraw phase, reverts with error message.
    function getWithdrawableAmount(uint256 tokenId) external view returns(uint256);


    ///// EVENTS //////
    event Deposit(uint256 indexed tokenId, address indexed staker, uint256 amount);
    event PositionIncreased(uint256 indexed tokenId, address indexed staker, uint256 amount);
    event Withdrawn(uint256 indexed tokenId, address indexed recipient, uint256 amount);
    event RewardPaid(uint256 indexed tokenId, address indexed recipient, uint256 amount);

    event NewEpoche(uint256 start, uint256 length, uint256 pendingRewardRate);

    event botAdded(address indexed account);
    event botRemoved(address indexed account);
    event BotRegistered(address indexed account);

    event WithdrawToBot(address indexed recipient, uint256 amount);
    event DepositFromBot(address indexed bot, uint256 amount);
}