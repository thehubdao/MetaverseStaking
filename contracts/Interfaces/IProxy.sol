// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


interface IProxy {

    function upgradeToAndCall(address newImplementation, bytes memory data) external;

    function appointNewUpgrader(address newUpgrader) external;
}