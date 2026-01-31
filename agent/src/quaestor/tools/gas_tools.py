from crewai.tools import BaseTool
from typing import Type
from pydantic import BaseModel, Field
import os
import requests
from dotenv import load_dotenv

load_dotenv()

ALCHEMY_API_KEY = os.getenv("ALCHEMY_API_KEY")

CHAIN_RPC = {
    1: f"https://eth-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    42161: f"https://arb-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    10: f"https://opt-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    8453: f"https://base-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    137: f"https://polygon-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    11155111: f"https://eth-sepolia.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    5042002: f"https://arc-testnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    84532: f"https://base-sepolia.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
}

CHAIN_THRESHOLDS = {
    1: {"optimal": 25, "max": 50},
    42161: {"optimal": 0.1, "max": 0.5},
    10: {"optimal": 0.1, "max": 0.5},
    8453: {"optimal": 0.1, "max": 0.5},
    137: {"optimal": 100, "max": 300},
    11155111: {"optimal": 5, "max": 10},
    5042002: {"optimal": 0.1, "max": 0.5},
}


class GasToolInput(BaseModel):
    """Input schema for GasTool."""
    chain_id: int = Field(..., description="Blockchain chain ID (e.g., 1 for Base-sepolia, 84532 for Base)")


class GasTools(BaseTool):
    name: str = "Gas Price Checker"
    description: str = "Checks current gas prices on blockchain networks and determines if conditions are optimal for transaction execution."
    args_schema: Type[BaseModel] = GasToolInput

    def _run(self, chain_id: int) -> dict:
        """Check gas price and return execution recommendation"""
        rpc_url = CHAIN_RPC.get(chain_id)
        if not rpc_url:
            return {"error": f"Unsupported chain ID: {chain_id}"}

        try:
            payload = {"jsonrpc": "2.0", "method": "eth_gasPrice", "params": [], "id": 1}
            response = requests.post(rpc_url, json=payload, timeout=10)
            gas_price_wei = int(response.json()["result"], 16)
            current_gas = gas_price_wei / 1e9
        except Exception as e:
            return {"error": str(e)}

        thresholds = CHAIN_THRESHOLDS.get(chain_id, {"optimal": 25, "max": 50})
        
        if current_gas <= thresholds["optimal"]:
            decision = "EXECUTE"
        elif current_gas <= thresholds["max"]:
            decision = "WAIT"
        else:
            decision = "WAIT_URGENT"
            
        return {"decision": decision, "gas": current_gas, "chain_id": chain_id}