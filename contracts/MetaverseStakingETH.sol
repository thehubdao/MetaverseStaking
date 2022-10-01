// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IMetaverseStakingETH.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";


contract MetaverseStakingETH is ERC721, AccessControl, IMetaverseStakingETH {
    using SafeERC20 for IERC20;
    
    uint16 private constant BASIS_POINTS = 10_000;
    
    bytes32 public constant BOT_ROLE = keccak256("BOT");
    bytes32 public constant BOT_TRANSFERRER_ROLE = keccak256("BOT_TRANSFERRER");
    bytes32 public constant EPOCHE_MANAGER_ROLE = keccak256("EPOCHE_MAANGER");

    IERC20 public immutable REWARD_TOKEN;
    uint256 public constant WITHDRAW_TIME = 2 days;
    uint256 private constant MAX_EPOCHE_LENGTH = 52 weeks;
    uint256 private constant SZABO = 10**12;

    Epoche private _currentEpoche;

    uint32 public totalSupply;
    uint88 public totalStaked;

    mapping(uint256 => NFTStats) internal _stats;


    constructor(
        string memory name,
        string memory symbol,
        IERC20 _rewardToken,
        uint40 firstEpocheStart,
        uint40 firstEpocheLength,
        uint48 firstEpocheRewardPerSzaboAndSecond
    ) ERC721(name, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        REWARD_TOKEN = _rewardToken;

        if(firstEpocheStart == 0) firstEpocheStart = uint40(block.timestamp + WITHDRAW_TIME);

        _currentEpoche = Epoche(
            firstEpocheStart, 
            firstEpocheStart + firstEpocheLength, 
            uint40(block.timestamp), 
            BASIS_POINTS, 
            firstEpocheRewardPerSzaboAndSecond,
            firstEpocheRewardPerSzaboAndSecond
        );
    }

  // User Functions
    function deposit() public payable override returns(uint256 mintedId) {
        mintedId = totalSupply++;
        _mint(msg.sender, mintedId);

        NFTStats storage stats = _stats[mintedId];

        stats.amount = uint72(msg.value);
        stats.lastUpdateTime = uint40(block.timestamp);

        totalStaked += uint88(msg.value);
    }

    function increase(uint256 tokenId) public payable override {
        NFTStats storage stats = _stats[tokenId];
        Epoche storage epoche = _currentEpoche;

        uint256 value = msg.value;

        _updateReward(stats, epoche.start, epoche.end, epoche.lastEnd, epoche.rewardsPerSzaboAndSecond);

        stats.amount += uint72(value);
        stats.lastUpdateTime = uint40(block.timestamp);

        totalStaked += uint88(value);
    }

    function withdraw(uint256 tokenId, uint256 amount, bool claimRewards) external override {
        address owner = ownerOf(tokenId);
        require(msg.sender == owner, "only token owner can withdraw");

        NFTStats storage stats = _stats[tokenId];
        Epoche memory epoche = _currentEpoche;

        require(
            _canWithdraw(
                stats.lastWithdrawTime, 
                epoche.start, 
                epoche.end,
                epoche.lastEnd
            ), 
            "not withdraw time, or already withdrawn"
        );

        require(
            _withdrawLimit(
                stats.amount, 
                epoche.withdrawLimitBasisPoints
            ) >= amount,
            "withdraw limit exceeded"
        );

        _updateReward(stats, epoche.start, epoche.end, epoche.lastEnd, epoche.rewardsPerSzaboAndSecond);

        if(claimRewards) _getRewards(owner, stats);

        stats.amount -= uint72(amount);
        stats.lastWithdrawTime = uint40(block.timestamp);

        totalStaked -= uint88(amount);

        (bool suc,) = msg.sender.call{ value: amount }("");

        require(suc, "owner couldnt accept ETH");
    }

    function getRewards(uint256 tokenId) public override {
        _getRewards(ownerOf(tokenId), _stats[tokenId]);
    }

  // Internal helper functions
    function _getRewards(address owner, NFTStats storage stats) internal {
        uint256 value = stats.rewardsDue;
        stats.rewardsDue = 0;
        REWARD_TOKEN.safeTransfer(owner, value);
    }

    function _updateReward(
        NFTStats storage stats,
        uint256 start,
        uint256 end,
        uint256 lastEnd,
        uint256 rewardsPerSzaboAndSecond 
    ) internal {
        uint256 lastUpdated = stats.lastUpdateTime;
        uint256 lastApplicable = _lastTimeRewardApplicable(start, end, lastEnd);

        if(lastUpdated < lastApplicable) {
            stats.rewardsDue += uint104(stats.amount * (lastApplicable - lastUpdated) * rewardsPerSzaboAndSecond / SZABO);
        }

        stats.lastUpdateTime = uint40(block.timestamp);
    }

    function _updateWithdrawLimitBasisPoints() internal {
        uint256 balance = address(this).balance;
        uint256 totalStake = totalStaked;

        if(balance >= totalStake) _currentEpoche.withdrawLimitBasisPoints = BASIS_POINTS;
        else _currentEpoche.withdrawLimitBasisPoints = BASIS_POINTS - uint16(BASIS_POINTS * (totalStake - balance) / totalStake);
    }

   // VIEW internal 
    function _lastTimeRewardApplicable(uint256 start, uint256 end, uint256 lastEnd) internal view returns(uint256) {

        if(block.timestamp < start) {
            return lastEnd;
        }

        if(block.timestamp > end) {
            return end;
        }

        return block.timestamp;
    }

    function _canWithdraw(
        uint256 lastWithdrawn,
        uint256 start,
        uint256 end,
        uint256 lastEnd
    ) internal view returns(bool) {
        if(block.timestamp > end) {
            return lastWithdrawn < end;
        }

        if(block.timestamp < start) {
            return lastWithdrawn < lastEnd;
        }

        return false;
    }

    function _withdrawLimit(uint256 amount, uint256 withdrawLimitBasisPoints) internal pure returns(uint256) {
        return withdrawLimitBasisPoints * amount / BASIS_POINTS;
    }

    function _isWithdrawPhase(uint256 start, uint256 end) internal view returns(bool) {
        return block.timestamp < start || block.timestamp > end;
    }

  // external view 

    function getCurrentEpoche() external view override returns(
        uint256 start,
        uint256 end,
        uint256 rewardPerSzaboAndSecond,
        uint256 pendingRewardPerSzaboAndSecond,
        uint256 withdrawLimitBasisPoints
    ) {
        return (
            _currentEpoche.start,
            _currentEpoche.end,
            _currentEpoche.rewardsPerSzaboAndSecond,
            _currentEpoche.pendingRewardsPerSzaboAndSecond,
            _currentEpoche.withdrawLimitBasisPoints
        );
    }

    function tokenInfo(uint256 tokenId) 
        external 
        override 
        view 
        returns(uint256 amount, bool canWithdraw, uint256 rewardsDue)
    {
        NFTStats storage stats = _stats[tokenId];

        Epoche memory e = _currentEpoche;

        amount = stats.amount;
        canWithdraw = _canWithdraw(
            stats.lastWithdrawTime, 
            e.start, 
            e.end, 
            e.lastEnd
        );
        rewardsDue = (
            stats.rewardsDue + 
            uint104(
                stats.amount * (
                    _lastTimeRewardApplicable(e.start, e.end, e.lastEnd) - 
                    stats.lastUpdateTime
                ) * 
                e.rewardsPerSzaboAndSecond / 
                SZABO
            )
        );
        
    }
    function supportsInterface(bytes4 id) public view override(AccessControl, ERC721) returns(bool) {
        return ERC721.supportsInterface(id) || AccessControl.supportsInterface(id);
    }

  // AC
   // Epoche Manager 
    function triggerNextEpoche(
        uint32 rewardRate, 
        uint40 length
    ) external override onlyRole(EPOCHE_MANAGER_ROLE) {
        uint40 lastEnd = _currentEpoche.end;

        require(block.timestamp > lastEnd, "too early");
        // defend against accidentally setting a too long epoche
        require(length <= MAX_EPOCHE_LENGTH);
        
        uint40 start = uint40(block.timestamp + WITHDRAW_TIME);
        _currentEpoche.start = start;
        _currentEpoche.end = start + length;
        _currentEpoche.lastEnd = lastEnd;
        _currentEpoche.pendingRewardsPerSzaboAndSecond = rewardRate;
    }

    function enableNewRewardRate() external override onlyRole(EPOCHE_MANAGER_ROLE) {
        require(block.timestamp > _currentEpoche.start, "too early");

        _currentEpoche.rewardsPerSzaboAndSecond = _currentEpoche.pendingRewardsPerSzaboAndSecond;
    }
   // Admin
    function transferFundsToBot(
        address bot, 
        uint256 amount
    ) external override onlyRole(BOT_TRANSFERRER_ROLE) {
        require(! _isWithdrawPhase(_currentEpoche.start, _currentEpoche.end));
        require(hasRole(BOT_ROLE, bot), "can only transfer to BOT");

        (bool suc,) = bot.call{ value: amount }("");
        require(suc, "bot couldnt accept ETH");

        _updateWithdrawLimitBasisPoints();
    }

   // BOT 
    function depositAsBot() external payable override onlyRole(BOT_ROLE) {
        require(! _isWithdrawPhase(_currentEpoche.start, _currentEpoche.end));
        _updateWithdrawLimitBasisPoints();
    }


    
  // default action
    receive() external payable {
        deposit();
    }

    fallback() external payable  {
        deposit();
    }
}