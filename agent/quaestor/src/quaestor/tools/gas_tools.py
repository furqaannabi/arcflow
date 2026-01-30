import os
import requests
from dotenv import load_dotenv

load_dotenv()

ALCHEMY_API_KEY = os.getenv("ALCHEMY_API_KEY")

# Chain ID -> Alchemy RPC URL mapping
CHAIN_RPC = {
    1: f"https://eth-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    42161: f"https://arb-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    10: f"https://opt-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    8453: f"https://base-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    137: f"https://polygon-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    11155111: f"https://eth-sepolia.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
}

# Thresholds per chain (in gwei)
CHAIN_THRESHOLDS = {
    1: {"execute": 25, "wait": 50},        # Ethereum
    42161: {"execute": 0.1, "wait": 0.5},  # Arbitrum
    10: {"execute": 0.1, "wait": 0.5},     # Optimism
    8453: {"execute": 0.1, "wait": 0.5},   # Base
    137: {"execute": 100, "wait": 300},    # Polygon
    11155111:{"execute": 5, "wait": 10},    # Sepolia
}


class GasTools:

    def __init__(self)-> None:
        self.chain_rpc = CHAIN_RPC
        self.chain_thresholds = CHAIN_THRESHOLDS

    def get_current_gas_price(self, chain_id: int) -> float:
        """Get current gas price for a chain"""
        rpc_url = self.chain_rpc.get(chain_id)
        
        if not rpc_url:
            raise ValueError(f"Unsupported chain ID: {chain_id}")

        payload = {
            "jsonrpc": "2.0",
            "method": "eth_gasPrice",
            "params": [],
            "id": 1
        }

        try:
            response = requests.post(rpc_url, json=payload, timeout=10)
            response.raise_for_status()
            gas_price_wei = int(response.json()["result"], 16)
            gas_price_gwei = gas_price_wei / 1e9
            return gas_price_gwei
        except Exception as e:
            raise RuntimeError(f"Failed to get gas price for chain {chain_id}: {e}")

    def should_execute(self, chain_id: int) -> dict:
        """Check gas and return execution decision"""
        current_gas = self.get_current_gas_price(chain_id)
        thresholds = self.chain_thresholds.get(chain_id, {"execute": 25, "wait": 50})
        
        #check if gas price is within threshold
        if current_gas <= thresholds["execute"]:
            return {"decision": "EXECUTE", "gas": current_gas}
        elif current_gas <= thresholds["wait"]:
            return {"decision": "WAIT", "gas": current_gas}
        else:
            return {"decision": "WAIT_URGENT", "gas": current_gas}
        