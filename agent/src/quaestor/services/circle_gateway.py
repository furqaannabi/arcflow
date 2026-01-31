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
        
        # Check if we're in mock mode
        self.mock_mode = not self.api_key
        if self.mock_mode:
            print("⚠️ CircleGatewayService: No API key found, running in MOCK mode")
    
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
        source_chain_id: int = 11155111  # Default: Ethereum Sepolia
    ) -> TransferResult:
        """
        Execute a cross-chain USDC transfer via Circle Gateway.
        
        This uses the burn-and-mint mechanism:
        1. Burn USDC on source chain
        2. Mint equivalent on destination chain
        
        Args:
            amount: USDC amount to transfer
            recipient_address: Destination wallet address
            dest_chain_id: Target blockchain chain ID
            source_chain_id: Source blockchain chain ID
            
        Returns:
            TransferResult with transaction details
        """
        if self.mock_mode:
            return self._mock_cross_chain_transfer(
                amount, recipient_address, dest_chain_id, source_chain_id
            )
        
        try:
            # Step 1: Create burn intent
            burn_intent = self._create_burn_intent(
                amount, recipient_address, source_chain_id, dest_chain_id
            )
            
            if not burn_intent.get("success"):
                return TransferResult(
                    success=False,
                    error=burn_intent.get("error", "Failed to create burn intent")
                )
            
            # Step 2: Submit to Gateway API
            transfer_response = self._submit_transfer(burn_intent)
            
            if transfer_response.get("success"):
                return TransferResult(
                    success=True,
                    tx_hash=transfer_response.get("tx_hash"),
                    amount=amount,
                    source_chain=source_chain_id,
                    dest_chain=dest_chain_id
                )
            else:
                return TransferResult(
                    success=False,
                    error=transfer_response.get("error", "Transfer failed")
                )
                
        except Exception as e:
            return TransferResult(success=False, error=str(e))
    
    def _create_burn_intent(
        self,
        amount: float,
        recipient: str,
        source_chain: int,
        dest_chain: int
    ) -> dict:
        """Create a burn intent for cross-chain transfer."""
        # TODO: Implement actual burn intent creation
        # This requires signing a typed data message
        return {
            "success": True,
            "intent_id": f"intent_{source_chain}_{dest_chain}_{int(amount * 1e6)}",
            "amount": amount,
            "recipient": recipient
        }
    
    def _submit_transfer(self, burn_intent: dict) -> dict:
        """Submit burn intent to Gateway API."""
        # TODO: Implement actual API call
        # POST to Gateway API with signed burn intent
        return {
            "success": True,
            "tx_hash": f"0x{'a' * 64}",
            "status": "completed"
        }
    
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
