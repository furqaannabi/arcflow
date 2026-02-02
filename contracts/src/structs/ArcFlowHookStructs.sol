// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct DepositData {
    address tokenA;
    address tokenB;
    uint256 amountA;
    uint256 amountB;
    uint256 timestamp;
}