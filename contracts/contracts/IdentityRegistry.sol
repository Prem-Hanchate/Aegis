// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract IdentityRegistry is Ownable {
    constructor(address initialOwner) Ownable(initialOwner) {}
}
