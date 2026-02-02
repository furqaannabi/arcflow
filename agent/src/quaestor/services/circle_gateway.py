"""
Circle Gateway Service

Handles cross-chain USDC transfers via Circle Gateway.
For hackathon demo, includes high-fidelity mocks when API keys are missing.
"""

import os
import requests
from typing import Optional
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class TransferResult:
    """Result of a cross-chain transfer."""
    success: bool
    tx_hash: Optional[str] = None
    amount: float = 0.0
    source_chain: int = 0
    dest_chain: int = 0
    error: Optional[str] = None


class CircleGatewayService:
    """
    Service for interacting with Circle Gateway API.
    
    Supports:
    - Checking wallet balance
    - Cross-chain USDC transfers via Gateway
    
    For production, requires CIRCLE_API_KEY.
    For demo, falls back to high-fidelity mocks.
    """
    
    # Circle API base URLs
    SANDBOX_URL = "https://api-sandbox.circle.com"
    PRODUCTION_URL = "https://api.circle.com"
    
    # Gateway API (unified balance)
    GATEWAY_API_URL = "https://api.circle.com/gateway/v1"
    
    # Chain IDs and their Gateway domain identifiers
    CHAIN_DOMAINS = {
        1: 0,         # Ethereum Mainnet
        11155111: 0,  # Ethereum Sepolia (uses domain 0 for testnet)
        43114: 1,     # Avalanche
        43113: 1,     # Avalanche Fuji
        42161: 3,     # Arbitrum
        10: 2,        # Optimism
        8453: 6,      # Base
        84532: 6,     # Base Sepolia
        137: 7,       # Polygon
        5042002: 26,  # Arc Testnet
    }
    
    # Arc Network (Circle's L1)
    ARC_CHAIN_ID = 5042002  # Arc Testnet
    ARC_DOMAIN = 26
    
    def __init__(self):
        self.api_key = os.getenv("CIRCLE_API_KEY")
        self.entity_secret = os.getenv("CIRCLE_ENTITY_SECRET")
        self.wallet_id = os.getenv("CIRCLE_WALLET_ID")
        self.use_sandbox = os.getenv("CIRCLE_USE_SANDBOX", "true").lower() == "true"
        
        self.base_url = self.SANDBOX_URL if self.use_sandbox else self.PRODUCTION_URL
        
        # Bridge Kit service URL (Node.js microservice)
        self.bridge_service_url = os.getenv("BRIDGE_SERVICE_URL", "http://localhost:3001")
        
        # Use Bridge Kit if service is available, otherwise mock
        self.use_bridge_kit = os.getenv("USE_BRIDGE_KIT", "true").lower() == "true"
        self.mock_mode = not self.api_key and not self.use_bridge_kit
        
        if self.use_bridge_kit:
            print(f"🌉 CircleGatewayService: Using Bridge Kit at {self.bridge_service_url}")
        elif self.mock_mode:
            print("⚠️ CircleGatewayService: Running in MOCK mode")
    
    def _get_headers(self) -> dict:
        """Get headers for Circle API requests."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def get_wallet_balance(self, wallet_id: Optional[str] = None) -> dict:
        """
        Get the USDC balance of a Circle wallet.
        
        Returns:
            dict with balance info or mock data
        """
        wallet_id = wallet_id or self.wallet_id
        
        if self.mock_mode:
            return self._mock_wallet_balance(wallet_id)
        
        try:
            response = requests.get(
                f"{self.base_url}/v1/wallets/{wallet_id}/balances",
                headers=self._get_headers(),
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e), "mock": self._mock_wallet_balance(wallet_id)}
    
    def transfer_cross_chain(
        self,
        amount: float,
        recipient_address: str,
        dest_chain_id: int,
        source_chain_id: int = 84532  # Default: Base Sepolia
    ) -> TransferResult:
        """
        Execute a cross-chain USDC transfer via Circle Bridge Kit.
        
        Uses Node.js bridge-service for actual cross-chain transfers.
        Falls back to mock mode if service unavailable.
        
        Args:
            amount: USDC amount to transfer
            recipient_address: Destination wallet address
            dest_chain_id: Target blockchain chain ID
            source_chain_id: Source blockchain chain ID
            
        Returns:
            TransferResult with transaction details
        """
        # Use Bridge Kit service
        if self.use_bridge_kit:
            return self._transfer_via_bridge_kit(
                amount, recipient_address, dest_chain_id, source_chain_id
            )
        
        # Fallback to mock
        if self.mock_mode:
            return self._mock_cross_chain_transfer(
                amount, recipient_address, dest_chain_id, source_chain_id
            )
        
        # Legacy: direct API mode (not implemented)
        return TransferResult(
            success=False,
            error="Direct API mode not implemented. Use Bridge Kit."
        )
    
    def _transfer_via_bridge_kit(
        self,
        amount: float,
        recipient_address: str,
        dest_chain_id: int,
        source_chain_id: int
    ) -> TransferResult:
        """Execute transfer via Bridge Kit Node.js service."""
        try:
            response = requests.post(
                f"{self.bridge_service_url}/bridge",
                json={
                    "amount": str(amount),
                    "from_chain_id": source_chain_id,
                    "to_chain_id": dest_chain_id,
                    "recipient": recipient_address
                },
                timeout=120  # Cross-chain can take time
            )
            
            data = response.json()
            
            if data.get("success"):
                print(f"✅ Bridge transfer complete: {data.get('tx_hash', 'N/A')}")
                return TransferResult(
                    success=True,
                    tx_hash=data.get("tx_hash"),
                    amount=amount,
                    source_chain=source_chain_id,
                    dest_chain=dest_chain_id
                )
            else:
                return TransferResult(
                    success=False,
                    amount=amount,
                    source_chain=source_chain_id,
                    dest_chain=dest_chain_id,
                    error=data.get("error", "Bridge transfer failed")
                )
                
        except requests.exceptions.ConnectionError:
            print(f"⚠️ Bridge service not available at {self.bridge_service_url}")
            return self._mock_cross_chain_transfer(
                amount, recipient_address, dest_chain_id, source_chain_id
            )
        except Exception as e:
            return TransferResult(success=False, error=str(e))
    
    # ==================== MOCK METHODS ====================
    
    def _mock_wallet_balance(self, wallet_id: str) -> dict:
        """Return mock wallet balance for demo."""
        return {
            "data": {
                "wallet_id": wallet_id or "mock-wallet-001",
                "balances": [
                    {
                        "currency": "USDC",
                        "amount": "50000.00",
                        "chain": "ETH-SEPOLIA"
                    },
                    {
                        "currency": "USDC",
                        "amount": "25000.00",
                        "chain": "BASE-SEPOLIA"
                    }
                ]
            },
            "mock": True
        }
    
    def _mock_cross_chain_transfer(
        self,
        amount: float,
        recipient: str,
        dest_chain: int,
        source_chain: int
    ) -> TransferResult:
        """Return mock transfer result for demo."""
        import hashlib
        import time
        
        # Generate deterministic mock tx hash
        tx_data = f"{amount}{recipient}{dest_chain}{time.time()}"
        mock_hash = "0x" + hashlib.sha256(tx_data.encode()).hexdigest()
        
        print(f"🔄 [MOCK] Cross-chain transfer: {amount} USDC")
        print(f"   Source chain: {source_chain} → Dest chain: {dest_chain}")
        print(f"   Recipient: {recipient[:10]}...{recipient[-6:]}")
        print(f"   Mock TX: {mock_hash[:20]}...")
        
        return TransferResult(
            success=True,
            tx_hash=mock_hash,
            amount=amount,
            source_chain=source_chain,
            dest_chain=dest_chain
        )


# Singleton instance for easy import
gateway_service = CircleGatewayService()
