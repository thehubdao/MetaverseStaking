// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;
pragma abicoder v2;

// libraries
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// inheritance
import "./ERC721Upgradeable.sol";

/* import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol"; */
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./Interfaces/IMetaverseStakingFrontend.sol";


contract MetaverseStaking is ERC721Upgradeable, OwnableUpgradeable, IMetaverseStaking {
    using SafeERC20 for IERC20;

    uint256 constant private BILLION_PRECISION_POINTS = 1e9;
    uint256 constant private SECONDS_PER_YEAR = 52 weeks;

    uint256 private _withdrawPeriod;

    address public MGH_TOKEN;
    address public currency;
    uint256 private _totalAmountStaked;
    uint256 private _maximumAmountStaked;
    uint256 private _withdrawPercentage;
    uint256 private _rewardPerTokenAndYear;
    uint256 private _pendingRewardRate;

    uint256 private _epocheCounter;
    Epoche public currentEpoche;

    struct Epoche {
        uint256 start;
        uint256 end;
        uint256 lastEnd;
    }

    struct initNftMetadata {
        string name;
        string symbol;
        string baseUri;
    }

    mapping(uint256 => NftStats) private _nftStats;

    int256 private _totalBotBalance;
    mapping(address => bool) private _isBot;
    mapping(address => bool) private _isRegistered;

    constructor() initializer {}

    function initialize(
        address mghToken,
        address _currency,
        uint256 _firstEpocheStart,
        uint256 _firstEpocheLength,
        uint256 __withdrawPeriod,
        uint256 __rewardPerTokenAndYear,
        uint256 __maximumAmountStaked,
        initNftMetadata memory nftMetaData
    ) public initializer {
        __Ownable_init();
        __ERC721_init(nftMetaData.name, nftMetaData.symbol, nftMetaData.baseUri);
        MGH_TOKEN = mghToken;
        currency = _currency;
        if(_firstEpocheStart == 0) _firstEpocheStart = block.timestamp + __withdrawPeriod;
        currentEpoche = Epoche(_firstEpocheStart, _firstEpocheStart + _firstEpocheLength, block.timestamp);
        _withdrawPeriod = __withdrawPeriod;
        _rewardPerTokenAndYear = __rewardPerTokenAndYear;
        _maximumAmountStaked = __maximumAmountStaked * 1 ether;
        _withdrawPercentage = BILLION_PRECISION_POINTS;
    }
    
    // we have a guarantee from sand token contract, that the first param equals the former msg.sender (the approver)
    function approveAndCallHandlerDeposit(address _sender, uint256 tokenId, uint256 amount) external override {
        require(msg.sender == currency, "callable by token contract");
        _depositFor(_sender, tokenId, amount);
    }

    function approveAndCallHandlerIncrease(address _sender, uint256 tokenId, uint256 amount) external override {
        require(msg.sender == currency, "callable by token contract");
        _increasePositionFor(_sender, tokenId, amount);
    }

    function deposit(uint256 tokenId, uint256 amount) external override {
        require(amount != 0, "amount != 0");
        _depositFor(msg.sender, tokenId, amount);
    }

    function increasePosition(uint256 tokenId, uint256 amount) external override {
        require(amount != 0, "amount != 0");
        _increasePositionFor(msg.sender, tokenId, amount);
    }

    function withdraw(uint256 tokenId, uint256 amount) external override {
        require(amount != 0, "amount != 0");
        require(isWithdrawPhase(), "not withdraw time");
        require(msg.sender == ownerOf(tokenId), "not your nft");

        NftStats storage stats = _nftStats[tokenId];

        // if not enough funds are available, check that user only withdraws their part and only once in this epoche
        uint256 percentage = _withdrawPercentage;
        if(percentage != BILLION_PRECISION_POINTS) {
            uint256 epocheNumber = getEpocheNumber();
            require(!stats.hasWithdrawnInEpoche[epocheNumber], "only one withdraw per epoche");
            stats.hasWithdrawnInEpoche[epocheNumber] = true;
            require(amount * BILLION_PRECISION_POINTS <= stats.amount * percentage, "getCurrentWithdrawPercentage");
        }

        _updateStakingRewards(tokenId);
        stats.amount -= uint104(amount);
        _totalAmountStaked -= amount;

        IERC20(currency).safeTransfer(msg.sender, amount);


        emit Withdrawn(tokenId, msg.sender, amount);
    }

    function getRewards(uint256 tokenId) external override {
        address tokenOwner = ownerOf(tokenId);

        _updateStakingRewards(tokenId);
        uint256 rewardsDue = _nftStats[tokenId].rewardsDue;
        // costs more gas to set to 1 instead of 0, but this is overpowered by the next time this is set to a non 0 value from 1 (or 0);
        // careful, this only works as long as 1 unit of the token is practically worthless:
        // setting to 1 to save gas, value donated is practically 0 and cannot be exploited because of gas costs
        _nftStats[tokenId].rewardsDue = 1;
        IERC20(MGH_TOKEN).safeTransfer(tokenOwner, rewardsDue);

        emit RewardPaid(tokenId, tokenOwner, rewardsDue);
    }

    function updateWithdrawPercentageManually() external {
        require(!isWithdrawPhase(), "can only be updated, when locked");
        _updateWithdrawPercentage();
    }


    //////////////// Owner functionality ///////////////////

    function nextEpoche(uint256 pendingRewardRate, uint256 length) external onlyOwner {
        require(block.timestamp > currentEpoche.end, "only once in withdraw Phase");
        require(length != 0, "length != 0");
        currentEpoche = Epoche(
            block.timestamp + _withdrawPeriod,
            block.timestamp + _withdrawPeriod + length,
            currentEpoche.end
        );
        _pendingRewardRate = pendingRewardRate;
        _epocheCounter += 1;
        emit NewEpoche(currentEpoche.start, currentEpoche.end, pendingRewardRate);
    }

    function applyNewRewardRate() external onlyOwner {
        require(!isWithdrawPhase(), "only after withdrawPhase");
        require(_pendingRewardRate != 0, "no pending rewardRate");
        _rewardPerTokenAndYear = _pendingRewardRate;
        _pendingRewardRate = 0;
    }

    function rescueToken(address token) external onlyOwner {
        require(token != currency, "cannot rescue invested funds");
        IERC20(token).safeTransfer(msg.sender, IERC20(token).balanceOf(address(this)));
    }

    // Bot related //
    function addBot(address account) external onlyOwner {
        require(!_isBot[account], "already exists");
        _isBot[account] = true;
    }

    function removeBot(address account) external onlyOwner {
        require(_isBot[account], "not a bot");
        _isBot[account] = false;
        _isRegistered[account] = false;
    }

    function withdrawLiquidityToBot(address recipient, uint256 amount) external onlyOwner {
        require(_isRegistered[recipient], "recipient must be a registered bot");
        require(!isWithdrawPhase(), "can only use in locking phase");
        _totalBotBalance -= int256(amount);
        IERC20(currency).transfer(recipient, amount);
        _updateWithdrawPercentage();
        emit WithdrawToBot(recipient, amount);
    }

    function depositFromBot(address bot, uint256 amount) external {
        require(_isRegistered[bot], "can only deposit from bot");
        require(msg.sender == bot || msg.sender == owner());
        require(!isWithdrawPhase());
        IERC20(currency).transferFrom(bot, address(this), amount);
        _totalBotBalance += int256(amount);
        _updateWithdrawPercentage();
        emit DepositFromBot(bot, amount);
    }

    function registerAsBot() external {
        require(_isBot[msg.sender], "only whitelisted bots can register");
        _isRegistered[msg.sender] = true;
        emit BotRegistered(msg.sender);
    }

    function setBaseUri(string memory newUri) external onlyOwner {
        _baseUri = newUri;
    }

    function setMaximumAmount(uint256 amountInEther) external onlyOwner {
        _maximumAmountStaked = amountInEther * 1 ether;
    }

    ////////////////        Internal      ///////////////////

    function _depositFor(address _sender, uint256 tokenId, uint256 amount) internal {
        require(amount + _totalAmountStaked <= _maximumAmountStaked, "maximum amount is reached");
        IERC20(currency).safeTransferFrom(_sender, address(this), amount);

        _mint(_sender, tokenId);

        NftStats storage stats = _nftStats[tokenId];
        stats.amount = uint104(amount);
        stats.lastUpdateTime = uint48(block.timestamp);

        _totalAmountStaked += amount;

        emit Deposit(tokenId, _sender, amount);
    }

    function _increasePositionFor(address _sender, uint256 tokenId, uint256 amount) internal {
        require(amount + _totalAmountStaked <= _maximumAmountStaked, "maximum amount is reached");
        require(_sender == ownerOf(tokenId), "can only deposit for owned nft");
        IERC20(currency).safeTransferFrom(_sender, address(this), amount);
        _updateStakingRewards(tokenId);

        _nftStats[tokenId].amount += uint104(amount);
        _totalAmountStaked += amount;

        emit PositionIncreased(tokenId, _sender, amount);
    }

    function _updateWithdrawPercentage() internal {
        uint256 totalAmountStaked = _totalAmountStaked;
        if(totalAmountStaked == 0) {
            _withdrawPercentage = BILLION_PRECISION_POINTS;
            return;
        }
        _withdrawPercentage = _totalBotBalance >= 0
            ? BILLION_PRECISION_POINTS
            : (totalAmountStaked - uint256(_totalBotBalance * (-1))) * BILLION_PRECISION_POINTS / totalAmountStaked;
    }

    function _updateStakingRewards(uint256 tokenId) internal {
        NftStats storage stats = _nftStats[tokenId];
        uint256 _lastTimeApplicable = _lastTimeRewardApplicable();
        uint256 _lastTimeUpdated = stats.lastUpdateTime;
        uint256 timePassed = _lastTimeApplicable > _lastTimeUpdated
            ? _lastTimeApplicable - _lastTimeUpdated
            : 0;
        if(timePassed > 0) {
            stats.rewardsDue += uint48(timePassed * stats.amount * _rewardPerTokenAndYear / SECONDS_PER_YEAR);
        }
        //alternatively do the next line in the if statement.
        //would lead to exploit, where people earn while nothing is staked during withdraw phase
        stats.lastUpdateTime = uint48(block.timestamp);
    }

    function _lastTimeRewardApplicable() internal view returns(uint256) {
        if(block.timestamp < currentEpoche.start) {
            return currentEpoche.lastEnd;
        }
        if(block.timestamp > currentEpoche.end) {
            return currentEpoche.end;
        }
        return block.timestamp;
    }

    ////////////////    Views    ////////////////

    function getTotalAmountStaked() external view override returns(uint256) {
        return _totalAmountStaked;
    }

    function getMaximumAmountStaked() external view override returns(uint256) {
        return _maximumAmountStaked;
    }

    function getRewardRate() external view override returns(uint256) {
        return _rewardPerTokenAndYear;
    }

    // method for getting a constant but unique number for one withdrawPhase
    function getEpocheNumber() public view override returns(uint256) {
        uint256 epocheCounter = _epocheCounter;
        if(block.timestamp > currentEpoche.start) {
            epocheCounter += 1;
        }
        return epocheCounter;
    }

    function isWithdrawPhase() public view override returns(bool) {
        return block.timestamp < currentEpoche.start ||
               block.timestamp > currentEpoche.end;
    }

    function getCurrentWithdrawPercentage() public view returns(uint256) {
        return _withdrawPercentage;
    }

    function viewNftStats(uint256 tokenId) external view override 
        returns(
            uint104 amountStaked,
            uint48 lastTimeRewardsUpdate,
            uint104 rewardsDue,
            bool hasWithdrawnInEpoche
        )
    {
        require(_exists(tokenId), "Query for non existent Token");
        NftStats storage stats = _nftStats[tokenId];
        amountStaked           = stats.amount;
        lastTimeRewardsUpdate  = stats.lastUpdateTime;
        rewardsDue             = stats.rewardsDue;
        hasWithdrawnInEpoche   = stats.hasWithdrawnInEpoche[getEpocheNumber()];
    }

    function getAmount(uint256 tokenId) external view override returns(uint104) {
        return _nftStats[tokenId].amount;
    }

    function getRewardsDue(uint256 tokenId) external view override returns(uint104) {
        return _nftStats[tokenId].rewardsDue;
    }

    function getUpdatedRewardsDue(uint256 tokenId) external view override returns(uint256) {
        NftStats storage stats = _nftStats[tokenId];
        uint104 amount = stats.amount;
        uint48 lastUpdateTime = stats.lastUpdateTime;
        uint104 rewardsDue = stats.rewardsDue;
        uint256 _lastTimeApplicable = _lastTimeRewardApplicable();
        if(_lastTimeApplicable > lastUpdateTime) {
            rewardsDue += uint104(
                (_lastTimeApplicable - lastUpdateTime) * amount * _rewardPerTokenAndYear / SECONDS_PER_YEAR
            );
        }
        return rewardsDue;
    }

    function getWithdrawableAmount(uint256 tokenId) external view override returns(uint256) {
        if(!_nftStats[tokenId].hasWithdrawnInEpoche[getEpocheNumber()]) {
           return _withdrawPercentage * _nftStats[tokenId].amount / BILLION_PRECISION_POINTS; 
        }
        revert("tokenId has already withdrawn this epoche");
    }

    function getBotBalance() external view returns(int256) {
        return _totalBotBalance;
    }

    function isBot(address bot) external view returns(bool) {
        return _isBot[bot];
    }

    function isRegisteredBot(address bot) external view returns(bool) {
        return _isRegistered[bot];
    }
}