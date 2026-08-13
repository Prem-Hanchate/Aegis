// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract AegisRegistry is Ownable {
    string private constant VERSION = "0.1.0";

    event RegistryInitialized(address indexed owner);

    constructor(address initialOwner) Ownable(initialOwner) {
        emit RegistryInitialized(initialOwner);
    }

    function version() external pure returns (string memory) {
        return VERSION;
    }
}
