// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract ERC20RewardMock is ERC20 {

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 10000000000 ether);
    }

    function mint(uint256 amountInEther) public {
        _mint(msg.sender, amountInEther * 10 ** 18);
    }
}