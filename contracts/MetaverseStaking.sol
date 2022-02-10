// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

// libraries
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// inheritance
import "./ERC721Upgradeable.sol";

/* import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol"; */
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./IMetaverseStaking.sol";


contract MetaverseStaking is ERC721Upgradeable, OwnableUpgradeable, IMetaverseStaking {
    using SafeERC20 for IERC20;
    
    uint256 constant private BASIS_POINTS = 1e4;

    address public MGH_TOKEN;
    address public currency;
    uint256 public totalAmountStaked;
    uint256 public withdrawPeriod;
    uint256 public rewardPerTokenAndSecond;
    uint256 public pendingRewardRate;

    //counter for ordered minting
    uint256 internal _idCounter;
    uint256 internal _epocheCounter;

    int256 totalBotBalance;

    mapping(uint256 => uint256) withdrawPercentage;

    Epoche public currentEpoche;

    struct Epoche {
        uint256 start;
        uint256 end;
        uint256 lastEnd;
    }

    mapping(uint256 => NftStats) private _nftStats;

    mapping(address => bool) private _isBot;

    function initialize(
        address mghToken,
        address _currency,
        uint256 _firstEpocheStart,
        uint256 _firstEpocheLength,
        uint256 _withdrawPeriod,
        uint256 _rewardPerTokenAndSecond,
        string calldata name,
        string calldata symbol,
        string calldata baseUri
    ) public initializer {
        __Ownable_init();
        __ERC721_init(name, symbol, baseUri);
        MGH_TOKEN = mghToken;
        currency = _currency;
        if(_firstEpocheStart == 0) _firstEpocheStart = block.timestamp + _withdrawPeriod;
        currentEpoche = Epoche(_firstEpocheStart, _firstEpocheStart + _firstEpocheLength, block.timestamp);
        withdrawPeriod = _withdrawPeriod;
        rewardPerTokenAndSecond = _rewardPerTokenAndSecond;
    }

    function deposit(uint104 amount) public payable override {
        require(amount != 0, "amount != 0");
        IERC20(currency).safeTransferFrom(msg.sender, address(this), amount);

        uint256 mintedId = _mint();

        NftStats storage stats = _nftStats[mintedId];
        stats.amount = amount;
        stats.lastUpdateTime = uint48(block.timestamp);

        totalAmountStaked += amount;

        emit Deposit(mintedId, msg.sender, amount);
    }

    function increasePosition(uint256 tokenId, uint104 amount) public payable override {
        _updateStakingRewardsAndCheckOwner(tokenId);
        IERC20(currency).safeTransferFrom(msg.sender, address(this), amount);

        _nftStats[tokenId].amount += amount;
        totalAmountStaked += amount;

        emit PositionIncreased(tokenId, msg.sender, amount);
    }

    function withdraw(uint256 tokenId, uint104 amount) public override {
        require(amount != 0, "amount != 0");
        require(isWithdrawPhase(), "not withdraw time");
/*         require(block.timestamp - nftStats[tokenId].lastWithdrawTime > , "already withdrew this epoche"); */
/*         _nftStats[tokenId].hasWithdrawnInEpoche[_epocheCounter] = true; */
        _updateStakingRewardsAndCheckOwner(tokenId);
        uint256 epocheNumber = getEpocheNumber();


        totalAmountStaked -= amount;
        _nftStats[tokenId].amount -= amount;
        IERC20(currency).safeTransfer(msg.sender, amount);

        emit Withdrawn(tokenId, msg.sender, amount);
    }

    function getRewards(uint256 tokenId) public override {
        _updateStakingRewards(tokenId);
        address tokenOwner = ownerOf(tokenId);
        uint256 rewardsDue = _nftStats[tokenId].rewardsDue;
        // setting to 1 to save gas, value donated is practically 0 and cannot be exploited because of gas costs
        _nftStats[tokenId].rewardsDue = 1;
        IERC20(MGH_TOKEN).safeTransfer(tokenOwner, rewardsDue);

        emit RewardPaid(tokenId, tokenOwner, rewardsDue);
    }


    //////////////// Owner functionality ///////////////////

    function nextEpoche(uint256 _pedingRewardRate, uint256 length) external override onlyOwner {
        require(block.timestamp > currentEpoche.end, "only once in withdraw Phase");
        currentEpoche = Epoche(
            block.timestamp + withdrawPeriod,
            block.timestamp + withdrawPeriod + length,
            currentEpoche.end
        );
        pendingRewardRate = _pedingRewardRate;
        _epocheCounter += 1;
        emit NewEpoche(currentEpoche.start, currentEpoche.end, _pedingRewardRate);
    }

    function applyNewRewardRate() external override onlyOwner {
        require(!isWithdrawPhase(), "can only apply when withdraw ended");
        require(pendingRewardRate != 0, "no pending rewardRate");
        rewardPerTokenAndSecond = pendingRewardRate;
        pendingRewardRate = 0;
    }

    function rescueToken(address token) external onlyOwner {
        require(token != currency);
        IERC20(token).transfer(msg.sender, IERC20(token).balanceOf(address(this)));
    }

    // Bot related //
    function addBot(address account) external override onlyOwner {
        require(!_isBot[account], "already exists");
        _isBot[account] = true;
        emit botAdded(account);
    }

    function removeBot(address account) external override onlyOwner {
        require(_isBot[account], "not a bot");
        _isBot[account] = false;
        emit botRemoved(account);
    }

    function withdrawLiquidityToBot(address recipient, uint256 amount) external override onlyOwner {
        require(_isBot[recipient], "recipient must be a bot");
        require(!isWithdrawPhase());
        totalBotBalance -= int256(amount);
        IERC20(currency).transfer(recipient, amount);
        _updateWithdrawPercentage();
        emit WithdrawToBot(recipient, amount);
    }

    function depositAsBot(uint256 amount) external {
        require(_isBot[msg.sender], "only bots can deposit here");
        require(!isWithdrawPhase());
        IERC20(currency).safeTransferFrom(msg.sender, address(this), amount);
        totalBotBalance += int256(amount);
        _updateWithdrawPercentage();
        emit DepositFromBot(msg.sender, amount);
    }

    ////////////////        Internal      ///////////////////

    function _updateWithdrawPercentage() internal {
        withdrawPercentage[getEpocheNumber()] = totalBotBalance >= 0 
            ? BASIS_POINTS
            : uint256(int256(totalAmountStaked) + totalBotBalance) * BASIS_POINTS / totalAmountStaked;
    }

    function _mint() internal returns(uint256 mintedId) {
        mintedId = _idCounter;
        _safeMint(msg.sender, mintedId);
        _idCounter += 1;
    }

    function _updateStakingRewardsAndCheckOwner(uint256 tokenId) internal {
        require(msg.sender == ownerOf(tokenId), "not your nft");
        _updateStakingRewards(tokenId);
    }

    function _updateStakingRewards(uint256 tokenId) internal {
        NftStats storage stats = _nftStats[tokenId];
        uint256 _lastTimeApplicable = lastTimeRewardApplicable();
        if(_lastTimeApplicable > stats.lastUpdateTime) {
            stats.rewardsDue += uint48((_lastTimeApplicable - stats.lastUpdateTime) * stats.amount * rewardPerTokenAndSecond);
        }
        //alternatively do the next line in the if statement.
        //would lead to exploit, where people earn while nothing is staked during withdraw phase
        stats.lastUpdateTime = uint48(block.timestamp);
    }

    function lastTimeRewardApplicable() internal view returns(uint256) {
        Epoche memory epoche = currentEpoche;
        if(block.timestamp < epoche.start) {
            return epoche.lastEnd;
        }
        if(block.timestamp > epoche.end) {
            return epoche.end;
        }
        return block.timestamp;
    }

    // method for getting a constant but unique number for one withdrawPhase
    function getEpocheNumber() internal view returns(uint256) {
        uint256 epocheCounter = _epocheCounter;
        if(block.timestamp > currentEpoche.start) {
            epocheCounter += 1;
        }
        return epocheCounter;
    }

    function _calculateMaxWithdraw() internal view returns(uint256) {
        return IERC20(currency).balanceOf(address(this)) * BASIS_POINTS / totalAmountStaked;
    }

/*     function _calculateRebaseFactor() internal view returns(uint256) {
        uint256 contractBalance = IERC20(currency).balanceOf(address(this));
        uint256 _totalAmountStaked = totalAmountStaked;
        if(_totalAmountStaked <= contractBalance) {
            return 10000;
        }
        return contractBalance * 10000 / _totalAmountStaked;
    } */

    ////////////////      Views    ///////////////////

    function isWithdrawPhase() public view override returns(bool) {
        return block.timestamp < currentEpoche.start ||
               block.timestamp > currentEpoche.end;
    }

    function viewNftStats(uint256 tokenId) public view override returns(uint104, uint48, uint104, uint256) {
        require(_exists(tokenId), "Query for non existent Token");
        return (_nftStats[tokenId].amount, _nftStats[tokenId].lastUpdateTime, _nftStats[tokenId].rewardsDue, 0);
    }

    function getUpdatedRewardsDue(uint256 tokenId) external view returns(uint256) {
        NftStats storage stats = _nftStats[tokenId];
        uint104 amount = stats.amount;
        uint48 lastUpdateTime = stats.lastUpdateTime;
        uint104 rewardsDue = stats.rewardsDue;
        uint256 _lastTimeApplicable = lastTimeRewardApplicable();
        if(_lastTimeApplicable > stats.lastUpdateTime) {
            rewardsDue += uint104((_lastTimeApplicable - lastUpdateTime) * amount * rewardPerTokenAndSecond);
        }
        return rewardsDue;
    }

    function getWithdrawableAmount(uint256 tokenId) external view returns(uint256) {
        if(!_nftStats[tokenId].firstWithdrawInEpoche[getEpocheNumber()]){
           return withdrawPercentage[getEpocheNumber()] * _nftStats[tokenId].amount / BASIS_POINTS; 
        } 
        return 0;
    }

}