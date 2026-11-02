// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TransferVault {
    address public owner;
    uint256 public transactionCount;

    event TransferRecorded(address indexed sender, address indexed recipient, uint256 amount, uint256 timestamp);

    constructor() {
        owner = msg.sender;
    }

    function recordTransfer(address recipient, uint256 amount) external {
        require(recipient != address(0), "Invalid recipient");

        require(amount > 0, "Amount must be positive");

        transactionCount++;

        emit TransferRecorded(msg.sender, recipient, amount, block.timestamp);
    }
}
