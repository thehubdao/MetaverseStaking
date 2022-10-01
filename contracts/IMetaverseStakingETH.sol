// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


interface IMetaverseStakingETH {

    struct NFTStats {
        uint72 amount;
        uint40 lastUpdateTime;
        uint104 rewardsDue;
        uint40 lastWithdrawTime;
    }

    struct Epoche {
        uint40 start;
        uint40 end;
        uint40 lastEnd;
        uint16 withdrawLimitBasisPoints;
        // range from get 3.1536 * 10**(-5) to 8.876 * 10**9 `RewardToken`  per ETH staked and YEAR passed (given 18 DECIMALS !)
        uint48 rewardsPerSzaboAndSecond;
        uint48 pendingRewardsPerSzaboAndSecond;
    }

  // User
    function deposit() external payable returns(uint256 tokenIdMinted);
    function increase(uint256 tokenId) external payable;
    function withdraw(uint256 tokenId, uint256 amount, bool claimRewards) external;
    function getRewards(uint256 tokenId) external;

  // External View
    function getCurrentEpoche() external view returns(
        uint256 start,
        uint256 end,
        uint256 rewardPerSzaboAndSecond,
        uint256 pendingRewardPerSzaboAndSecond,
        uint256 withdrawLimitBasisPoints
    );

    function tokenInfo(uint256 tokenId) external view returns(
        uint256 amount, 
        bool canWithdraw, 
        uint256 rewardsDue
    );
  // AC
   // EpocheManager
    function triggerNextEpoche(
        uint32 rewardRate, 
        uint40 length
    ) external;

    function enableNewRewardRate() external;

   // Admin
    function transferFundsToBot(address bot, uint256 amount) external;
  // Bot
    function depositAsBot() external payable;   
}

