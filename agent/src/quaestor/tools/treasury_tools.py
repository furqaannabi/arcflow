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