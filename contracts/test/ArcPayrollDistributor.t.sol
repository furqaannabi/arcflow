// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ArcPayrollDistributor} from "../src/ArcPayrollDistributor.sol";
import {
    PayrollRecipient
} from "../src/structs/ArcPayrollDistributorStructs.sol";

contract ArcPayrollDistributorTest is Test {
    ArcPayrollDistributor distributor;

    address owner = address(this);
    address agent = address(0xA6E47);
    address employee1 = address(0xE001);
    address employee2 = address(0xE002);
    address employee3 = address(0xE003);

    function setUp() public {
        distributor = new ArcPayrollDistributor();
        distributor.setAgentAuthorization(agent, true);

        console.log("=== Setup Complete ===");
        console.log("Distributor:", address(distributor));
        console.log("Agent:", agent);
    }

    /// @notice Test: Execute payroll with multiple recipients
    function test_ExecutePayroll() public {
        console.log("\n=== Test: Execute Payroll ===\n");

        // Create recipients
        PayrollRecipient[] memory recipients = new PayrollRecipient[](3);
        recipients[0] = PayrollRecipient({wallet: employee1, amount: 1 ether});
        recipients[1] = PayrollRecipient({wallet: employee2, amount: 2 ether});
        recipients[2] = PayrollRecipient({
            wallet: employee3,
            amount: 0.5 ether
        });

        uint256 totalAmount = 3.5 ether;

        // Record balances before
        uint256 emp1Before = employee1.balance;
        uint256 emp2Before = employee2.balance;
        uint256 emp3Before = employee3.balance;

        console.log("1. Executing payroll...");
        console.log("   Total:", totalAmount);

        // Execute as agent
        vm.prank(agent);
        vm.deal(agent, totalAmount);
        uint256 batchId = distributor.executePayroll{value: totalAmount}(
            recipients
        );

        console.log("   Batch ID:", batchId);

        // Verify balances
        assertEq(
            employee1.balance - emp1Before,
            1 ether,
            "Employee1 should receive 1 ETH"
        );
        assertEq(
            employee2.balance - emp2Before,
            2 ether,
            "Employee2 should receive 2 ETH"
        );
        assertEq(
            employee3.balance - emp3Before,
            0.5 ether,
            "Employee3 should receive 0.5 ETH"
        );

        console.log("2. Employees received:");
        console.log("   Employee1:", employee1.balance - emp1Before);
        console.log("   Employee2:", employee2.balance - emp2Before);
        console.log("   Employee3:", employee3.balance - emp3Before);

        console.log("\n=== Test Passed ===");
    }

    /// @notice Test: Only authorized agent can execute
    function test_OnlyAgentCanExecute() public {
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: employee1, amount: 1 ether});

        address randomUser = address(0x12345);
        vm.deal(randomUser, 1 ether);

        // Should revert for non-agent
        vm.prank(randomUser);
        vm.expectRevert(ArcPayrollDistributor.UnauthorizedAgent.selector);
        distributor.executePayroll{value: 1 ether}(recipients);

        console.log("Non-agent correctly blocked");
    }

    /// @notice Test: Owner can execute
    function test_OwnerCanExecute() public {
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: employee1, amount: 1 ether});

        vm.deal(owner, 1 ether);
        uint256 batchId = distributor.executePayroll{value: 1 ether}(
            recipients
        );

        assertEq(batchId, 1, "Batch ID should be 1");
        assertEq(employee1.balance, 1 ether, "Employee should receive payment");
        console.log("Owner successfully executed payroll");
    }

    /// @notice Test: Reverts if msg.value doesn't match total
    function test_RevertIfInsufficientValue() public {
        PayrollRecipient[] memory recipients = new PayrollRecipient[](2);
        recipients[0] = PayrollRecipient({wallet: employee1, amount: 1 ether});
        recipients[1] = PayrollRecipient({wallet: employee2, amount: 1 ether});

        vm.deal(agent, 1 ether); // Only sending 1 ETH for 2 ETH payroll

        vm.prank(agent);
        vm.expectRevert(ArcPayrollDistributor.InsufficientBalance.selector);
        distributor.executePayroll{value: 1 ether}(recipients);

        console.log("Correctly reverted on insufficient value");
    }

    /// @notice Test: Reverts on empty recipients
    function test_RevertOnEmptyRecipients() public {
        PayrollRecipient[] memory recipients = new PayrollRecipient[](0);

        vm.prank(agent);
        vm.expectRevert(ArcPayrollDistributor.EmptyRecipients.selector);
        distributor.executePayroll{value: 0}(recipients);

        console.log("Correctly reverted on empty recipients");
    }

    /// @notice Test: Agent authorization
    function test_AgentAuthorization() public {
        address newAgent = address(0xABCD);

        assertFalse(distributor.isAuthorizedAgent(newAgent));

        distributor.setAgentAuthorization(newAgent, true);
        assertTrue(distributor.isAuthorizedAgent(newAgent));

        distributor.setAgentAuthorization(newAgent, false);
        assertFalse(distributor.isAuthorizedAgent(newAgent));

        console.log("Agent authorization works correctly");
    }

    /// @notice Test: Batch ID increments
    function test_BatchIdIncrements() public {
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({
            wallet: employee1,
            amount: 0.1 ether
        });

        vm.deal(agent, 1 ether);
        vm.startPrank(agent);

        uint256 batch1 = distributor.executePayroll{value: 0.1 ether}(
            recipients
        );
        uint256 batch2 = distributor.executePayroll{value: 0.1 ether}(
            recipients
        );
        uint256 batch3 = distributor.executePayroll{value: 0.1 ether}(
            recipients
        );

        vm.stopPrank();

        assertEq(batch1, 1);
        assertEq(batch2, 2);
        assertEq(batch3, 3);

        console.log("Batch IDs increment correctly:", batch1, batch2, batch3);
    }

    /// @notice Test: Contract can receive ETH
    function test_ReceiveEth() public {
        uint256 amount = 5 ether;
        vm.deal(owner, amount);

        (bool success, ) = address(distributor).call{value: amount}("");
        assertTrue(success, "Should receive ETH");
        assertEq(distributor.getBalance(), amount, "Balance should match");

        console.log("Contract received ETH:", amount);
    }
}
