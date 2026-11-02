// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TransferVault} from "../src/TransferVault.sol";

contract TransferVaultTest is Test {
    event TransferRecorded(address indexed sender, address indexed recipient, uint256 amount, uint256 timestamp);

    TransferVault vault;

    function setUp() public {
        vault = new TransferVault();
    }

    function testInitialState() public view {
        assertEq(vault.owner(), address(this));
        assertEq(vault.transactionCount(), 0);
    }

    function testRecordTransfer() public {
        vm.expectEmit(true, true, false, true);
        emit TransferRecorded(address(this), address(0x123), 100, block.timestamp);
        vault.recordTransfer(address(0x123), 100);

        assertEq(vault.transactionCount(), 1);
    }

    function testCannotRecordZeroAmount() public {
        vm.expectRevert("Amount must be positive");

        vault.recordTransfer(address(0x123), 0);
        assertEq(vault.transactionCount(), 0);
    }

    function testCannotUseZeroAddress() public {
        vm.expectRevert("Invalid recipient");

        vault.recordTransfer(address(0), 100);
        assertEq(vault.transactionCount(), 0);
    }
}
