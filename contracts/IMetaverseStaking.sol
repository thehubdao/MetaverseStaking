// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";


interface IMetaverseStaking is IERC721Upgradeable {

    struct NftStats {
        uint104 amount;
        uint48 lastUpdateTime;
        uint104 rewardsDue;
        mapping(uint256 => bool) firstWithdrawInEpoche;
    }


    //// User ////
    function deposit(uint104 amount) external payable;
    function increasePosition(uint256 tokenId, uint104 amount) external payable;
    function withdraw(uint256 tokenId, uint104 amount) external;
    function getRewards(uint256 tokenId) external;


    //// Admin ////
    function nextEpoche(uint256 _pedingRewardRate, uint256 length) external;
    function applyNewRewardRate() external;
    function removeBot(address account) external;
    function addBot(address account) external;

    //// Bot ////
    function withdrawLiquidityToBot(address recipient, uint256 amount) external;


    //// VIEWS ////
    function isWithdrawPhase() external view returns(bool);

    function viewNftStats(uint256 tokenId) external view returns(uint104, uint48, uint104, uint256);

    event Deposit(uint256 indexed tokenId, address indexed staker, uint256 amount);
    event PositionIncreased(uint256 indexed tokenId, address indexed staker, uint256 amount);
    event Withdrawn(uint256 indexed tokenId, address indexed recipient, uint256 amount);
    event RewardPaid(uint256 indexed tokenId, address indexed recipient, uint256 amount);
    event NewEpoche(uint256 start, uint256 length, uint256 pendingRewardRate);
    event botAdded(address indexed account);
    event botRemoved(address indexed account);
    event WithdrawToBot(address indexed recipient, uint256 amount);
    event DepositFromBot(address indexed bot, uint256 amount);
}