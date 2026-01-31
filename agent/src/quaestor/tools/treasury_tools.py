from crewai.tools import BaseTool
from typing import Type
from pydantic import BaseModel, Field
import os
from dotenv import load_dotenv

load_dotenv()

PROTOCOL_FEE_PERCENT = 0.05


class TreasuryPositionInput(BaseModel):
    """Input schema for getting treasury position."""
    pool_address: str = Field(..., description="Uniswap v4 pool contract address")
    owner_address: str = Field(..., description="Wallet address that owns the LP position")


class DistributionInput(BaseModel):
    """Input schema for calculating distribution."""
    principal: float = Field(..., description="Principal amount in USDC")
    yield_earned: float = Field(..., description="Yield earned from LP fees")
    recipient_count: int = Field(..., description="Number of recipients to pay")


class TreasuryPositionTool(BaseTool):
    name: str = "Treasury Position Checker"
    description: str = "Gets current treasury position for a Uniswap v4 LP position including principal and yield."
    args_schema: Type[BaseModel] = TreasuryPositionInput

    def _run(self, pool_address: str, owner_address: str) -> dict:
        # TODO: Query actual Uniswap v4 pool
        return {
            "pool_address": pool_address,
            "owner_address": owner_address,
            "principal": 50000.00,
            "yield_earned": 150.00,
            "total": 50150.00,
            "chain_id": 8453,
            "token": "USDC"
        }


class DistributionCalculatorTool(BaseTool):
    name: str = "Distribution Calculator"
    description: str = "Calculates payroll distribution amounts, deducting protocol fees from yield."
    args_schema: Type[BaseModel] = DistributionInput

    def _run(self, principal: float, yield_earned: float, recipient_count: int) -> dict:
        protocol_fee = yield_earned * PROTOCOL_FEE_PERCENT
        distributable_yield = yield_earned - protocol_fee
        total_to_distribute = principal + distributable_yield
        per_recipient = total_to_distribute / recipient_count if recipient_count > 0 else 0

        return {
            "total_to_distribute": total_to_distribute,
            "protocol_fee": protocol_fee,
            "per_recipient": per_recipient,
            "recipient_count": recipient_count
        }

class GetPayrollDetailsInput(BaseModel):
    """Input for fetching payroll details from contract."""
    payroll_id: str = Field(..., description="Payroll/payment ID from the smart contract")
    contract_address: str = Field(..., description="Payroll smart contract address")


class GetPayrollDetailsTool(BaseTool):
    name: str = "Get Payroll Details"
    description: str = "Calls smart contract to get list of recipients and amounts for a payroll ID."
    args_schema: Type[BaseModel] = GetPayrollDetailsInput

    def _run(self, payroll_id: str, contract_address: str) -> dict:
        # TODO: Call actual smart contract
        # Mock response for now:
        recipients = [
            {"address": "0xEmployee1...", "amount": 1000.00},
            {"address": "0xEmployee2...", "amount": 1500.00},
            {"address": "0xEmployee3...", "amount": 1200.00},
        ]
        total_required = sum(r["amount"] for r in recipients)
        return {
            "payroll_id": payroll_id,
            "recipients": recipients,
            "total_required": total_required,
            "recipient_count": len(recipients)
        }


class CheckFundsSufficiencyInput(BaseModel):
    """Input for checking if funds cover payroll."""
    available_funds: float = Field(..., description="Total available in treasury")
    required_amount: float = Field(..., description="Total required for payroll")


class CheckFundsSufficiencyTool(BaseTool):
    name: str = "Check Funds Sufficiency"
    description: str = "Checks if treasury has enough funds to cover payroll."
    args_schema: Type[BaseModel] = CheckFundsSufficiencyInput

    def _run(self, available_funds: float, required_amount: float) -> dict:
        is_sufficient = available_funds >= required_amount
        shortfall = max(0, required_amount - available_funds)
        return {
            "is_sufficient": is_sufficient,
            "available": available_funds,
            "required": required_amount,
            "shortfall": shortfall
        }