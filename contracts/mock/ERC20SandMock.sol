// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract ERC20SandMock is ERC20 {
    
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(0x7812B090d1a3Ead77B5D8F470D3faCA900A6ccB9, 1000000 ether);
    }

    function approveAndCall(
        address target,
        uint256 amount,
        bytes calldata data
    ) external payable returns (bytes memory) {
        require(
            doFirstParamEqualsAddress(data, msg.sender),
            "first param != sender"
        );

        _approveFor(msg.sender, target, amount);

        // solium-disable-next-line security/no-call-value
        (bool success, bytes memory returnData) = target.call{ value: msg.value }(data);
        require(success, string(returnData));
        return returnData;
    }

    function _approveFor(address owner, address spender, uint256 amount)
        internal
    {
        require(
            owner != address(0) && spender != address(0),
            "Cannot approve with 0x0"
        );
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function doFirstParamEqualsAddress(bytes memory data, address _address)
        internal
        pure
        returns (bool)
    {
        if (data.length < (36 + 32)) {
            return false;
        }
        address value;
        assembly {
            value := mload(add(data, 36))
        }
        return value == _address;
    }

    function mint(uint256 amountInEther) public {
        _mint(msg.sender, amountInEther * 10 ** 18);
    }
}