import sys
sys.path.insert(0, "../src")

from quaestor.tools.gas_tools import GasTools

def test_gas_tools():
    gas = GasTools()
    
    # Test on a few chains
    chains_to_test = [1, 42161, 8453, 11155111]  # ETH, Arbitrum, Base, Sepolia
    
    for chain_id in chains_to_test:
        try:
            result = gas.should_execute(chain_id)
            print(f"Chain {chain_id}: {result['decision']} (Gas: {result['gas']:.4f} gwei)")
        except Exception as e:
            print(f"Chain {chain_id}: ERROR - {e}")

if __name__ == "__main__":
    test_gas_tools()