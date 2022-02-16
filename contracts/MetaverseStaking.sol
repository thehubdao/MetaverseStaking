// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

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
    uint256 private _withdrawPeriod;

    address public MGH_TOKEN;
    address public currency;
    uint256 private _totalAmountStaked;
    uint256 private _withdrawPercentage;
    uint256 private _rewardPerTokenAndSecond;
    uint256 private _pendingRewardRate;

    //counter for ordered minting
    uint256 private _idCounter;

    uint256 private _epocheCounter;
    Epoche public currentEpoche;

    struct Epoche {
        uint256 start;
        uint256 end;
        uint256 lastEnd;
    }

    mapping(uint256 => NftStats) private _nftStats;

    int256 totalBotBalance;
    mapping(address => bool) private _isBot;
    mapping(address => bool) private _isRegisteredBot;

    constructor() initializer {}

    function initialize(
        address mghToken,
        address _currency,
        uint256 _firstEpocheStart,
        uint256 _firstEpocheLength,
        uint256 __withdrawPeriod,
        uint256 __rewardPerTokenAndSecond,
        string calldata name,
        string calldata symbol,
        string calldata baseUri
    ) public initializer {
        __Ownable_init();
        __ERC721_init(name, symbol, baseUri);
        MGH_TOKEN = mghToken;
        currency = _currency;
        if(_firstEpocheStart == 0) _firstEpocheStart = block.timestamp + __withdrawPeriod;
        currentEpoche = Epoche(_firstEpocheStart, _firstEpocheStart + _firstEpocheLength, block.timestamp);
        _withdrawPeriod = __withdrawPeriod;
        _rewardPerTokenAndSecond = __rewardPerTokenAndSecond;
        _withdrawPercentage = BILLION_PRECISION_POINTS;
    }

    function approveAndCallHandlerDeposit(address _sender, uint256 amount) external override {
        require(msg.sender == currency);
        _depositFor(_sender, amount);
    }

    function approveAndCallHandlerIncrease(address _sender, uint256 tokenId, uint256 amount) external override {
        require(msg.sender == currency);
        _increasePositionFor(_sender, tokenId, amount);
    }

    function deposit(uint256 amount) external override {
        require(amount != 0, "amount != 0");
        _depositFor(msg.sender, amount);
    }

    function increasePosition(uint256 tokenId, uint256 amount) external override {
        require(amount != 0, "amount != 0");
        _increasePositionFor(msg.sender, tokenId, amount);
    }

    function withdraw(uint256 tokenId, uint256 amount) external override {
        require(amount != 0, "amount != 0");
        require(isWithdrawPhase(), "not withdraw time");
        _updateStakingRewardsAndCheckOwner(tokenId);

        NftStats storage stats = _nftStats[tokenId];

        // if not enough funds are available, check that user only withdraws their part and only once in this epoche
        uint256 percentage = _withdrawPercentage;
        if(percentage != BILLION_PRECISION_POINTS) {
            uint256 epocheNumber = getEpocheNumber();
            require(!stats.hasWithdrawnInEpoche[epocheNumber], "only one withdraw per epoche");
            stats.hasWithdrawnInEpoche[epocheNumber] = true;
            require(amount <= stats.amount * percentage / BILLION_PRECISION_POINTS);
        }

        _totalAmountStaked -= amount;
        stats.amount -= uint104(amount);

        IERC20(currency).safeTransfer(msg.sender, amount);

        emit Withdrawn(tokenId, msg.sender, amount);
    }

    function getRewards(uint256 tokenId) external override {
        _updateStakingRewards(tokenId);
        address tokenOwner = ownerOf(tokenId);
        uint256 rewardsDue = _nftStats[tokenId].rewardsDue;
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

    function nextEpoche(uint256 _pedingRewardRate, uint256 length) external onlyOwner {
        require(block.timestamp > currentEpoche.end, "only once in withdraw Phase");
        currentEpoche = Epoche(
            block.timestamp + _withdrawPeriod,
            block.timestamp + _withdrawPeriod + length,
            currentEpoche.end
        );
        _pendingRewardRate = _pedingRewardRate;
        _epocheCounter += 1;
        emit NewEpoche(currentEpoche.start, currentEpoche.end, _pedingRewardRate);
    }

    function applyNewRewardRate() external onlyOwner {
        require(!isWithdrawPhase(), "can only apply when withdraw ended");
        require(_pendingRewardRate != 0, "no pending rewardRate");
        _rewardPerTokenAndSecond = _pendingRewardRate;
        _pendingRewardRate = 0;
    }

    function rescueToken(address token) external onlyOwner {
        require(token != currency);
        IERC20(token).transfer(msg.sender, IERC20(token).balanceOf(address(this)));
    }

    // Bot related //
    function addBot(address account) external onlyOwner {
        require(!_isBot[account], "already exists");
        _isBot[account] = true;
        emit botAdded(account);
    }

    function removeBot(address account) external onlyOwner {
        require(_isBot[account], "not a bot");
        _isBot[account] = false;
        _isRegisteredBot[account] = false;
        emit botRemoved(account);
    }

    function withdrawLiquidityToBot(address recipient, uint256 amount) external onlyOwner {
        require(_isRegisteredBot[recipient], "recipient must be a registered bot");
        require(!isWithdrawPhase());
        totalBotBalance -= int256(amount);
        IERC20(currency).transfer(recipient, amount);
        _updateWithdrawPercentage();
        emit WithdrawToBot(recipient, amount);
    }

    function depositFromBot(address bot, uint256 amount) external {
        require(_isRegisteredBot[bot], "can only deposit from bot");
        require(msg.sender == bot || msg.sender == owner());
        require(!isWithdrawPhase());
        IERC20(currency).transferFrom(bot, address(this), amount);
        totalBotBalance += int256(amount);
        _updateWithdrawPercentage();
        emit DepositFromBot(bot, amount);
    }

    function registerAsBot() external {
        require(_isBot[msg.sender], "only whitelisted bots can register");
        require(IERC20(currency).allowance(msg.sender, address(this)) >= 2**255, "approve Spending first");
        _isRegisteredBot[msg.sender] == true;
        emit BotRegistered(msg.sender);
    }

    ////////////////        Internal      ///////////////////

    function _depositFor(address from, uint256 amount) internal {
        IERC20(currency).safeTransferFrom(from, address(this), amount);

        uint256 mintedId = _mint(from);

        NftStats storage stats = _nftStats[mintedId];
        stats.amount = uint104(amount);
        stats.lastUpdateTime = uint48(block.timestamp);

        _totalAmountStaked += amount;

        emit Deposit(mintedId, from, amount);
    }

    function _increasePositionFor(address _sender, uint256 tokenId, uint256 amount) internal {
        _updateStakingRewardsAndCheckOwner(tokenId);
        IERC20(currency).safeTransferFrom(_sender, address(this), amount);

        _nftStats[tokenId].amount += uint104(amount);
        _totalAmountStaked += amount;

        emit PositionIncreased(tokenId, msg.sender, amount);
    }

    function _mint(address recipient) internal returns(uint256 mintedId) {
        mintedId = _idCounter;
        _safeMint(recipient, mintedId);
        _idCounter += 1;
    }

    function _updateWithdrawPercentage() internal {
        uint256 totalAmountStaked = _totalAmountStaked;
        if(totalAmountStaked == 0) {
            _withdrawPercentage = BILLION_PRECISION_POINTS;
            return;
        }
        _withdrawPercentage = totalBotBalance >= 0
            ? BILLION_PRECISION_POINTS
            : uint256(int256(totalAmountStaked) + totalBotBalance) * BILLION_PRECISION_POINTS / totalAmountStaked;
    }

    function _updateStakingRewardsAndCheckOwner(uint256 tokenId) internal {
        require(msg.sender == ownerOf(tokenId), "not your nft");
        _updateStakingRewards(tokenId);
    }

    function _updateStakingRewards(uint256 tokenId) internal {
        NftStats storage stats = _nftStats[tokenId];
        uint256 _lastTimeApplicable = _lastTimeRewardApplicable();
        if(_lastTimeApplicable > stats.lastUpdateTime) {
            stats.rewardsDue += uint48((_lastTimeApplicable - stats.lastUpdateTime) * stats.amount * _rewardPerTokenAndSecond);
        }
        //alternatively do the next line in the if statement.
        //would lead to exploit, where people earn while nothing is staked during withdraw phase
        stats.lastUpdateTime = uint48(block.timestamp);
    }

    function _lastTimeRewardApplicable() internal view returns(uint256) {
        Epoche memory epoche = currentEpoche;
        if(block.timestamp < epoche.start) {
            return epoche.lastEnd;
        }
        if(block.timestamp > epoche.end) {
            return epoche.end;
        }
        return block.timestamp;
    }

    ////////////////    Views    ////////////////

    function getTotalAmountStaked() external view override returns(uint256) {
        return _totalAmountStaked;
    }

    function getRewardRate() external view override returns(uint256) {
        return _rewardPerTokenAndSecond;
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
        ) {
        require(_exists(tokenId), "Query for non existent Token");
        NftStats storage stats = _nftStats[tokenId];
        amountStaked          = stats.amount;
        lastTimeRewardsUpdate = stats.lastUpdateTime;
        rewardsDue            = stats.rewardsDue;
        hasWithdrawnInEpoche  = stats.hasWithdrawnInEpoche[getEpocheNumber()];
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
        if(_lastTimeApplicable > stats.lastUpdateTime) {
            rewardsDue += uint104((_lastTimeApplicable - lastUpdateTime) * amount * _rewardPerTokenAndSecond);
        }
        return rewardsDue;
    }

    function getWithdrawableAmount(uint256 tokenId) external view override returns(uint256) {
        if(!_nftStats[tokenId].hasWithdrawnInEpoche[getEpocheNumber()]) {
           return _withdrawPercentage * _nftStats[tokenId].amount / BILLION_PRECISION_POINTS; 
        }
        revert("tokenId has already withdrawn this epoche");
    }
}