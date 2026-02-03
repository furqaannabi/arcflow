// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PayrollIntent Struct for ArcFlow
struct PayrollIntent {
    uint256 amount;
    uint256 payrollDate;
    uint32 destinationDomain; // Circle domain (Arc = 26)
    address recipient; // ArcPayrollDistributor on Arc
    uint256 nonce;
}

/// @title EmployerDeposit Struct for ArcFlow
struct EmployerDeposit {
    uint256 principal;
    uint256 depositTimestamp;
    bool inLiquidity;
}
